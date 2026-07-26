import Link from "next/link";
import LiveStrip from "@/components/LiveStrip";
import HeroWordmark from "@/components/HeroWordmark";

const PRIMITIVES = [
  { name: "zone_dwell", line: "Enters a closed zone. Stays." },
  { name: "prone", line: "Upright becomes horizontal." },
  { name: "velocity_anomaly", line: "Speed breaks its own baseline." },
];

const PIPELINE = [
  { label: "camera", tone: "plain" },
  { label: "YOLO11n + ByteTrack", tone: "cv" },
  { label: "primitives", tone: "cv" },
  { label: "hazard event", tone: "plain" },
  { label: "Gemma 4 · local", tone: "agent" },
  { label: "dispatch", tone: "sim" },
] as const;

const TONE: Record<string, string> = {
  plain: "border-edge bg-surface text-ink-2",
  cv: "border-accent/40 bg-accent/10 text-ink-2",
  agent: "border-agent/40 bg-agent/10 text-ink-2",
  sim: "border-critical/40 bg-critical/10 text-ink-2",
};

export default function Home() {
  return (
    <main className="flex-1">
      {/* ---- hero ---- */}
      <section className="dotgrid border-b border-edge px-6 pt-16 pb-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-center font-mono text-[10px] tracking-[0.3em] text-accent">
            EDGE CV · LOCAL AGENT · SANTA CRUZ
          </p>
          <div className="mt-6">
            <HeroWordmark />
          </div>
          <p className="mx-auto mt-8 max-w-xl text-center text-lg leading-snug text-ink-2">
            Nobody is watching the places people actually drown.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="rounded-sm bg-accent px-5 py-2.5 text-sm font-semibold text-plane transition hover:brightness-110"
            >
              Open live console
            </Link>
            <LiveStrip />
          </div>
        </div>
      </section>

      {/* ---- how it works ---- */}
      <section className="border-b border-edge px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Watch cheaply. Reason rarely.
          </h2>
          <ul className="mt-8 space-y-4">
            <Bullet>CV on every frame.</Bullet>
            <Bullet>The agent only on a trigger.</Bullet>
            <Bullet>Context decides severity — never pixels.</Bullet>
          </ul>
          <div className="mt-10 overflow-x-auto">
            <div className="flex min-w-max items-center gap-2.5 font-mono text-[11px]">
              {PIPELINE.map((step, i) => (
                <div key={step.label} className="flex items-center gap-2.5">
                  <span className={`rounded-sm border px-3 py-1.5 ${TONE[step.tone]}`}>
                    {step.label}
                  </span>
                  {i < PIPELINE.length - 1 && <span className="text-ink-3">→</span>}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-4 font-mono text-[9px] tracking-wider text-ink-3">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" /> REAL CV
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-agent" /> LOCAL AGENT
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-critical" /> SIMULATED
            </span>
          </div>
        </div>
      </section>

      {/* ---- primitives ---- */}
      <section className="border-b border-edge px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            Three primitives. Every site.
          </h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            {PRIMITIVES.map((p) => (
              <div
                key={p.name}
                className="rounded-md border border-edge bg-surface p-5 transition hover:border-accent/40"
              >
                <code className="font-mono text-xs font-medium text-accent">
                  {p.name}
                </code>
                <p className="mt-3 text-lg leading-snug text-ink">{p.line}</p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-ink-3">
            Location changes configuration, never code.
          </p>
        </div>
      </section>

      {/* ---- honesty ---- */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            What is real, and what is not.
          </h2>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <Claim
              tone="real"
              label="Real"
              items={[
                "YOLO11n + ByteTrack · ~23 fps",
                "Triggers tuned on real footage",
                "Gemma 4, on-device",
              ]}
            />
            <Claim
              tone="sim"
              label="Simulated"
              items={[
                "Stand-in camera feeds",
                "Mock dispatch console",
                "Hardware unit is a concept",
              ]}
            />
          </div>
          <Link
            href="/dashboard"
            className="mt-10 inline-block rounded-sm border border-edge bg-surface px-5 py-2.5 text-sm font-medium text-ink transition hover:border-accent/50"
          >
            See it running →
          </Link>
        </div>
      </section>

      <footer className="border-t border-edge px-6 py-5">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[9px] tracking-wider text-ink-3">
          <span>CRUZWATCH — PROOF OF CONCEPT</span>
          <span>·</span>
          <span>BUILT FOR CRUZHACKS · GEMMAVERSE</span>
          <span>·</span>
          <span>RUNS ENTIRELY ON-DEVICE</span>
        </div>
      </footer>
    </main>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3.5 text-xl leading-snug text-ink sm:text-2xl">
      <span className="mt-2.5 h-1.5 w-1.5 shrink-0 bg-accent" />
      {children}
    </li>
  );
}

function Claim({
  tone,
  label,
  items,
}: {
  tone: "real" | "sim";
  label: string;
  items: string[];
}) {
  const cls =
    tone === "real" ? "border-good/30 bg-good/5" : "border-warn/30 bg-warn/5";
  const dot = tone === "real" ? "bg-good" : "bg-warn";
  return (
    <div className={`rounded-md border p-5 ${cls}`}>
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <span className="font-mono text-[10px] font-medium tracking-[0.2em] text-ink uppercase">
          {label}
        </span>
      </div>
      <ul className="mt-4 space-y-2.5">
        {items.map((i) => (
          <li key={i} className="text-base leading-snug text-ink-2">
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}
