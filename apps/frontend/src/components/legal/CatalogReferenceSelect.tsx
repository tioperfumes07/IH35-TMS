import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listCustomers, listVendors } from "../../api/mdata";
import { ReferenceSelect, type ReferenceOption } from "../parity/ReferenceSelect";
import { CappedListNotice } from "../CappedListNotice";

// The vendors / customers endpoints cap a page at 200 — typing searches the WHOLE entity roster on the server.
const PAGE_LIMIT = 200;

/**
 * ROUND 316 — the canonical party picker for contract pages: ReferenceSelect with company-scoped SERVER search
 * (every keystroke, debounced, queries the entity's full vendor / customer roster — nothing beyond a page is ever
 * unreachable) and inline "+ Add new" (createKind), same onChange(id, { label }) contract the contract creators use.
 * The selected party stays in the options while the search moves on, so its label never blanks.
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
  const [partySearch, setPartySearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selected, setSelected] = useState<ReferenceOption | null>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(partySearch.trim()), 250);
    return () => clearTimeout(t);
  }, [partySearch]);

  const q = useQuery({
    queryKey: ["catalog-reference", kind, operatingCompanyId, debouncedSearch],
    queryFn: async (): Promise<{ options: ReferenceOption[]; total: number | null }> => {
      const params = { operating_company_id: operatingCompanyId, limit: PAGE_LIMIT, search: debouncedSearch || undefined };
      if (kind === "vendor") {
        const raw = (await listVendors(params)) as unknown;
        const rows = Array.isArray(raw) ? raw : ((raw as { vendors?: unknown[] })?.vendors ?? []);
        const total = Array.isArray(raw) ? null : ((raw as { total?: number })?.total ?? null);
        return { options: (rows as Array<{ id: string; name: string }>).map((v) => ({ value: v.id, label: v.name })), total };
      }
      const raw = (await listCustomers(params)) as unknown;
      const rows = Array.isArray(raw) ? raw : ((raw as { customers?: unknown[] })?.customers ?? []);
      const total = Array.isArray(raw) ? null : ((raw as { total?: number })?.total ?? null);
      return { options: (rows as Array<{ id: string; customer_name?: string | null; name?: string | null }>).map((c) => ({ value: c.id, label: c.customer_name ?? c.name ?? c.id })), total };
    },
    enabled: Boolean(operatingCompanyId) && enabled,
    placeholderData: (prev) => prev,
  });

  const options = useMemo(() => {
    const page = q.data?.options ?? [];
    return selected && selected.value === value && !page.some((o) => o.value === selected.value) ? [selected, ...page] : page;
  }, [q.data, selected, value]);

  const pick = (id: string | null, label?: string) => {
    const opt = id ? { value: id, label: label ?? options.find((o) => o.value === id)?.label ?? "" } : null;
    setSelected(opt);
    onChange(id, opt ? { label: opt.label } : undefined);
  };

  return (
    <div data-testid={testId} data-field={dataField} className={className}>
      <ReferenceSelect
        value={value}
        onChange={(id) => pick(id)}
        options={options}
        createKind={kind}
        operatingCompanyId={operatingCompanyId}
        placeholder={placeholder ?? (kind === "vendor" ? "Search vendors…" : "Search customers…")}
        loading={q.isLoading}
        disabled={!enabled}
        onSearch={setPartySearch}
        onOptionCreated={(opt) => { void q.refetch(); pick(opt.value, opt.label); }}
      />
      {!debouncedSearch ? (
        <CappedListNotice shown={q.data?.options.length ?? 0} limit={PAGE_LIMIT} total={q.data?.total ?? null} hint={kind === "vendor" ? "Type to search every vendor." : "Type to search every customer."} />
      ) : null}
    </div>
  );
}
