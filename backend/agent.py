"""Gemma 4 incident agent — runs locally via Ollama, invoked only on CV triggers.

The agent receives the structured event and site context (never pixels), streams
its reasoning as events, decides severity, and escalates via the ONLY egress in
this codebase: escalate(), hardcoded to the local mock dispatch console.

A hard timeout with a deterministic template fallback guarantees a stalled model
can never hang the pipeline or the demo.
"""
import asyncio
import json
import os
import re
import time

import httpx

from events import bus, make_event

# The one and only escalation target. Never a real emergency endpoint.
MOCK_DISPATCH_URL = "http://127.0.0.1:8001/dispatch"

OLLAMA_URL = os.environ.get("CRUZWATCH_OLLAMA", "http://127.0.0.1:11434")
MODEL = os.environ.get("CRUZWATCH_MODEL", "gemma4:e2b")
AGENT_TIMEOUT_S = 120  # covers cold model load on first trigger; later calls are fast

# One model, one GPU — serialize agent calls so simultaneous triggers at two
# sites queue instead of stampeding VRAM.
_agent_lock = asyncio.Lock()

PROMPT = """You are CruzWatch, an automated hazard-response agent running on-device \
at a monitoring site in Santa Cruz, California. A computer-vision trigger has fired. \
You must assess it and decide whether to escalate to emergency responders.

SITE
{site_block}

CV EVENT (structured detector output — you never see video)
{event_block}

Reason about what most plausibly happened given THIS site's context, how urgent it \
is, and who should respond. Be concrete and honest about uncertainty — the CV event \
is a trigger, not a diagnosis. This is a proof-of-concept: escalation goes to a \
simulated dispatch console, never real 911.

Respond with ONLY a JSON object, keys in exactly this order:
{{"reasoning": "<3-5 sentences: what likely happened, why it matters at this site, urgency>",
"severity": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
"escalate": true | false,
"responder": "{responder}",
"summary": "<2-3 sentence dispatch message: location, what was observed, when, recommended action>"}}"""


def build_agent_input(site: dict, finding: dict) -> dict:
    """Exactly what the model receives. Structured event + site context, no pixels."""
    return {
        "site": {
            "id": site["id"],
            "name": site["name"],
            "type": site["type"],
            "location": site["location"],
            "context": site.get("agent_context", ""),
            "responder": site.get("responder"),
        },
        "event": {
            "primitive": finding["primitive"],
            "detail": finding.get("detail"),
            "track_id": finding.get("track_id"),
            "zone_kind": finding.get("zone_kind"),
            "dwell_seconds": finding.get("dwell_seconds"),
            "aspect_ratio": finding.get("aspect_ratio"),
            "observed_at": time.time(),
        },
    }


def _template_incident(site: dict, finding: dict, reason: str) -> dict:
    """Deterministic fallback so the pipeline degrades, never hangs."""
    sev = {"prone": "HIGH", "zone_dwell": "MEDIUM"}.get(finding["primitive"], "MEDIUM")
    return {
        "severity": sev,
        "escalate": True,
        "responder": site.get("responder"),
        "summary": (
            f"{site['name']} ({site['location']['lat']}, {site['location']['lng']}): "
            f"automated CV trigger — {finding.get('detail', finding['primitive'])}. "
            f"Agent unavailable ({reason}); escalating on trigger severity policy."
        ),
        "reasoning": f"Template fallback: {reason}. Severity assigned by primitive type.",
        "engine": "template_fallback",
    }


def _parse_incident(text: str) -> dict | None:
    m = re.search(r"\{.*\}", text, re.DOTALL)
    if not m:
        return None
    try:
        d = json.loads(m.group(0))
    except json.JSONDecodeError:
        return None
    if not {"severity", "escalate", "summary"} <= set(d):
        return None
    d["severity"] = str(d["severity"]).upper()
    if d["severity"] not in ("LOW", "MEDIUM", "HIGH", "CRITICAL"):
        d["severity"] = "MEDIUM"
    return d


async def _stream_gemma(site_id: str, prompt: str) -> str:
    """Stream generation, publishing token deltas for the dashboard."""
    text = ""
    async with httpx.AsyncClient(timeout=AGENT_TIMEOUT_S) as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": MODEL,
                "prompt": prompt,
                "stream": True,
                "format": "json",
                "keep_alive": "45m",
                "options": {"temperature": 0.3, "num_ctx": 2048, "num_predict": 600},
            },
        ) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line:
                    continue
                chunk = json.loads(line)
                delta = chunk.get("response", "")
                if delta:
                    text += delta
                    bus.publish(make_event(
                        "agent_token", site_id, "REAL_GEMMA_LOCAL",
                        delta=delta,
                    ))
                if chunk.get("done"):
                    break
    return text


async def handle_hazard(site: dict, finding: dict) -> dict:
    agent_input = build_agent_input(site, finding)
    bus.publish(make_event(
        "agent_input", site["id"], "REAL_CV",
        agent_input=agent_input,
    ))

    prompt = PROMPT.format(
        site_block=json.dumps(agent_input["site"], indent=1),
        event_block=json.dumps(agent_input["event"], indent=1),
        responder=site.get("responder", "GENERAL_DISPATCH_SIM"),
    )

    t0 = time.time()
    incident: dict | None = None
    try:
        async with _agent_lock:
            bus.publish(make_event(
                "agent_start", site["id"], "REAL_GEMMA_LOCAL",
                model=MODEL, detail=f"Gemma invoked for {finding['primitive']}",
            ))
            text = await asyncio.wait_for(
                _stream_gemma(site["id"], prompt), timeout=AGENT_TIMEOUT_S,
            )
        incident = _parse_incident(text)
        if incident is None:
            incident = _template_incident(site, finding, "unparseable model output")
        else:
            incident["engine"] = MODEL
    except (asyncio.TimeoutError, httpx.HTTPError, OSError) as e:
        incident = _template_incident(site, finding, f"{type(e).__name__}")

    incident["latency_s"] = round(time.time() - t0, 1)
    provenance = (
        "REAL_GEMMA_LOCAL" if incident.get("engine") == MODEL else "TEMPLATE_FALLBACK"
    )
    bus.publish(make_event(
        "incident", site["id"], provenance,
        incident=incident, agent_input=agent_input,
    ))

    if incident.get("escalate"):
        await escalate(site, incident)
    return incident


async def escalate(site: dict, incident: dict) -> dict:
    """The single egress point. Hardcoded to the local mock console."""
    assert MOCK_DISPATCH_URL.startswith("http://127.0.0.1"), "escalation target must stay local"
    payload = {
        "site_id": site["id"],
        "site_name": site["name"],
        "location": site["location"],
        "responder": incident.get("responder"),
        "severity": incident.get("severity"),
        "summary": incident.get("summary"),
        "ts": time.time(),
    }
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.post(MOCK_DISPATCH_URL, json=payload)
            result = {"ok": r.status_code < 300, "status": r.status_code}
    except Exception as e:
        result = {"ok": False, "error": str(e)}
    bus.publish(make_event(
        "dispatch", site["id"], "SIMULATED_DISPATCH",
        detail=f"→ {payload['responder']} [{payload['severity']}] {'accepted' if result.get('ok') else 'FAILED'}",
        payload=payload, result=result,
    ))
    return result
