import { useQuery } from "@tanstack/react-query";
import { useCompanyContext } from "../../contexts/CompanyContext";

async function apiGet(path: string) {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  return res.json();
}

export function RandomTestingPool() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";

  const poolQ = useQuery({
    queryKey: ["compliance", "drug-alcohol", "pool", companyId],
    enabled: Boolean(companyId),
    queryFn: () => apiGet(`/api/v1/compliance/drug-alcohol/pool?operating_company_id=${encodeURIComponent(companyId)}`),
  });

  const drawsQ = useQuery({
    queryKey: ["compliance", "drug-alcohol", "draws", companyId],
    enabled: Boolean(companyId),
    queryFn: () => apiGet(`/api/v1/compliance/drug-alcohol/draws?operating_company_id=${encodeURIComponent(companyId)}`),
  });

  const members = (poolQ.data as { members?: Array<Record<string, unknown>> })?.members ?? [];
  const draws = (drawsQ.data as { draws?: Array<Record<string, unknown>> })?.draws ?? [];
  const selections = (drawsQ.data as { selections?: Array<Record<string, unknown>> })?.selections ?? [];

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded border border-gray-200 bg-white p-4 text-xs">
        <h3 className="text-sm font-semibold text-slate-900">Active pool ({members.length})</h3>
        <ul className="mt-2 max-h-48 space-y-1 overflow-y-auto">
          {members.map((member) => (
            <li key={String(member.driver_id)} className="flex justify-between border-b border-gray-100 py-1">
              <span>{String(member.driver_id).slice(0, 8)}…</span>
              <span>{String(member.added_at ?? "").slice(0, 10)}</span>
            </li>
          ))}
          {members.length === 0 ? <li className="text-slate-500">No active CDL drivers in pool.</li> : null}
        </ul>
      </div>
      <div className="rounded border border-gray-200 bg-white p-4 text-xs">
        <h3 className="text-sm font-semibold text-slate-900">Recent draws & selections</h3>
        <ul className="mt-2 space-y-1">
          {draws.slice(0, 5).map((draw) => (
            <li key={String(draw.id)} className="border-b border-gray-100 py-1">
              Q{String(draw.quarter)} {String(draw.year)} — drug {String(draw.drug_count)} / alcohol{" "}
              {String(draw.alcohol_count)}
            </li>
          ))}
          {draws.length === 0 ? <li className="text-slate-500">No draws yet.</li> : null}
        </ul>
        <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto">
          {selections.slice(0, 12).map((sel) => (
            <li key={String(sel.id)} className="flex justify-between border-b border-gray-50 py-0.5">
              <span>{String(sel.driver_id).slice(0, 8)}…</span>
              <span>{String(sel.test_type)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
