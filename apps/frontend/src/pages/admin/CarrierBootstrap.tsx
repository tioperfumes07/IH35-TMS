import { useMutation, useQuery } from "@tanstack/react-query";
import { resolveApiUrl } from "../../api/client";
import { useState } from "react";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";

type HiddenCarrier = {
  id: string;
  code: string;
  legal_name: string;
  short_name: string | null;
  is_active: boolean;
  usdot_number: string | null;
  mc_number: string | null;
};

type BootstrapResult = {
  template_carrier_id: string;
  new_carrier_id: string;
  coa_cloned: number;
  storage_prefix: string;
  steps: Array<{ table: string; inserted: number; skipped: boolean }>;
};

async function fetchHiddenCarriers(): Promise<{ carriers: HiddenCarrier[] }> {
  const res = await fetch(resolveApiUrl("/api/v1/admin/carrier-bootstrap/hidden-carriers"), { credentials: "include" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function runBootstrap(body: { template_carrier_code: string; target_carrier_code: string }): Promise<BootstrapResult> {
  const res = await fetch(resolveApiUrl("/api/v1/admin/carrier-bootstrap/run"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error ?? `HTTP ${res.status}`);
  return payload;
}

export function CarrierBootstrapPage() {
  const auth = useAuth();
  const allowed = auth.user?.role === "Owner";
  const [lastResult, setLastResult] = useState<BootstrapResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const carriersQuery = useQuery({
    queryKey: ["admin-hidden-carriers"],
    queryFn: fetchHiddenCarriers,
    enabled: Boolean(allowed && auth.user),
  });

  const bootstrapMutation = useMutation({
    mutationFn: (targetCode: string) =>
      runBootstrap({ template_carrier_code: "TRANSP", target_carrier_code: targetCode }),
    onSuccess: (data) => {
      setLastResult(data);
      setError(null);
    },
    onError: (err) => setError(String((err as Error)?.message ?? err)),
  });

  if (!allowed) {
    return (
      <div className="p-6">
        <PageHeader title="Carrier bootstrap" subtitle="Owner access required." />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      <PageHeader
        title="Carrier bootstrap"
        subtitle="Hidden carriers (pre-launch) can pull TRANSP catalog + CoA templates."
      />

      {error ? <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div> : null}

      <section className="rounded border border-gray-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-lg font-semibold">Hidden carriers</h2>
        {carriersQuery.isLoading ? <p className="text-sm text-gray-600">Loading…</p> : null}
        {carriersQuery.isError ? (
          <p className="text-sm text-red-700">Failed to load hidden carriers.</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {(carriersQuery.data?.carriers ?? []).map((carrier) => (
              <li key={carrier.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-medium">
                    {carrier.short_name ?? carrier.legal_name}{" "}
                    <span className="text-gray-500">({carrier.code})</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    DOT {carrier.usdot_number ?? "—"} · MC {carrier.mc_number ?? "—"}
                  </p>
                </div>
                <button
                  type="button"
                  className="rounded bg-blue-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  disabled={bootstrapMutation.isPending}
                  onClick={() => bootstrapMutation.mutate(carrier.code)}
                >
                  {bootstrapMutation.isPending ? "Bootstrapping…" : "Bootstrap from TRANSP"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {lastResult ? (
        <section className="rounded border border-green-200 bg-green-50 p-4 text-sm">
          <p className="font-medium text-green-900">Bootstrap complete</p>
          <p className="text-green-800">CoA rows cloned: {lastResult.coa_cloned}</p>
          <p className="text-green-800">Storage prefix: {lastResult.storage_prefix}</p>
          <ul className="mt-2 list-disc pl-5 text-green-900">
            {lastResult.steps.map((step) => (
              <li key={step.table}>
                {step.table}: {step.skipped ? "skipped (already seeded)" : `${step.inserted} inserted`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
