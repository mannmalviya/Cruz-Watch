"use client";

import { useRef, useState } from "react";

/*
 * Giant CRUZWATCH wordmark. The letters sit as hollow outlines until the
 * cursor passes over them — a masked copy underneath is revealed inside a
 * circle that follows the pointer, with a detection reticle riding along.
 * Pointer position is written straight to CSS vars (no state, no re-render).
 */
export default function HeroWordmark() {
  const ref = useRef<HTMLDivElement>(null);
  const [live, setLive] = useState(false);

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty("--mx", `${e.clientX - r.left}px`);
    el.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <div
      ref={ref}
      onPointerMove={move}
      onPointerEnter={() => setLive(true)}
      onPointerLeave={() => setLive(false)}
      className="wordmark relative isolate cursor-crosshair touch-none select-none"
      style={{ ["--r" as string]: live ? "170px" : "0px" }}
    >
      <h1 className="wordmark-base text-center text-[clamp(2.75rem,14.5vw,12.5rem)] leading-[0.9] font-semibold tracking-tighter">
        CRUZWATCH
      </h1>

      {/* revealed copy — identical glyphs, clipped to the pointer circle */}
      <span
        aria-hidden
        className="wordmark-lit absolute inset-0 text-center text-[clamp(2.75rem,14.5vw,12.5rem)] leading-[0.9] font-semibold tracking-tighter"
      >
        CRUZWATCH
      </span>

      {/* detection reticle */}
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 h-[150px] w-[150px] transition-opacity duration-200"
        style={{
          transform: "translate(calc(var(--mx,50%) - 75px), calc(var(--my,50%) - 75px))",
          opacity: live ? 1 : 0,
        }}
      >
        {["top-0 left-0 border-t-2 border-l-2", "top-0 right-0 border-t-2 border-r-2", "bottom-0 left-0 border-b-2 border-l-2", "bottom-0 right-0 border-r-2 border-b-2"].map(
          (c) => (
            <span key={c} className={`absolute h-4 w-4 border-accent ${c}`} />
          ),
        )}
        <span className="absolute -bottom-5 left-0 font-mono text-[9px] tracking-[0.2em] text-accent">
          TRACK_01 · 0.94
        </span>
      </span>
    </div>
  );
}
