import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";

type UnitTollTag = {
  uuid: string;
  tag_network: string;
  tag_number: string;
  activated_at: string;
  deactivated_at: string | null;
  monthly_fee: string | null;
  balance_current: string | null;
  auto_replenish: boolean;
};

type TollTagsResponse = {
  toll_tags: UnitTollTag[];
  low_balance_tags: UnitTollTag[];
};

type UnitTollTagsTabProps = {
  unitId: string;
  companyId: string;
};

function fetchTollTags(unitId: string, companyId: string) {
  return apiRequest<TollTagsResponse>(
    `/api/units/${unitId}/toll-tags?operating_company_id=${encodeURIComponent(companyId)}`
  );
}

function formatMoney(value: string | null) {
  if (value == null || value === "") return "—";
  const num = Number(value);
  if (!Number.isFinite(num)) return value;
  return `$${num.toFixed(2)}`;
}

export function UnitTollTagsTab({ unitId, companyId }: UnitTollTagsTabProps) {
  const tagsQuery = useQuery({
    queryKey: ["unit-toll-tags", unitId, companyId],
    queryFn: () => fetchTollTags(unitId, companyId),
    enabled: Boolean(unitId && companyId),
  });

  const lowBalanceIds = new Set((tagsQuery.data?.low_balance_tags ?? []).map((tag) => tag.uuid));

  return (
    <section className="rounded border border-gray-200 bg-white p-3" data-testid="unit-toll-tags-tab">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Toll Tags</h3>
        <span className="text-xs text-gray-500">TxTAG · EZ-Pass · I-Pass</span>
      </div>
      {tagsQuery.isLoading ? <p className="mt-2 text-xs text-gray-500">Loading toll tags...</p> : null}
      <div className="mt-2 overflow-auto">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-[11px] uppercase text-gray-600">
            <tr>
              <th className="px-2 py-2">Network</th>
              <th className="px-2 py-2">Tag #</th>
              <th className="px-2 py-2">Activated</th>
              <th className="px-2 py-2">Balance</th>
              <th className="px-2 py-2">Monthly</th>
              <th className="px-2 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {(tagsQuery.data?.toll_tags ?? []).map((tag) => (
              <tr key={tag.uuid} className="border-b border-gray-100">
                <td className="px-2 py-2 font-medium uppercase text-gray-900">{tag.tag_network}</td>
                <td className="px-2 py-2">{tag.tag_number}</td>
                <td className="px-2 py-2">{tag.activated_at}</td>
                <td className="px-2 py-2">
                  <span className={lowBalanceIds.has(tag.uuid) ? "font-semibold text-amber-700" : ""}>
                    {formatMoney(tag.balance_current)}
                  </span>
                  {lowBalanceIds.has(tag.uuid) ? (
                    <span className="ml-1 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-semibold text-amber-800">
                      Low
                    </span>
                  ) : null}
                </td>
                <td className="px-2 py-2">{formatMoney(tag.monthly_fee)}</td>
                <td className="px-2 py-2">{tag.deactivated_at ? "Deactivated" : "Active"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!tagsQuery.isLoading && (tagsQuery.data?.toll_tags.length ?? 0) === 0 ? (
        <p className="mt-2 text-xs text-gray-500">No toll tags assigned to this unit.</p>
      ) : null}
    </section>
  );
}
