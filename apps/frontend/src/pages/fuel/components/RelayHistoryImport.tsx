import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../../../auth/useAuth";
import { getRelayFuelBackfillStatus, runRelayFuelBackfill } from "../../../api/relayDeposits";

// B3a — Owner-only "Import Relay history" control. The daily cron only pulls yesterday; this triggers the
// historical backfill (3-day windows, idempotent + resumable) so the owner can seed full history in-app
// instead of POSTing from a console. Returns 202 immediately; rows land in Fuel transactions as windows
// complete. Owner-only (the backend also enforces Owner/Administrator).
export function RelayHistoryImport({ operatingCompanyId }: { operatingCompanyId: string }) {
  const { user } = useAuth();
  const [months, setMonths] = useState(24);
  const [state, setState] = useState<"idle" | "starting" | "started" | "error">("idle");
  const [msg, setMsg] = useState("");
  const lifecycleGenerationRef = useRef(0);
  const statusQuery = useQuery({
    queryKey: ["relay", "fuel-backfill-status", operatingCompanyId],
    queryFn: () => getRelayFuelBackfillStatus(operatingCompanyId),
    enabled: Boolean(operatingCompanyId) && user?.role === "Owner",
    refetchInterval: (query) => query.state.data?.run?.status === "running" ? 3_000 : false,
  });

  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    setMonths(24);
    setState("idle");
    setMsg("");
  }, [operatingCompanyId]);

  if (user?.role !== "Owner") return null;

  const onImport = async () => {
    const request = {
      companyId: operatingCompanyId,
      months,
      generation: lifecycleGenerationRef.current,
    };
    setState("starting");
    setMsg("");
    try {
      const res = await runRelayFuelBackfill(request.companyId, request.months);
      if (request.generation !== lifecycleGenerationRef.current) return;
      setState("started");
      setMsg(`Backfill started for the last ${res.months} month(s). Progress updates here automatically.`);
      await statusQuery.refetch();
    } catch (e) {
      if (request.generation !== lifecycleGenerationRef.current) return;
      setState("error");
      setMsg(String((e as Error)?.message ?? e));
    }
  };

  return (
    <div className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-[11px]">
      <div className="text-[10px] uppercase text-gray-500">Import Relay history</div>
      <div className="mt-1 flex items-center gap-2">
        <label className="text-gray-600">
          Months
          <input
            type="number"
            min={1}
            max={36}
            value={months}
            onChange={(e) => setMonths(Math.min(36, Math.max(1, Number(e.target.value) || 24)))}
            className="ml-1 w-16 rounded-sm border border-gray-300 px-1 py-0.5"
          />
        </label>
        <button
          type="button"
          onClick={onImport}
          disabled={state === "starting" || statusQuery.data?.run?.status === "running"}
          className="rounded-sm border border-gray-300 px-2 py-0.5 font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          {state === "starting" || statusQuery.data?.run?.status === "running" ? "Running…" : "Import"}
        </button>
      </div>
      {msg ? <div className={`mt-1 ${state === "error" ? "text-red-700" : "text-gray-600"}`}>{msg}</div> : null}
      {statusQuery.isError ? <div className="mt-1 text-red-700">Backfill status unavailable.</div> : null}
      {statusQuery.data?.run ? (
        <div className={`mt-1 ${statusQuery.data.run.status === "failed" ? "text-red-700" : "text-gray-600"}`} data-testid="relay-backfill-status">
          Status: {statusQuery.data.run.status}
          {statusQuery.data.run.status === "completed" ? ` · ${statusQuery.data.run.upserted ?? 0} row(s) processed` : ""}
          {statusQuery.data.run.error ? ` · ${statusQuery.data.run.error}` : ""}
        </div>
      ) : null}
    </div>
  );
}
