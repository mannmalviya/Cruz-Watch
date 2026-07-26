"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* Radar glyph: static rings + a slow conic sweep. */
function Glyph() {
  return (
    <span className="relative inline-flex h-7 w-7 items-center justify-center">
      <span className="absolute inset-0 rounded-full border border-accent/40" />
      <span className="absolute inset-[6px] rounded-full border border-accent/25" />
      <span
        className="radar-sweep absolute inset-0 rounded-full"
        style={{
          background:
            "conic-gradient(from 0deg, transparent 0deg, transparent 300deg, color-mix(in oklab, var(--color-accent) 55%, transparent) 360deg)",
        }}
      />
      <span className="relative h-1.5 w-1.5 rounded-full bg-accent" />
    </span>
  );
}

export default function Header() {
  const pathname = usePathname();
  const onDashboard = pathname.startsWith("/dashboard");

  return (
    <header className="sticky top-0 z-50 border-b border-edge bg-plane/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-6 px-6 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Glyph />
          <span className="text-xl font-semibold tracking-tight">
            Cruz<span className="text-accent">Watch</span>
          </span>
        </Link>

        <nav className="ml-auto flex items-center gap-2">
          <Link
            href="/"
            className={`rounded-md px-3.5 py-2 text-sm font-medium transition ${
              !onDashboard
                ? "text-ink"
                : "text-ink-3 hover:bg-raised hover:text-ink-2"
            }`}
          >
            Overview
          </Link>
          <Link
            href="/dashboard"
            className={`rounded-md px-3.5 py-2 text-sm font-semibold transition ${
              onDashboard
                ? "bg-accent/15 text-ink"
                : "bg-accent text-plane hover:brightness-110"
            }`}
          >
            Dashboard
          </Link>
        </nav>
      </div>
    </header>
  );
}
