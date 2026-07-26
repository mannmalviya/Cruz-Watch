"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { API, WS, CruzEvent, Site } from "@/lib/types";
import { KindChip, ProvenanceBadge, StatusBadge } from "./Badges";
import Sparkline, { SparkPoint } from "./Sparkline";

interface Telemetry {
  fps: number;
  person_count: number;
  track_ids: number[];
  status: string;
}

const HIST_MAX = 64;
const COMMIT_MS = 500; // telemetry arrives ~10/s per site; commit to React at 2 Hz

export default function Dashboard() {
  const [sites, setSites] = useState<Site[]>([]);
  const [selected, setSelected] = useState<string | null>(null); // null = video wall
  const [telemetry, setTelemetry] = useState<Record<string, Telemetry>>({});
  const [events, setEvents] = useState<CruzEvent[]>([]);
  const [demo, setDemo] = useState(false); // no backend -> recorded-analysis replay
  const [nowSec, setNowSec] = useState(0);
  const [agentText, setAgentText] = useState<Record<string, string>>({});

  const latestRef = useRef<Record<string, Telemetry>>({});
  const [hist, setHist] = useState<Record<string, SparkPoint[]>>({});
  const [fleetHist, setFleetHist] = useState<SparkPoint[]>([]);

  useEffect(() => {
    fetch(`${API}/api/sites`)
      .then((r) => r.json())
      .then((s: Site[]) => setSites(s))
      .catch(() =>
        // No live backend (e.g. the hosted site): fall back to recorded
        // analysis — pre-rendered detector output + a captured event log.
        Promise.all([
          fetch("/demo/sites.json").then((r) => r.json()),
          fetch("/demo/events.json").then((r) => r.json()),
        ])
          .then(([s, ev]: [Site[], CruzEvent[]]) => {
            setSites(s);
            setEvents([...ev].reverse());
            setDemo(true);
          })
          .catch(() => {}),
      );
  }, []);

  useEffect(() => {
    if (demo) {
      // replay mode: no socket, but keep the clock ticking for age checks
      const id = setInterval(() => setNowSec(Date.now() / 1000), COMMIT_MS);
      return () => clearInterval(id);
    }
    const ws = new WebSocket(WS);
    ws.onmessage = (m) => {
      const e: CruzEvent = JSON.parse(m.data);
      if (e.kind === "telemetry") {
        latestRef.current[e.site_id] = {
          fps: e.fps as number,
          person_count: e.person_count as number,
          track_ids: (e.track_ids as number[]) ?? [],
          status: e.status as string,
        };
      } else if (e.kind === "agent_token") {
        setAgentText((prev) => ({
          ...prev,
          [e.site_id]: (prev[e.site_id] ?? "") + String(e.delta ?? ""),
        }));
      } else if (e.kind === "agent_start") {
        setAgentText((prev) => ({ ...prev, [e.site_id]: "" }));
        setEvents((prev) => [e, ...prev].slice(0, 80));
      } else {
        setEvents((prev) => [e, ...prev].slice(0, 80));
      }
    };

    const id = setInterval(() => {
      const now = Date.now() / 1000;
      setNowSec(now);
      const latest = latestRef.current;
      if (!Object.keys(latest).length) return;
      const sum = Object.values(latest).reduce((a, t) => a + t.person_count, 0);
      setHist((prev) => {
        const next: Record<string, SparkPoint[]> = { ...prev };
        for (const [sid, t] of Object.entries(latest)) {
          next[sid] = [...(next[sid] ?? []), { t: now, v: t.person_count }].slice(
            -HIST_MAX,
          );
        }
        return next;
      });
      setFleetHist((prev) => [...prev, { t: now, v: sum }].slice(-HIST_MAX));
      setTelemetry({ ...latest });
    }, COMMIT_MS);

    return () => {
      clearInterval(id);
      ws.close();
    };
  }, [demo]);

  const site = useMemo(
    () => sites.find((s) => s.id === selected) ?? null,
    [sites, selected],
  );
  const incidents = events.filter((e) => e.kind === "incident");

  const hazardAge = (sid: string) => {
    if (!nowSec) return Infinity;
    const h = events.find((e) => e.kind === "hazard" && e.site_id === sid);
    return h ? nowSec - h.ts : Infinity;
  };

  return (
    <div className="flex flex-1 flex-col">
      <KpiRow
        sites={sites}
        telemetry={telemetry}
        fleetHist={fleetHist}
        incidents={incidents}
      />

      {site ? (
        <DetailView
          site={site}
          tel={telemetry[site.id]}
          hazardRecent={hazardAge(site.id) < 12}
          agentText={agentText[site.id] ?? ""}
          events={events}
          incidents={incidents}
          demo={demo}
          onBack={() => setSelected(null)}
        />
      ) : (
        <VideoWall
          sites={sites}
          telemetry={telemetry}
          hist={hist}
          hazardAge={hazardAge}
          incidents={incidents}
          onSelect={setSelected}
          demo={demo}
        />
      )}
    </div>
  );
}

/* ---------- KPI row ---------- */

function KpiRow({
  sites,
  telemetry,
  fleetHist,
  incidents,
}: {
  sites: Site[];
  telemetry: Record<string, Telemetry>;
  fleetHist: SparkPoint[];
  incidents: CruzEvent[];
}) {
  const tels = Object.values(telemetry);
  const tracked = tels.reduce((a, t) => a + t.person_count, 0);
  const fps = tels.length
    ? tels.reduce((a, t) => a + t.fps, 0) / tels.length
    : 0;
  const lastIncident = incidents[0];
  const escalations = incidents.filter(
    (e) => (e.incident as Record<string, unknown>)?.escalate,
  ).length;

  return (
    <div className="grid grid-cols-2 gap-px border-b border-edge bg-edge lg:grid-cols-4">
      <StatTile label="Sites online" value={String(sites.length)} sub="+6 planned deployments" />
      <StatTile
        label="Persons tracked"
        value={String(tracked)}
        sub="fleet-wide, live"
        spark={fleetHist}
      />
      <StatTile
        label="Detector throughput"
        value={fps ? `${fps.toFixed(1)} fps` : "—"}
        sub={`mean across ${tels.length || "…"} pipelines`}
      />
      <StatTile
        label="Incidents / escalated"
        value={`${incidents.length} / ${escalations}`}
        sub={
          lastIncident
            ? `last ${new Date(lastIncident.ts * 1000).toLocaleTimeString("en-US", { hour12: false })}`
            : "none this session"
        }
      />
    </div>
  );
}

function StatTile({
  label,
  value,
  sub,
  spark,
}: {
  label: string;
  value: string;
  sub: string;
  spark?: SparkPoint[];
}) {
  const [hover, setHover] = useState<SparkPoint | null>(null);
  return (
    <div className="flex items-center justify-between gap-3 bg-surface px-4 py-3">
      <div>
        <div className="text-[10px] font-medium tracking-wider text-ink-3 uppercase">
          {label}
        </div>
        <div className="mt-0.5 text-2xl font-semibold text-ink">{value}</div>
        <div className="mt-0.5 font-mono text-[10px] text-ink-3">
          {hover
            ? `${hover.v} @ ${new Date(hover.t * 1000).toLocaleTimeString("en-US", { hour12: false })}`
            : sub}
        </div>
      </div>
      {spark && spark.length > 1 && (
        <Sparkline data={spark} width={110} height={34} onHover={setHover} />
      )}
    </div>
  );
}

/* ---------- feeds ---------- */

function Feed({
  site,
  demo,
  className,
}: {
  site: Site;
  demo: boolean;
  className: string;
}) {
  if (demo) {
    return (
      <video
        src={`/demo/${site.id}.mp4`}
        autoPlay
        loop
        muted
        playsInline
        className={className}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${API}/api/stream/${site.id}`}
      alt={`${site.name} annotated detection feed`}
      className={className}
    />
  );
}

/* ---------- video wall ---------- */

function VideoWall({
  sites,
  telemetry,
  hist,
  hazardAge,
  incidents,
  onSelect,
  demo,
}: {
  sites: Site[];
  telemetry: Record<string, Telemetry>;
  hist: Record<string, SparkPoint[]>;
  hazardAge: (sid: string) => number;
  incidents: CruzEvent[];
  onSelect: (id: string) => void;
  demo: boolean;
}) {
  return (
    <div className="flex flex-1 flex-col gap-3 p-3 lg:flex-row lg:items-start">
      <div className="grid flex-1 content-start gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {sites.map((s) => {
          const t = telemetry[s.id];
          const hazard = hazardAge(s.id) < 12;
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              className={`group relative cursor-pointer overflow-hidden rounded-md border bg-black text-left transition duration-150 hover:scale-[1.012] hover:shadow-xl hover:shadow-black/50 active:scale-[0.995] ${
                hazard
                  ? "border-critical/70"
                  : "border-edge hover:border-accent"
              }`}
            >
              <Feed
                site={s}
                demo={demo}
                className="aspect-video w-full object-cover transition duration-150 group-hover:brightness-110"
              />
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-2 bg-gradient-to-b from-black/75 to-transparent px-3 pt-2 pb-6">
                <span className="font-mono text-[9px] text-ink-3">{s.id}</span>
                <span className="text-[12px] font-medium text-ink">{s.name}</span>
                <span className="ml-auto flex items-center gap-2">
                  {!demo && <StatusBadge status={t?.status ?? "OFFLINE"} />}
                  <span className="rounded-sm bg-black/50 p-1 text-ink-2 ring-1 ring-edge transition duration-150 group-hover:bg-accent group-hover:text-plane group-hover:ring-accent">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M15 3h6v6M21 3l-7 7M9 21H3v-6M3 21l7-7" />
                    </svg>
                  </span>
                </span>
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2.5 bg-gradient-to-t from-black/75 to-transparent px-3 pt-6 pb-2">
                {s.banner && (
                  <span className="rounded-sm bg-warn px-1.5 py-0.5 font-mono text-[8px] font-bold tracking-wider text-plane">
                    STAGED DEMO
                  </span>
                )}
                <ProvenanceBadge p={s.footage_provenance} />
                <span className="font-mono text-[10px] tabular-nums text-ink-2">
                  {t?.person_count ?? 0} trk
                </span>
                <span className="font-mono text-[10px] tabular-nums text-ink-3">
                  {t?.fps?.toFixed(1) ?? "—"} fps
                </span>
                <span className="ml-auto">
                  <Sparkline data={hist[s.id] ?? []} width={64} height={18} />
                </span>
              </div>
              {hazard && (
                <div className="absolute left-3 top-1/2 -translate-y-1/2 rounded-sm bg-critical/85 px-2 py-1 font-mono text-[10px] font-semibold tracking-[0.2em] text-white">
                  ▲ HAZARD
                </div>
              )}
            </button>
          );
        })}
        {sites.length === 0 && (
          <div className="col-span-full grid h-48 place-items-center rounded-md border border-edge bg-surface font-mono text-[10px] text-ink-3">
            NO SITES — backend on :8000?
          </div>
        )}
      </div>

      <ReportsRail incidents={incidents} sites={sites} />
    </div>
  );
}

/* ---------- Gemma reports rail ---------- */

function GemmaMark({ size = 16 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/gemma.svg"
      alt="Gemma"
      width={size}
      height={size}
      className="shrink-0"
    />
  );
}

function ReportsRail({
  incidents,
  sites,
}: {
  incidents: CruzEvent[];
  sites: Site[];
}) {
  const nameOf = (id: string) => sites.find((s) => s.id === id)?.name ?? id;
  return (
    <aside className="w-full shrink-0 rounded-md border border-agent/30 bg-surface lg:w-[360px]">
      <div className="flex items-center gap-2.5 border-b border-edge px-3 py-2.5">
        <GemmaMark size={18} />
        <div>
          <div className="text-[12px] font-semibold text-ink">
            Incident reports
          </div>
          <div className="font-mono text-[9px] tracking-[0.15em] text-agent">
            WRITTEN BY GEMMA 4 · ON-DEVICE
          </div>
        </div>
        <span className="ml-auto font-mono text-[10px] text-ink-3">
          {incidents.length}
        </span>
      </div>
      <div className="max-h-[calc(100vh-220px)] divide-y divide-edge overflow-y-auto">
        {incidents.map((e) => {
          const inc = e.incident as Record<string, unknown>;
          const sev = String(inc?.severity ?? "—");
          return (
            <div
              key={e.id}
              className={`border-l-2 px-3 py-2.5 ${SEVERITY[sev] ?? "border-warn"}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-semibold text-ink">
                  {sev}
                </span>
                <span className="truncate text-[11px] font-medium text-ink-2">
                  {nameOf(e.site_id)}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[9px] text-ink-3">
                  {new Date(e.ts * 1000).toLocaleTimeString("en-US", { hour12: false })}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-ink-2">
                {String(inc?.summary ?? "")}
              </p>
              <div className="mt-2 flex items-center gap-1.5 font-mono text-[9px] text-ink-3">
                <GemmaMark size={11} />
                <span>{String(inc?.engine ?? "gemma4")}</span>
                <span>·</span>
                <span>{String(inc?.latency_s ?? "—")}s</span>
                {Boolean(inc?.escalate) && (
                  <span className="ml-auto text-serious">
                    → {String(inc?.responder ?? "").replace("_SIM", "")}
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {incidents.length === 0 && (
          <div className="px-3 py-6 text-center font-mono text-[10px] text-ink-3">
            NO REPORTS YET
          </div>
        )}
      </div>
    </aside>
  );
}

/* ---------- detail view ---------- */

function Bracket({ hazard }: { hazard: boolean }) {
  const c = hazard ? "border-critical/80" : "border-ink/25";
  const b = "absolute h-4 w-4 border-0 transition-colors";
  return (
    <>
      <span className={`${b} left-2 top-2 border-l-2 border-t-2 ${c}`} />
      <span className={`${b} right-2 top-2 border-r-2 border-t-2 ${c}`} />
      <span className={`${b} bottom-2 left-2 border-b-2 border-l-2 ${c}`} />
      <span className={`${b} bottom-2 right-2 border-b-2 border-r-2 ${c}`} />
    </>
  );
}

function DetailView({
  site,
  tel,
  hazardRecent,
  agentText,
  events,
  incidents,
  demo,
  onBack,
}: {
  site: Site;
  tel?: Telemetry;
  hazardRecent: boolean;
  agentText: string;
  events: CruzEvent[];
  incidents: CruzEvent[];
  demo: boolean;
  onBack: () => void;
}) {
  return (
    <div className="grid flex-1 gap-3 p-3 lg:grid-cols-[1fr_380px]">
      <section className="self-start rounded-md border border-edge bg-surface">
        <div className="flex flex-wrap items-center gap-2.5 border-b border-edge px-3 py-2">
          <button
            onClick={onBack}
            className="rounded-sm border border-edge px-2 py-1 font-mono text-[10px] tracking-wider text-ink-2 transition hover:border-accent/50"
          >
            ← ALL CAMERAS
          </button>
          <span className="font-mono text-[10px] text-ink-3">{site.id}</span>
          <span className="text-[13px] font-medium text-ink">{site.name}</span>
          {!demo && <StatusBadge status={tel?.status ?? "OFFLINE"} />}
          <div className="ml-auto flex gap-1.5">
            <ProvenanceBadge p={site.footage_provenance} />
            <ProvenanceBadge p="REAL_CV" />
          </div>
        </div>

        {site.banner && (
          <div className="border-b border-warn/40 bg-warn/15 px-3 py-1.5 font-mono text-[10px] font-semibold tracking-wide text-warn">
            {site.banner}
          </div>
        )}
        <div className="scanlines relative bg-black">
          <Feed site={site} demo={demo} className="w-full" />
          <Bracket hazard={hazardRecent} />
          <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-sm bg-black/60 px-2 py-1">
            <span
              className={`h-1.5 w-1.5 rounded-full ${demo ? "bg-accent" : "rec-dot bg-critical"}`}
            />
            <span className="font-mono text-[9px] tracking-[0.2em] text-ink-2">
              {demo ? "RECORDED ANALYSIS" : "LIVE INFERENCE"}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-edge sm:grid-cols-4">
          <MiniStat label="Tracked" value={String(tel?.person_count ?? 0)} />
          <MiniStat label="Detector" value={`${tel?.fps?.toFixed(1) ?? "—"} fps`} />
          <MiniStat label="Zones" value={String(site.zones.length)} />
          <MiniStat label="Responder" value={site.responder.replace("_SIM", "")} />
        </div>

        <div className="space-y-2.5 px-3 py-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] tracking-wider text-ink-3 uppercase">
              Armed
            </span>
            {site.armed_primitives.map((p) => (
              <span
                key={p}
                className="rounded-sm bg-accent/10 px-1.5 py-0.5 font-mono text-[10px] text-ink-2 ring-1 ring-accent/30"
              >
                {p}
              </span>
            ))}
            <span className="ml-auto text-[10px] text-ink-3">
              {site.footage_note}
            </span>
          </div>
          <div className="rounded-sm border-l-2 border-agent bg-raised/60 px-3 py-2">
            <div className="font-mono text-[9px] tracking-[0.2em] text-agent">
              AGENT BRIEF — SENT TO GEMMA ON TRIGGER
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-ink-2">
              {site.agent_context}
            </p>
          </div>
        </div>
      </section>

      <aside className="flex flex-col gap-3">
        <AgentPanel text={agentText} incidents={incidents} siteId={site.id} />
        <IncidentPanel
          incidents={incidents.filter((e) => e.site_id === site.id)}
        />
        <EventLog events={events.filter((e) => e.site_id === site.id)} />
      </aside>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-3 py-2">
      <div className="text-[9px] tracking-wider text-ink-3 uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-[13px] text-ink">{value}</div>
    </div>
  );
}

/* ---------- agent panel ---------- */

function AgentPanel({
  text,
  incidents,
  siteId,
}: {
  text: string;
  incidents: CruzEvent[];
  siteId: string;
}) {
  const latest = incidents.find((e) => e.site_id === siteId);
  const inc = latest?.incident as Record<string, unknown> | undefined;
  const engine = String(inc?.engine ?? "");
  const streaming = text.length > 0 && !inc;
  // no live stream (replay mode): show the captured incident's reasoning
  const shown = text || (inc ? String(inc.reasoning ?? "") : "");
  return (
    <div className="rounded-md border border-agent/30 bg-surface">
      <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
        <GemmaMark size={14} />
        <span className="font-mono text-[9px] tracking-[0.2em] text-agent">
          GEMMA 4 — ON-TRIGGER REASONING
        </span>
        {latest && (
          <span className="ml-auto">
            <ProvenanceBadge p={latest.provenance} />
          </span>
        )}
      </div>
      <div className="max-h-[220px] overflow-y-auto px-3 py-2.5">
        {shown ? (
          <pre className="font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-ink-2">
            {shown}
            {streaming && <span className="animate-pulse text-agent">▍</span>}
          </pre>
        ) : (
          <p className="py-3 text-center font-mono text-[10px] text-ink-3">
            IDLE — invoked only when a CV trigger fires
          </p>
        )}
      </div>
      {inc && (
        <div className="flex items-center gap-2.5 border-t border-edge px-3 py-1.5 font-mono text-[9px] text-ink-3">
          <span>engine {engine || "—"}</span>
          <span>·</span>
          <span>latency {String(inc.latency_s ?? "—")}s</span>
          {Boolean(inc.escalate) && (
            <span className="ml-auto text-serious">→ ESCALATED</span>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- incident + event rails ---------- */

const SEVERITY: Record<string, string> = {
  CRITICAL: "border-critical",
  HIGH: "border-critical",
  MEDIUM: "border-serious",
  LOW: "border-good",
  PENDING: "border-warn",
};

function IncidentPanel({ incidents }: { incidents: CruzEvent[] }) {
  return (
    <div className="rounded-md border border-edge bg-surface">
      <div className="flex items-baseline justify-between border-b border-edge px-3 py-2">
        <span className="text-[10px] font-medium tracking-wider text-ink-3 uppercase">
          Incidents
        </span>
        <span className="font-mono text-[10px] text-ink-3">
          {incidents.length}
        </span>
      </div>
      <div className="max-h-[260px] divide-y divide-edge overflow-y-auto">
        {incidents.map((e) => {
          const inc = e.incident as Record<string, unknown>;
          const input = e.agent_input as
            | { event?: { primitive?: string } }
            | undefined;
          const sev = String(inc?.severity ?? "PENDING");
          return (
            <div
              key={e.id}
              className={`border-l-2 px-3 py-2.5 ${SEVERITY[sev] ?? "border-warn"}`}
            >
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] font-semibold text-ink-2">
                  SEV {sev}
                </span>
                {input?.event?.primitive && (
                  <span className="rounded-sm bg-raised px-1.5 py-0.5 font-mono text-[9px] text-ink-2">
                    {input.event.primitive}
                  </span>
                )}
                <span className="ml-auto font-mono text-[10px] text-ink-3">
                  {new Date(e.ts * 1000).toLocaleTimeString("en-US", { hour12: false })}
                </span>
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-ink-2">
                {String(inc?.summary ?? "")}
              </p>
            </div>
          );
        })}
        {incidents.length === 0 && (
          <div className="px-3 py-5 text-center font-mono text-[10px] text-ink-3">
            NO INCIDENTS AT THIS SITE YET
          </div>
        )}
      </div>
    </div>
  );
}

function EventLog({ events }: { events: CruzEvent[] }) {
  return (
    <div className="flex-1 rounded-md border border-edge bg-surface">
      <div className="flex items-baseline justify-between border-b border-edge px-3 py-2">
        <span className="text-[10px] font-medium tracking-wider text-ink-3 uppercase">
          Event stream
        </span>
        <span className="font-mono text-[9px] tracking-widest text-ink-3">
          APPEND-ONLY
        </span>
      </div>
      <div className="max-h-[280px] overflow-y-auto">
        {events.map((e) => (
          <div
            key={e.id}
            className="flex items-center gap-2 border-b border-edge/60 px-3 py-1.5"
          >
            <span className="font-mono text-[9px] tabular-nums text-ink-3">
              {new Date(e.ts * 1000).toLocaleTimeString("en-US", { hour12: false })}
            </span>
            <KindChip kind={e.kind} />
            <span className="truncate font-mono text-[10px] text-ink-2">
              {String(e.detail ?? e.message ?? e.site_id)}
            </span>
          </div>
        ))}
        {events.length === 0 && (
          <div className="px-3 py-5 text-center font-mono text-[10px] text-ink-3">
            AWAITING EVENTS
          </div>
        )}
      </div>
    </div>
  );
}
