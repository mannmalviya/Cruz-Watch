"use client";

import { useCallback, useRef, useState } from "react";

export interface SparkPoint {
  t: number; // unix seconds
  v: number;
}

/* Stat-tile trend sparkline per the mark spec: 2px round-joined line in the
   de-emphasis hue, current point as a ≥8px marker in the accent with a 2px
   surface ring. Hover snaps to the nearest sample and reports it upward. */
export default function Sparkline({
  data,
  width = 120,
  height = 32,
  accent = "var(--color-accent)",
  onHover,
}: {
  data: SparkPoint[];
  width?: number;
  height?: number;
  accent?: string;
  onHover?: (p: SparkPoint | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const pad = 5; // room for the end-marker ring
  const n = data.length;

  const xy = useCallback(
    (i: number) => {
      const vs = data.map((d) => d.v);
      const lo = Math.min(...vs);
      const hi = Math.max(...vs);
      const span = hi - lo || 1;
      const x = pad + (i / Math.max(n - 1, 1)) * (width - pad * 2);
      const y = pad + (1 - (data[i].v - lo) / span) * (height - pad * 2);
      return [x, y] as const;
    },
    [data, n, width, height],
  );

  if (n < 2) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center font-mono text-[9px] text-ink-3"
      >
        …
      </div>
    );
  }

  const pts = data.map((_, i) => xy(i).join(",")).join(" ");
  const [ex, ey] = xy(n - 1);
  const hover = hoverIdx !== null ? xy(hoverIdx) : null;

  const handleMove = (e: React.MouseEvent) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * width;
    const i = Math.round(((x - pad) / (width - pad * 2)) * (n - 1));
    const idx = Math.min(Math.max(i, 0), n - 1);
    setHoverIdx(idx);
    onHover?.(data[idx]);
  };
  const handleLeave = () => {
    setHoverIdx(null);
    onHover?.(null);
  };

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      role="img"
      aria-label="trend sparkline"
    >
      <polyline
        points={pts}
        fill="none"
        stroke="var(--color-ink-3)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* current point: accent marker with surface ring */}
      <circle cx={ex} cy={ey} r="4" fill={accent} stroke="var(--color-surface)" strokeWidth="2" />
      {hover && hoverIdx !== n - 1 && (
        <circle cx={hover[0]} cy={hover[1]} r="4" fill={accent} stroke="var(--color-surface)" strokeWidth="2" />
      )}
    </svg>
  );
}
