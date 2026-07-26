"use client";

import { useEffect, useState } from "react";
import { API, Site } from "@/lib/types";

/* Landing-page proof of life: polls the real backend every 5s. */
export default function LiveStrip() {
  const [sites, setSites] = useState<Site[] | null>(null);
  const [down, setDown] = useState(false);

  useEffect(() => {
    let alive = true;
    const poll = () =>
      fetch(`${API}/api/sites`)
        .then((r) => r.json())
        .then((s: Site[]) => {
          if (!alive) return;
          setSites(s);
          setDown(false);
        })
        .catch(() => alive && setDown(true));
    poll();
    const id = setInterval(poll, 5000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (down) {
    return (
      <span className="inline-flex items-center gap-2 rounded-sm border border-edge bg-surface px-3 py-1.5 font-mono text-[10px] tracking-wider text-ink-2">
        <span className="h-1.5 w-1.5 rounded-full bg-accent" />
        RECORDED DETECTOR OUTPUT ON THE DASHBOARD
      </span>
    );
  }
  if (!sites) {
    return (
      <span className="inline-flex items-center gap-2 rounded-sm border border-edge bg-surface px-3 py-1.5 font-mono text-[10px] tracking-wider text-ink-3">
        …
      </span>
    );
  }
  const tracked = sites.reduce((a, s) => a + (s.runtime?.person_count ?? 0), 0);
  const fps = sites.length
    ? sites.reduce((a, s) => a + (s.runtime?.fps ?? 0), 0) / sites.length
    : 0;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1 rounded-sm border border-edge bg-surface px-3 py-1.5 font-mono text-[10px] tracking-wider text-ink-2">
      <span className="inline-flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" />
        {sites.length} SITES ONLINE
      </span>
      <span className="text-ink-3">·</span>
      <span>{tracked} TRACKED NOW</span>
      <span className="text-ink-3">·</span>
      <span>{fps.toFixed(1)} FPS MEAN</span>
    </span>
  );
}
