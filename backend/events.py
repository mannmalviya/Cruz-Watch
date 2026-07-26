"""Single append-only event stream. Everything the system does becomes an event here,
and the dashboard is a pure renderer over it."""
import asyncio
import time
import itertools
from typing import Any, Literal

Provenance = Literal[
    "SYNTHETIC_FOOTAGE",   # stand-in footage, not the named site
    "ARCHIVED_FOOTAGE",    # real camera at the named site, archived/recorded feed
    "REAL_CV",             # produced by live detector inference
    "REAL_GEMMA_LOCAL",    # produced by local Gemma inference
    "TEMPLATE_FALLBACK",   # deterministic fallback when the model is unavailable
    "SIMULATED_DISPATCH",  # mocked escalation target
]

_ids = itertools.count(1)


def make_event(kind: str, site_id: str, provenance: Provenance, **payload) -> dict[str, Any]:
    return {
        "id": next(_ids),
        "ts": time.time(),
        "kind": kind,
        "site_id": site_id,
        "provenance": provenance,
        **payload,
    }


class EventBus:
    """Fan-out to any number of websocket subscribers, plus a bounded replay buffer
    so a dashboard that connects late still sees recent history."""

    # High-rate streams are live-only; they must never evict incident history.
    EPHEMERAL = {"telemetry", "agent_token"}

    def __init__(self, history: int = 200):
        self._subscribers: set[asyncio.Queue] = set()
        self._history: list[dict] = []
        self._history_max = history

    def publish(self, event: dict) -> None:
        if event["kind"] not in self.EPHEMERAL:
            self._history.append(event)
            if len(self._history) > self._history_max:
                self._history.pop(0)
        for q in list(self._subscribers):
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass  # slow consumer drops telemetry rather than stalling the pipeline

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=100)
        self._subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue) -> None:
        self._subscribers.discard(q)

    def history(self, kinds: set[str] | None = None) -> list[dict]:
        if kinds is None:
            return list(self._history)
        return [e for e in self._history if e["kind"] in kinds]


bus = EventBus()
