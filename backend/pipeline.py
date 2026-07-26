"""Per-site detection pipeline: video source -> YOLO tracking -> primitives -> events.

The video source is a file today and a camera tomorrow; the detector cannot tell
the difference, which is the whole point of the abstraction.
"""
import asyncio
import time
import traceback
from pathlib import Path

import cv2
from ultralytics import YOLO

import agent
from events import bus, make_event
from primitives import PrimitiveEngine

CLIPS = Path(__file__).parent / "clips"
MODEL_NAME = "yolo11n.pt"

# One model instance PER SITE. ultralytics keeps tracker state on the model object,
# so sharing one instance across concurrent pipelines interleaves their frames and
# corrupts track IDs. yolo11n is ~5MB of weights; a copy per site is cheap.
def make_model() -> YOLO:
    return YOLO(MODEL_NAME)


BOX_COLOR = (110, 255, 130)
ALERT_COLOR = (50, 50, 255)


def annotate(frame, site, boxes, alert_tracks: set[int], fps: float):
    # Zones are trigger logic only — deliberately not drawn. The overlay shows
    # detections (green) and triggered tracks (red).
    out = frame.copy()
    fh = out.shape[0]
    # scale line weight with resolution so boxes stay bold at 1080p and 720p
    thick = max(3, round(fh / 300))

    for b in boxes:
        alert = b["track_id"] in alert_tracks
        c = ALERT_COLOR if alert else BOX_COLOR
        p1 = (int(b["x1"]), int(b["y1"]))
        p2 = (int(b["x2"]), int(b["y2"]))
        # dark underlay first so the bright box pops on any background
        cv2.rectangle(out, p1, p2, (0, 0, 0), thick + 2)
        cv2.rectangle(out, p1, p2, c, thick if not alert else thick + 1)
        if b["track_id"] is not None:
            label = f"{b['track_id']}"
            (tw, th), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 2)
            ly = max(p1[1] - 6, th + 4)
            cv2.rectangle(out, (p1[0] - 1, ly - th - 4), (p1[0] + tw + 6, ly + 3),
                          c, -1)
            cv2.putText(out, label, (p1[0] + 3, ly),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 2, cv2.LINE_AA)

    cv2.putText(out, f"{site['id']}  |  {len(boxes)} tracked  |  {fps:.1f} fps",
                (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
    return out


class SitePipeline:
    def __init__(self, site: dict):
        self.site = site
        self.engine = PrimitiveEngine(site)
        self.latest_jpeg: bytes | None = None
        self.fps = 0.0
        self.person_count = 0
        self.status = "MONITORING"
        self.alert_tracks: set[int] = set()
        self._task: asyncio.Task | None = None

    def start(self):
        self._task = asyncio.create_task(self._guarded_run())

    async def _guarded_run(self):
        """A pipeline task that dies silently looks identical to a quiet scene.
        Surface the failure on the event stream instead of losing it."""
        try:
            await self._run()
        except asyncio.CancelledError:
            raise
        except Exception as e:
            self.status = "ERROR"
            traceback.print_exc()
            bus.publish(make_event(
                "error", self.site["id"], "REAL_CV",
                message=f"{type(e).__name__}: {e}",
                detail="pipeline task crashed",
            ))
            raise

    async def _run(self):
        cfg = self.site.get("detector", {})
        imgsz = cfg.get("imgsz", 960)
        conf = cfg.get("conf", 0.3)
        stride = cfg.get("stride", 2)
        path = str(CLIPS / self.site["clip"])
        model = make_model()

        while True:
            cap = cv2.VideoCapture(path)
            if not cap.isOpened():
                bus.publish(make_event("error", self.site["id"], "REAL_CV",
                                       message=f"cannot open {path}"))
                await asyncio.sleep(5)
                continue

            src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            frame_i = 0
            last_boxes: list[dict] = []
            t_prev = time.time()

            while True:
                ok, frame = cap.read()
                if not ok:
                    break

                if frame_i % stride == 0:
                    res = model.track(frame, imgsz=imgsz, conf=conf, classes=[0],
                                      persist=True, tracker="bytetrack.yaml",
                                      verbose=False)[0]
                    boxes = []
                    if res.boxes is not None and len(res.boxes):
                        ids = (res.boxes.id.int().tolist()
                               if res.boxes.id is not None else [None] * len(res.boxes))
                        for (x1, y1, x2, y2), tid, cf in zip(
                                res.boxes.xyxy.tolist(), ids, res.boxes.conf.tolist()):
                            boxes.append({"track_id": tid, "x1": x1, "y1": y1,
                                          "x2": x2, "y2": y2, "conf": round(cf, 2)})
                    last_boxes = boxes

                    now = time.time()
                    findings = self.engine.update(now, boxes)
                    for f in findings:
                        self.alert_tracks.add(f["track_id"])
                        self.status = "TRIGGERED"
                        bus.publish(make_event(
                            "hazard", self.site["id"], "REAL_CV",
                            **{k: v for k, v in f.items() if k != "box"}))
                        asyncio.create_task(agent.handle_hazard(self.site, f))

                    dt = now - t_prev
                    t_prev = now
                    inst = stride / dt if dt > 0 else 0.0
                    self.fps = inst if self.fps == 0 else 0.85 * self.fps + 0.15 * inst
                    self.person_count = len(boxes)

                    bus.publish(make_event(
                        "telemetry", self.site["id"], "REAL_CV",
                        fps=round(self.fps, 1),
                        person_count=self.person_count,
                        track_ids=sorted(b["track_id"] for b in boxes
                                         if b["track_id"] is not None)[:40],
                        status=self.status,
                    ))

                img = annotate(frame, self.site, last_boxes, self.alert_tracks, self.fps)
                ok_enc, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 75])
                if ok_enc:
                    self.latest_jpeg = buf.tobytes()

                frame_i += 1
                await asyncio.sleep(max(1.0 / src_fps, 0.001))

            cap.release()
            # loop the clip; reset trigger state so the demo is repeatable
            self.engine = PrimitiveEngine(self.site)
            self.alert_tracks.clear()
            self.status = "MONITORING"
            bus.publish(make_event("clip_loop", self.site["id"], "SYNTHETIC_FOOTAGE"))
