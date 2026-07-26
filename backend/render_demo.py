"""Render each site's clip through the REAL detector + primitives and write the
annotated result as an mp4, for the hosted demo site (which has no GPU backend).

The output is exactly what the live MJPEG stream shows — same model, same zones,
same alert logic — just captured to a file and labeled as a recording.

    python3 render_demo.py            # all sites -> ../web/public/demo/
"""
import json
import subprocess
import tempfile
from pathlib import Path

import cv2

from pipeline import annotate, make_model
from primitives import PrimitiveEngine

SITES = Path(__file__).parent / "sites"
CLIPS = Path(__file__).parent / "clips"
OUT = Path(__file__).parent.parent / "web" / "public" / "demo"
OUT.mkdir(parents=True, exist_ok=True)

sites_meta = []

for site_path in sorted(SITES.glob("*.json")):
    site = json.loads(site_path.read_text())
    cfg = site.get("detector", {})
    stride = cfg.get("stride", 2)
    engine = PrimitiveEngine(site)
    model = make_model()

    cap = cv2.VideoCapture(str(CLIPS / site["clip"]))
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False).name
    writer = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*"mp4v"), src_fps, (w, h))

    alert_tracks: set[int] = set()
    last_boxes: list[dict] = []
    frame_i = 0
    hazards = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_i % stride == 0:
            t = frame_i / src_fps
            res = model.track(frame, imgsz=cfg.get("imgsz", 960),
                              conf=cfg.get("conf", 0.3), classes=[0],
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
            for f in engine.update(t, boxes):
                alert_tracks.add(f["track_id"])
                hazards += 1
        writer.write(annotate(frame, site, last_boxes, alert_tracks, src_fps))
        frame_i += 1

    cap.release()
    writer.release()

    out = OUT / f"{site['id']}.mp4"
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", tmp,
         "-c:v", "libx264", "-crf", "26", "-preset", "veryfast",
         "-vf", "scale=1280:-2", "-movflags", "+faststart", "-an", str(out)],
        check=True,
    )
    Path(tmp).unlink()
    size_mb = out.stat().st_size / 1e6
    print(f"{site['id']}: {frame_i} frames, {hazards} hazards -> {out.name} ({size_mb:.1f} MB)")

    sites_meta.append({**site, "runtime": {"status": "REPLAY", "fps": round(src_fps, 1),
                                           "person_count": 0}})

(OUT / "sites.json").write_text(json.dumps(sites_meta, indent=1))
print(f"wrote {OUT / 'sites.json'}")
