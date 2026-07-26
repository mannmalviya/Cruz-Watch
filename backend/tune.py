"""Offline trigger tuning: run a site's clip through the real detector + primitives
as fast as the GPU allows and report exactly when each primitive fires.

Use this to verify a zone polygon and thresholds BEFORE recording the demo.

    python3 tune.py sites/coastal_steamerlane.json
    python3 tune.py sites/downtown_boardwalk.json --dwell 2.5
"""
import argparse
import json
from pathlib import Path

import cv2
from ultralytics import YOLO

from primitives import PrimitiveEngine

ap = argparse.ArgumentParser()
ap.add_argument("site")
ap.add_argument("--dwell", type=float, help="override dwell_seconds")
ap.add_argument("--max-seconds", type=float, default=180)
a = ap.parse_args()

site = json.loads(Path(a.site).read_text())
if a.dwell is not None:
    site.setdefault("thresholds", {})["dwell_seconds"] = a.dwell

cfg = site.get("detector", {})
stride = cfg.get("stride", 2)
engine = PrimitiveEngine(site)
model = YOLO("yolo11n.pt")

path = Path(__file__).parent / "clips" / site["clip"]
cap = cv2.VideoCapture(str(path))
src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0

print(f"{site['id']}  clip={site['clip']}  armed={site['armed_primitives']}")
print(f"thresholds={site.get('thresholds')}\n")

frame_i = 0
fired = []
zone_occupancy = 0
while True:
    ok, frame = cap.read()
    if not ok or frame_i / src_fps > a.max_seconds:
        break
    if frame_i % stride == 0:
        # virtual clock: primitives measure wall time, so feed them clip time
        t = frame_i / src_fps
        res = model.track(frame, imgsz=cfg.get("imgsz", 960), conf=cfg.get("conf", 0.3),
                          classes=[0], persist=True, tracker="bytetrack.yaml",
                          verbose=False)[0]
        boxes = []
        if res.boxes is not None and len(res.boxes):
            ids = (res.boxes.id.int().tolist()
                   if res.boxes.id is not None else [None] * len(res.boxes))
            for (x1, y1, x2, y2), tid, cf in zip(
                    res.boxes.xyxy.tolist(), ids, res.boxes.conf.tolist()):
                boxes.append({"track_id": tid, "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                              "conf": cf})
        from primitives import point_in_polygon
        for z in site.get("zones", []):
            zone_occupancy += sum(
                1 for b in boxes
                if b["track_id"] is not None
                and point_in_polygon((b["x1"] + b["x2"]) / 2, b["y2"], z["polygon"]))
        for f in engine.update(t, boxes):
            fired.append((t, f))
            print(f"  t={t:6.1f}s  {f['primitive']:<18} track={f['track_id']:<5} {f['detail']}")
    frame_i += 1
cap.release()

dur = frame_i / src_fps
print(f"\nclip {dur:.0f}s | {len(fired)} triggers "
      f"| zone-occupied detections {zone_occupancy}")
by = {}
for _, f in fired:
    by[f["primitive"]] = by.get(f["primitive"], 0) + 1
print("by primitive:", by or "NONE")
if fired:
    print(f"first trigger at t={fired[0][0]:.1f}s  <-- demo cue point")
