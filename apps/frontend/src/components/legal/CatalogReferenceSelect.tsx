import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCustomers, listVendors } from "../../api/mdata";
import { ReferenceSelect, type ReferenceOption } from "../parity/ReferenceSelect";
import { CappedListNotice } from "../CappedListNotice";

const ROSTER_LIMIT = 2000;

/**
 * ROUND 316 — the canonical full-catalog picker for contract pages: ReferenceSelect over the entity's whole vendor /
 * customer roster with inline "+ Add new" (createKind), same onChange(id, { label }) contract the contract creators
 * already use. Replaces EntityPicker on Legal → Contracts so every party picker is the one ReferenceSelect.
 */
type Props = {
  kind: "vendor" | "customer";
  operatingCompanyId: string;
  value: string | null;
  onChange: (id: string | null, option?: { label: string }) => void;
  placeholder?: string;
  allowCreate?: boolean;
  nestedInDrawer?: boolean;
  enabled?: boolean;
  dataField?: string;
  className?: string;
  "data-testid"?: string;
};

export function CatalogReferenceSelect({ kind, operatingCompanyId, value, onChange, placeholder, enabled = true, dataField, className, "data-testid": testId }: Props) {
  const q = useQuery({
    queryKey: ["catalog-reference", kind, operatingCompanyId],
    queryFn: async (): Promise<{ options: ReferenceOption[]; total: number | null }> => {
      if (kind === "vendor") {
        const raw = (await listVendors({ operating_company_id: operatingCompanyId, limit: ROSTER_LIMIT })) as unknown;
        const rows = Array.isArray(raw) ? raw : ((raw as { vendors?: unknown[] })?.vendors ?? []);
        const total = Array.isArray(raw) ? null : ((raw as { total?: number })?.total ?? null);
        return { options: (rows as Array<{ id: string; name: string }>).map((v) => ({ value: v.id, label: v.name })), total };
      }
      const raw = (await listCustomers({ operating_company_id: operatingCompanyId, limit: ROSTER_LIMIT })) as unknown;
      const rows = Array.isArray(raw) ? raw : ((raw as { customers?: unknown[] })?.customers ?? []);
      const total = Array.isArray(raw) ? null : ((raw as { total?: number })?.total ?? null);
      return { options: (rows as Array<{ id: string; customer_name?: string | null; name?: string | null }>).map((c) => ({ value: c.id, label: c.customer_name ?? c.name ?? c.id })), total };
    },
    enabled: Boolean(operatingCompanyId) && enabled,
  });
  const options = useMemo(() => q.data?.options ?? [], [q.data]);
  return (
    <div data-testid={testId} data-field={dataField} className={className}>
      <ReferenceSelect
        value={value}
        onChange={(id) => onChange(id, id ? { label: options.find((o) => o.value === id)?.label ?? "" } : undefined)}
        options={options}
        createKind={kind}
        operatingCompanyId={operatingCompanyId}
        placeholder={placeholder ?? (kind === "vendor" ? "Select vendor…" : "Select customer…")}
        loading={q.isLoading}
        disabled={!enabled}
        onOptionCreated={(opt) => { void q.refetch(); onChange(opt.value, { label: opt.label }); }}
      />
      <CappedListNotice shown={options.length} limit={ROSTER_LIMIT} total={q.data?.total ?? null} hint={kind === "vendor" ? "Type to search, or narrow the vendor list." : "Type to search, or narrow the customer list."} />
    </div>
  );
}
