"""Screen a candidate clip: can a person detector actually see people in it?

Usage: python3 screen_clip.py <video> [--imgsz 1280] [--conf 0.15] [--every 5]
Prints per-frame detection stats and writes annotated_<name>.jpg samples.
"""
import sys, argparse, collections
from ultralytics import YOLO
import cv2

ap = argparse.ArgumentParser()
ap.add_argument("video")
ap.add_argument("--imgsz", type=int, default=1280)
ap.add_argument("--conf", type=float, default=0.15)
ap.add_argument("--every", type=int, default=5)
ap.add_argument("--model", default="yolo11n.pt")
a = ap.parse_args()

model = YOLO(a.model)
cap = cv2.VideoCapture(a.video)
w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

counts, heights, best = [], [], (-1, None, 0)
i = 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    if i % a.every == 0:
        r = model.predict(frame, imgsz=a.imgsz, conf=a.conf, classes=[0], verbose=False)[0]
        n = len(r.boxes)
        counts.append(n)
        for b in r.boxes.xyxy.tolist():
            heights.append(b[3] - b[1])
        if n > best[2]:
            best = (i, r.plot(), n)
    i += 1
cap.release()

frames = len(counts)
hit = sum(1 for c in counts if c > 0)
heights.sort()
print(f"resolution      {w}x{h}   frames sampled {frames} (every {a.every})")
print(f"frames with >=1 person   {hit}/{frames}  ({100*hit/max(frames,1):.0f}%)")
print(f"persons per frame        mean {sum(counts)/max(frames,1):.1f}  max {max(counts, default=0)}")
if heights:
    print(f"box height px            p10 {heights[len(heights)//10]:.0f}  "
          f"median {heights[len(heights)//2]:.0f}  p90 {heights[9*len(heights)//10]:.0f}")
    print(f"  (need median >~40px for reliable tracking)")
if best[1] is not None:
    out = f"annotated_{a.video.rsplit('/',1)[-1].rsplit('.',1)[0]}.jpg"
    cv2.imwrite(out, best[1])
    print(f"best frame ({best[2]} people) -> {out}")
