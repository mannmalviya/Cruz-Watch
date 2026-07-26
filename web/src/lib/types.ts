export type Provenance =
  | "SYNTHETIC_FOOTAGE"
  | "ARCHIVED_FOOTAGE"
  | "REAL_CV"
  | "REAL_GEMMA_LOCAL"
  | "TEMPLATE_FALLBACK"
  | "SIMULATED_DISPATCH";

export interface Zone {
  id: string;
  kind: string;
  label: string;
  polygon: number[][];
}

export interface Site {
  id: string;
  name: string;
  type: "COASTAL" | "URBAN" | "PARK";
  location: { lat: number; lng: number };
  clip: string;
  footage_provenance: Provenance;
  footage_note: string;
  frame_size: [number, number];
  zones: Zone[];
  armed_primitives: string[];
  thresholds: Record<string, number>;
  responder: string;
  agent_context: string;
  runtime: { status: string; fps: number; person_count: number };
}

export interface CruzEvent {
  id: number;
  ts: number;
  kind:
    | "telemetry"
    | "hazard"
    | "agent_input"
    | "agent_start"
    | "agent_token"
    | "incident"
    | "dispatch"
    | "clip_loop"
    | "error";
  site_id: string;
  provenance: Provenance;
  [k: string]: unknown;
}

export const API =
  process.env.NEXT_PUBLIC_API ?? "http://127.0.0.1:8000";
export const WS = API.replace(/^http/, "ws") + "/ws";
