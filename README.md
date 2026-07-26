# CruzWatch

Edge hazard monitoring for Santa Cruz — coastal and urban. A cheap CV model watches
continuously; a local Gemma 4 agent is invoked **only when a trigger fires**, reasons
about the event using site-specific context, and escalates to a simulated dispatch console.

> **Proof of concept.** Footage is archived or stand-in, escalation is simulated and
> never contacts real emergency services. The CV inference and the local Gemma 4
> reasoning are real.

## Run

```bash
./run.sh
```

| Service | URL | What it is |
| --- | --- | --- |
| Dashboard | http://localhost:3000 | Next.js fleet console |
| Backend | http://localhost:8000/api/sites | Detection pipelines, MJPEG, event stream |
| Mock dispatch | http://localhost:8001/dispatch | **Simulated** responder console |

Requires Python 3.11+, Node 20.9+, `pip install -r backend/requirements.txt`,
and [Ollama](https://ollama.com) with `ollama pull gemma4:e2b` for the agent
(without it, incidents fall back to a labeled template). A CUDA GPU is optional;
four sites run concurrently on an RTX 4060 Laptop GPU alongside the model.

## Architecture

Everything the system does becomes an event on one append-only stream, and the
dashboard is a pure renderer over it. That keeps the UI dumb, makes the demo
replayable, and gives every event a `provenance` field that drives the honesty
badges on screen.

**Detector output is precomputed, never overlaid live.** `backend/render_demo.py`
runs each site's clip through the real detector + primitives once and stores the
annotated result (`web/public/demo/*.mp4`, plus `sites.json` and a captured
`events.json` with real Gemma incidents). The dashboard plays those recordings —
labeled `REPLAY` / `RECORDED ANALYSIS` — both locally and on the hosted site.
Zone polygons drive the triggers but are not drawn; the overlay shows detections
(green) and triggered tracks (red) only.

```text
clip / camera ──► YOLO11n + ByteTrack ──► primitives ──► hazard event
                       (real CV)                              │
                                                              ▼
                                          Gemma 4 (gemma4:e2b, local via Ollama)
                                              │ decides severity + escalate
                                              ▼
                                          escalate() ──► mock dispatch :8001
```

### Three primitives, not two detectors

Location changes **config, never code**. `backend/primitives.py` implements exactly
three mechanisms; each site profile picks which are armed and with what thresholds.

| Primitive | Mechanism | Coastal use | Urban use |
| --- | --- | --- | --- |
| `zone_dwell` | point-in-polygon on the box's foot point + dwell timer | surfer sits in the rock impact zone | person in a closed corridor |
| `prone` | box aspect ratio (h/w) inverts and holds | person down on rocks | collapse on pavement |
| `velocity_anomaly` | per-track speed vs its own rolling baseline | swept / sudden track loss | crowd dispersion |

Adding a seventeenth camera is adding a JSON file.

### Site profiles

`backend/sites/*.json`. The `agent_context` field is the load-bearing one: an
identical CV event at two sites yields different severity and different responder
routing purely because the context differs. That is the argument for using an LLM
here at all.

## Tuning triggers

Verify a zone polygon and thresholds **before** recording a demo:

```bash
cd backend
python3 tune.py sites/coastal_steamerlane.json
python3 tune.py sites/downtown_boardwalk.json --dwell 2.5
```

It runs the real detector over the clip at full speed and prints exactly when each
primitive fires, plus the first trigger time — your demo cue point.

Current measured behaviour (from the precompute render):

| Site | Triggers |
| --- | --- |
| `sc-westcliff-03` | 4 × `zone_dwell` / 180s |
| `sc-downtown-01` | 4 × `zone_dwell` / 150s |
| `sc-seabright-02` | 3 × `zone_dwell` / 175s |
| `sc-mainbeach-06` | 5 × `zone_dwell` / 280s |
| `sc-harbor-04` | 2 × `zone_dwell` / 360s |
| `sc-wharf-05` | quiet — wide vista; subjects below reliable detection size |
| `sc-harbor-03` | quiet by design (night watch) |

### On `velocity_anomaly`

Implemented but **disarmed on the coastal site**. Measured against the Steamer Lane
clip it fired 98 times in 180 seconds, because every surfer catching a wave is a
speed spike. It is illustrative, not a validated capability, and the writeup should
say so.

A `cooldown_seconds` per site (default 45s) collapses a burst of findings into a
single most-severe hazard, so the agent is invoked a handful of times per clip
rather than continuously.

## Gemma 4 integration

`handle_hazard` in `backend/agent.py` runs **gemma4:e2b locally via Ollama**
(the edge-class Gemma 4 variant — the on-message choice for an Edge/On-Device
track). On each trigger it:

1. Publishes `agent_input` — the exact payload the model sees (site context +
   structured event, **never pixels**)
2. Streams generation as `agent_token` events (rendered live in the dashboard's
   agent panel), JSON-constrained with `reasoning` first so thinking streams
   before the verdict
3. Parses `{reasoning, severity, escalate, responder, summary}`
4. Calls `escalate()` only if the model says so — measured behavior: identical
   `zone_dwell` triggers at three sites produced MEDIUM/escalate (downtown),
   MEDIUM/escalate (cliff break), and LOW/**no escalation** (routine wader) —
   the site context, not the CV event, drives the decision

A 120s hard timeout with a deterministic template fallback
(provenance `TEMPLATE_FALLBACK`, visibly labeled) guarantees a stalled model
can never hang the demo. Agent calls are serialized with a lock so simultaneous
triggers queue instead of stampeding VRAM. Warm latency measured at 4–9s per
incident on an RTX 4060 Laptop GPU (~43 tok/s).

## Safety

`escalate()` in `backend/agent.py` is the **only** network egress in the codebase,
and it asserts its target starts with `http://127.0.0.1`. The mock dispatch console
runs as a separate service on a separate port so the trust boundary is visible
rather than asserted.

## Footage provenance

| Site | Source | On-screen label |
| --- | --- | --- |
| `sc-westcliff-03` | Archived Surfline cliff cam, Steamer Lane | `REAL SITE · ARCHIVED` |
| `sc-seabright-02` | WebCOOS Walton Lighthouse cam (UCSC/SECOORA), 2026-07-25 15:36 PDT | `REAL SITE · ARCHIVED` |
| `sc-mainbeach-06` | Same Walton camera, second preset — Main Beach/Boardwalk panorama | `REAL SITE · ARCHIVED` |
| `sc-wharf-05` | WebCOOS Santa Cruz Wharf cam (CeNCOOS), 2026-07-25 15:39 PDT | `REAL SITE · ARCHIVED` |
| `sc-harbor-03` | santacruzharbor.org webcam, recorded live 2026-07-25 ~22:15 PDT (night) | `REAL SITE · ARCHIVED` |
| `sc-harbor-04` | santacruzharbor.org webcam, recorded live 2026-07-26 ~11:40 PDT (day) | `REAL SITE · ARCHIVED` |
| `sc-downtown-01` | Public boardwalk webcam | `STAND-IN FOOTAGE` — real camera, **not** this location |

Six of seven feeds are real cameras at the named Santa Cruz sites (archived or
recorded, not live units). The provenance badge on every panel says which is
which before a judge has to ask.
