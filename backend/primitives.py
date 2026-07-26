"""The three CV primitives. One implementation each; site profiles decide which are
armed and with what thresholds. Location changes config, never code."""
import time
from dataclasses import dataclass, field


def point_in_polygon(x: float, y: float, poly: list[list[float]]) -> bool:
    """Ray casting. poly is [[x,y], ...] in pixel coords."""
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y):
            xint = (x2 - x1) * (y - y1) / (y2 - y1 + 1e-9) + x1
            if x < xint:
                inside = not inside
    return inside


@dataclass
class TrackState:
    track_id: int
    first_seen: float
    last_seen: float
    # zone dwell
    zone_entered_at: dict[str, float] = field(default_factory=dict)
    zone_fired: set[str] = field(default_factory=set)
    # prone
    prone_since: float | None = None
    prone_fired: bool = False
    # velocity
    centroids: list[tuple[float, float, float]] = field(default_factory=list)  # (t, cx, cy)
    velocity_fired: bool = False


class PrimitiveEngine:
    """Consumes per-frame tracked boxes, emits hazard findings.

    A finding is a dict; the pipeline wraps it into an event. Each primitive
    fires at most once per track (per zone) so one person crossing a line does
    not produce a thousand duplicate alerts.
    """

    def __init__(self, site: dict):
        self.site = site
        self.armed = set(site.get("armed_primitives", []))
        self.zones = site.get("zones", [])
        t = site.get("thresholds", {})
        self.dwell_seconds = t.get("dwell_seconds", 4.0)
        self.prone_ratio = t.get("prone_ratio", 1.0)
        self.prone_hold_seconds = t.get("prone_hold_seconds", 3.0)
        self.velocity_sigma = t.get("velocity_sigma", 3.5)
        self.velocity_min_history = t.get("velocity_min_history", 15)
        # After a hazard fires, suppress further hazards at this site. Without it a
        # busy scene produces a trigger every couple of seconds and the agent is
        # invoked continuously — which defeats the event-driven architecture.
        self.cooldown_seconds = t.get("cooldown_seconds", 45.0)
        self._last_fire: float | None = None
        self.tracks: dict[int, TrackState] = {}

    def _cooling_down(self, now: float) -> bool:
        return (self._last_fire is not None
                and now - self._last_fire < self.cooldown_seconds)

    def update(self, now: float, boxes: list[dict]) -> list[dict]:
        """boxes: [{track_id, x1, y1, x2, y2, conf}]"""
        findings: list[dict] = []
        seen: set[int] = set()

        for b in boxes:
            tid = b["track_id"]
            if tid is None:
                continue
            seen.add(tid)
            st = self.tracks.get(tid)
            if st is None:
                st = TrackState(track_id=tid, first_seen=now, last_seen=now)
                self.tracks[tid] = st
            st.last_seen = now

            cx = (b["x1"] + b["x2"]) / 2
            foot_y = b["y2"]          # feet: where the person contacts the ground/water
            cy = (b["y1"] + b["y2"]) / 2
            w = max(b["x2"] - b["x1"], 1e-6)
            h = max(b["y2"] - b["y1"], 1e-6)

            if "zone_dwell" in self.armed:
                findings += self._zone_dwell(st, now, cx, foot_y, b)
            if "prone" in self.armed:
                findings += self._prone(st, now, h / w, b)
            if "velocity_anomaly" in self.armed:
                st.centroids.append((now, cx, cy))
                if len(st.centroids) > 90:
                    st.centroids.pop(0)
                findings += self._velocity(st, now, b)

        # drop tracks the tracker has given up on
        for tid in [t for t, s in self.tracks.items() if now - s.last_seen > 5.0]:
            del self.tracks[tid]

        if not findings:
            return []
        if self._cooling_down(now):
            return []
        self._last_fire = now
        # One hazard per cooldown window: the most severe finding, not a burst.
        order = {"prone": 0, "zone_dwell": 1, "velocity_anomaly": 2}
        findings.sort(key=lambda f: order.get(f["primitive"], 9))
        return findings[:1]

    def _zone_dwell(self, st, now, x, y, box) -> list[dict]:
        out = []
        for z in self.zones:
            zid = z["id"]
            if point_in_polygon(x, y, z["polygon"]):
                if zid not in st.zone_entered_at:
                    st.zone_entered_at[zid] = now
                dwell = now - st.zone_entered_at[zid]
                if dwell >= self.dwell_seconds and zid not in st.zone_fired:
                    st.zone_fired.add(zid)
                    out.append({
                        "primitive": "zone_dwell",
                        "zone_id": zid,
                        "zone_kind": z.get("kind", "RESTRICTED"),
                        "track_id": st.track_id,
                        "dwell_seconds": round(dwell, 1),
                        "box": box,
                        "detail": f"person dwelled {dwell:.1f}s inside {z.get('kind', zid)}",
                    })
            else:
                st.zone_entered_at.pop(zid, None)
        return out

    def _prone(self, st, now, aspect, box) -> list[dict]:
        if aspect < self.prone_ratio:
            if st.prone_since is None:
                st.prone_since = now
            held = now - st.prone_since
            if held >= self.prone_hold_seconds and not st.prone_fired:
                st.prone_fired = True
                return [{
                    "primitive": "prone",
                    "track_id": st.track_id,
                    "aspect_ratio": round(aspect, 2),
                    "held_seconds": round(held, 1),
                    "box": box,
                    "detail": f"person horizontal for {held:.1f}s (h/w {aspect:.2f})",
                }]
        else:
            st.prone_since = None
        return []

    def _velocity(self, st, now, box) -> list[dict]:
        if len(st.centroids) < self.velocity_min_history or st.velocity_fired:
            return []
        speeds = []
        for (t0, x0, y0), (t1, x1, y1) in zip(st.centroids, st.centroids[1:]):
            dt = max(t1 - t0, 1e-6)
            speeds.append(((x1 - x0) ** 2 + (y1 - y0) ** 2) ** 0.5 / dt)
        if len(speeds) < 5:
            return []
        recent = speeds[-1]
        base = speeds[:-1]
        mean = sum(base) / len(base)
        var = sum((s - mean) ** 2 for s in base) / len(base)
        sd = var ** 0.5
        if sd > 1e-3 and recent > mean + self.velocity_sigma * sd:
            st.velocity_fired = True
            return [{
                "primitive": "velocity_anomaly",
                "track_id": st.track_id,
                "speed_px_s": round(recent, 1),
                "baseline_px_s": round(mean, 1),
                "sigma": round((recent - mean) / sd, 1),
                "box": box,
                "detail": f"speed {recent:.0f}px/s vs baseline {mean:.0f}px/s",
            }]
        return []
