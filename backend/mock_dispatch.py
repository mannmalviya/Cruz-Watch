"""Mock emergency dispatch console. Separate service on a separate port so the
trust boundary is visible rather than asserted. Never contacts anything real."""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="CruzWatch Mock Dispatch (SIMULATED)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

received: list[dict] = []


@app.post("/dispatch")
async def dispatch(payload: dict):
    received.append(payload)
    print(f"[SIMULATED DISPATCH] {payload.get('responder')} <- {payload.get('summary')}")
    return {"accepted": True, "simulated": True, "queue_position": len(received)}


@app.get("/dispatch")
async def list_dispatch():
    return {"simulated": True, "received": received[-50:]}
