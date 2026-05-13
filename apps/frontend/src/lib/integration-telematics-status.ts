import type { SamsaraPublicHealth } from "../api/samsara";

const HOUR_MS = 60 * 60 * 1000;

function checkOlderThan(iso: string | null, ms: number): boolean {
  if (!iso) return true;
  return Date.now() - new Date(iso).getTime() > ms;
}

export type SamsaraVisualStatus = {
  label: string;
  dot: "gray" | "green" | "yellow" | "red";
  title?: string;
};

/**
 * Honest Samsara strip/topbar copy — never fabricates vehicle counts or sync times.
 */
export function resolveSamsaraVisualStatus(health: SamsaraPublicHealth | undefined): SamsaraVisualStatus {
  if (!health) {
    return { label: "Samsara: …", dot: "gray" };
  }
  if (!health.is_configured || !health.is_enabled) {
    return { label: "Samsara: not configured", dot: "gray" };
  }

  const staleByStatus = health.last_health_status === "stale";
  const staleByAge =
    health.last_health_status === "ok" && checkOlderThan(health.last_health_check_at, HOUR_MS);

  if (staleByStatus || staleByAge) {
    return { label: "Samsara: stale", dot: "yellow" };
  }

  if (health.last_health_status === "ok") {
    return { label: "Samsara: live", dot: "green" };
  }

  if (health.last_health_status === "error") {
    return {
      label: "Samsara: error",
      dot: "red",
      title: health.last_error ? String(health.last_error) : undefined,
    };
  }

  return { label: "Samsara: not configured", dot: "gray" };
}

export function qboConnectionLabel(connected: boolean | undefined): { label: string; dot: "gray" | "green" } {
  if (connected === true) return { label: "QuickBooks: connected", dot: "green" };
  return { label: "QuickBooks: not connected", dot: "gray" };
}

export const RELAY_NOT_CONFIGURED: SamsaraVisualStatus = { label: "Relay: not configured", dot: "gray" };
