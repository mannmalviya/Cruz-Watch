import { Provenance } from "@/lib/types";

/* Provenance chips. Trust-state colors ride the reserved status palette and
   always ship with a text label — never color alone. Gemma wears the agent
   magenta (validated against the accent blue). */
const PROVENANCE: Record<Provenance, { label: string; cls: string }> = {
  REAL_CV: {
    label: "REAL CV",
    cls: "bg-good/10 text-ink-2 ring-good/40",
  },
  REAL_GEMMA_LOCAL: {
    label: "GEMMA 4 · LOCAL",
    cls: "bg-agent/10 text-ink-2 ring-agent/40",
  },
  SYNTHETIC_FOOTAGE: {
    label: "STAND-IN FOOTAGE",
    cls: "bg-warn/10 text-ink-2 ring-warn/40",
  },
  ARCHIVED_FOOTAGE: {
    label: "REAL SITE · ARCHIVED",
    cls: "bg-accent/10 text-ink-2 ring-accent/40",
  },
  TEMPLATE_FALLBACK: {
    label: "TEMPLATE FALLBACK",
    cls: "bg-raised text-ink-2 ring-edge",
  },
  SIMULATED_DISPATCH: {
    label: "SIMULATED",
    cls: "bg-critical/10 text-ink-2 ring-critical/40",
  },
};

const PROVENANCE_DOT: Record<Provenance, string> = {
  REAL_CV: "bg-good",
  REAL_GEMMA_LOCAL: "bg-agent",
  SYNTHETIC_FOOTAGE: "bg-warn",
  ARCHIVED_FOOTAGE: "bg-accent",
  TEMPLATE_FALLBACK: "bg-ink-3",
  SIMULATED_DISPATCH: "bg-critical",
};

export function ProvenanceBadge({ p }: { p: Provenance }) {
  const s = PROVENANCE[p];
  if (!s) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 font-mono text-[9px] font-medium tracking-widest ring-1 ${s.cls}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${PROVENANCE_DOT[p]}`} />
      {s.label}
    </span>
  );
}

/* Site status. Icon + label always — color never carries state alone. */
const STATUS: Record<string, { icon: string; cls: string; dot: string }> = {
  MONITORING: { icon: "●", cls: "text-ink-2", dot: "text-good" },
  TRIGGERED: { icon: "▲", cls: "text-ink", dot: "text-critical" },
  ERROR: { icon: "◆", cls: "text-ink-2", dot: "text-serious" },
  OFFLINE: { icon: "○", cls: "text-ink-3", dot: "text-ink-3" },
};

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.OFFLINE;
  const pulse = status === "TRIGGERED" ? "animate-pulse" : "";
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[10px] font-medium tracking-widest ${s.cls}`}>
      <span className={`${s.dot} ${pulse} text-[9px] leading-none`}>{s.icon}</span>
      {status}
    </span>
  );
}

/* Event-kind chip for the stream log. Tinted background, neutral ink. */
const KIND: Record<string, string> = {
  hazard: "bg-critical/15 ring-critical/40",
  incident: "bg-agent/15 ring-agent/40",
  agent_input: "bg-agent/10 ring-agent/30",
  agent_start: "bg-agent/15 ring-agent/40",
  dispatch: "bg-serious/15 ring-serious/40",
  error: "bg-warn/15 ring-warn/40",
  clip_loop: "bg-raised ring-edge",
};

export function KindChip({ kind }: { kind: string }) {
  return (
    <span
      className={`inline-block w-[74px] shrink-0 rounded-sm px-1 py-px text-center font-mono text-[9px] font-medium tracking-wider text-ink-2 ring-1 ${KIND[kind] ?? "bg-raised ring-edge"}`}
    >
      {kind}
    </span>
  );
}
