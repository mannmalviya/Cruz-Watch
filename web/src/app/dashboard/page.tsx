import type { Metadata } from "next";
import Dashboard from "@/components/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard — CruzWatch",
  description: "Live detection feeds, telemetry, and incident stream.",
};

export default function DashboardPage() {
  return <Dashboard />;
}
