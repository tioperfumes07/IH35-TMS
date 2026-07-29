import { useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";

/**
 * Shows the version the BACKEND is actually running.
 *
 * It used to read `import.meta.env.VITE_BUILD_COMMIT`, which is wrong twice over: that is a
 * FRONTEND build-time constant, not the backend at all, and it is not set in the frontend build — so
 * the footer read "Backend version: not available" on every load while /api/v1/healthz/shallow was
 * happily returning the real sha. A label that names the backend has to come from the backend.
 *
 * This matters beyond cosmetics: the deploy-verification step in this repo is "poll healthz/shallow
 * until version == the merge sha". Surfacing it in the product means anyone can answer "what is
 * actually deployed right now" without a terminal.
 */
export function BackendVersionFooter({ className }: { className?: string }) {
  const query = useQuery({
    queryKey: ["backend-version"],
    queryFn: async () => {
      const res = await fetch(resolveApiUrl("/api/v1/healthz/shallow"), { credentials: "include" });
      if (!res.ok) throw new Error(`healthz ${res.status}`);
      const body = (await res.json()) as { version?: unknown };
      const version = String(body?.version ?? "").trim();
      if (!version) throw new Error("healthz returned no version");
      return version;
    },
    staleTime: 60_000,
    retry: 1,
  });

  // Distinguish the three states honestly rather than collapsing them all into "not available":
  // still asking, the backend answered, or the call failed.
  const label = query.isPending
    ? "checking…"
    : query.isError
      ? "unreachable"
      : query.data;

  return (
    <footer className={className ?? "text-xs text-gray-500"}>
      Backend version: {label}
    </footer>
  );
}
