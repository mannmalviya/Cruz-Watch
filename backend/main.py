"""CruzWatch backend: runs one pipeline per site, serves annotated MJPEG + event stream."""
import asyncio
import json
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse

from events import bus
from pipeline import SitePipeline

SITES_DIR = Path(__file__).parent / "sites"

app = FastAPI(title="CruzWatch")
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"],
)

pipelines: dict[str, SitePipeline] = {}


def load_sites() -> list[dict]:
    return [json.loads(p.read_text()) for p in sorted(SITES_DIR.glob("*.json"))]


@app.on_event("startup")
async def startup():
    for site in load_sites():
        p = SitePipeline(site)
        p.start()
        pipelines[site["id"]] = p


@app.get("/api/sites")
async def sites():
    out = []
    for site in load_sites():
        p = pipelines.get(site["id"])
        out.append({
            **site,
            "runtime": {
                "status": p.status if p else "OFFLINE",
                "fps": round(p.fps, 1) if p else 0,
                "person_count": p.person_count if p else 0,
            },
        })
    return out


@app.get("/api/events")
async def events():
    return bus.history()


@app.get("/api/stream/{site_id}")
async def stream(site_id: str):
    p = pipelines.get(site_id)
    if p is None:
        return JSONResponse({"error": "unknown site"}, status_code=404)

    async def gen():
        while True:
            frame = p.latest_jpeg
            if frame:
                yield (b"--frame\r\nContent-Type: image/jpeg\r\n"
                       b"Content-Length: " + str(len(frame)).encode() + b"\r\n\r\n"
                       + frame + b"\r\n")
            await asyncio.sleep(1 / 25)

    return StreamingResponse(gen(), media_type="multipart/x-mixed-replace; boundary=frame")


@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await websocket.accept()
    q = bus.subscribe()
    try:
        for e in bus.history({"hazard", "incident", "dispatch", "agent_input",
                              "agent_start", "error"}):
            await websocket.send_json(e)
        while True:
            e = await q.get()
            await websocket.send_json(e)
    except WebSocketDisconnect:
        pass
    finally:
        bus.unsubscribe(q)
