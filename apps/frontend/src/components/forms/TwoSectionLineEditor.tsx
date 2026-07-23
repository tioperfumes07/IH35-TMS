import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { tirePositionsCatalogClient } from "../../api/catalogs-fleet";
import { getCoaAccounts } from "../../api/banking";
import { getWoCostContext } from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAccountingCategoriesQuery } from "../../hooks/useAccountingCategoriesQuery";
import { useAccountingItemsQuery } from "../../hooks/useAccountingItemsQuery";
import { POS_DICT, type PositionMeta } from "../../lib/positions";
import {
  CostBreakdownBox,
  type CategoryLine,
  type CostContextOption,
  type ItemLine,
  type ItemSubRow,
} from "./shared/CostBreakdownBox";
import { PartLocationMapDialog } from "./PartLocationMapDialog";
import { QuickCreateEntityModal, type QuickCreateKind } from "./shared/QuickCreateEntityModal";

export type TwoSectionMode = "wo" | "bill" | "expense";

export type TwoSectionSubRow = ItemSubRow;

export type TwoSectionLine = {
  id: string;
  section: "A" | "B";
  description: string;
  quantity: number;
  unit_cost: number;
  amount: number;
  expense_category_uuid?: string;
  service_item_uuid?: string;
  location_label?: string;
  sub_rows?: ItemSubRow[];
};

type Props = {
  mode: TwoSectionMode;
  initialLines?: TwoSectionLine[];
  onChange: (lines: TwoSectionLine[]) => void;
  unitUuid?: string;
  readOnly?: boolean;
  partsLaborMode?: "none" | "parts-only" | "parts-and-labor";
};

export function TwoSectionLineEditor({
  mode,
  initialLines = [],
  onChange,
  readOnly = false,
  partsLaborMode,
}: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const [lines, setLines] = useState<TwoSectionLine[]>(initialLines);
  const [locationTarget, setLocationTarget] = useState<{ lineId: string; subId: string } | null>(null);
  const [quickCreateTarget, setQuickCreateTarget] = useState<{ kind: QuickCreateKind; lineId?: string; subId?: string } | null>(null);
  const [categoryFetchActive, setCategoryFetchActive] = useState(mode === "bill");
  const [itemFetchActive, setItemFetchActive] = useState(mode === "bill");
  /** Optimistic CoA rows so a just-created category appears before refetch completes. */
  const [createdCategoryOptions, setCreatedCategoryOptions] = useState<CostContextOption[]>([]);

  const accountingCategoriesQuery = useAccountingCategoriesQuery({
    operatingCompanyId,
    enabled: Boolean(operatingCompanyId) && (mode === "bill" || categoryFetchActive),
  });
  const accountingItemsQuery = useAccountingItemsQuery({
    operatingCompanyId,
    kind: "service",
    enabled: Boolean(operatingCompanyId) && (mode === "bill" || itemFetchActive),
  });

  const costContextQuery = useQuery({
    queryKey: ["maintenance", "wo-cost-context", operatingCompanyId],
    queryFn: () => getWoCostContext(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    staleTime: 30_000,
  });
  // LIVE-DEFECT fix (GUARD 2026-07-12): the Bill/Expense Section-A Category selector must surface the FULL
  // Chart-of-Accounts — the SAME source the banking categorize screen uses (getCoaAccounts → /catalogs/accounts).
  // The old /api/v1/accounting/categories source returned empty/filtered, forcing users to create duplicate COA
  // accounts. Full COA is the primary source below; accounting-categories / cost-context stay as fallbacks.
  const coaAccountsQuery = useQuery({
    queryKey: ["catalogs", "coa-accounts", "line-category", operatingCompanyId],
    queryFn: () => getCoaAccounts(operatingCompanyId),
    enabled: Boolean(operatingCompanyId) && (mode === "bill" || categoryFetchActive),
    staleTime: 30_000,
  });
  const tirePositionsQuery = useQuery({
    queryKey: ["catalogs", "fleet", "tire-positions", operatingCompanyId, "active"],
    queryFn: () =>
      tirePositionsCatalogClient.list({
        operating_company_id: operatingCompanyId,
        is_active: "true",
        limit: 500,
      }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 60_000,
  });

  const updateLines = (next: TwoSectionLine[]) => {
    setLines(next);
    onChange(next);
  };

  const sectionA = useMemo(() => lines.filter((line) => line.section === "A"), [lines]) as CategoryLine[];
  const sectionB = useMemo(() => lines.filter((line) => line.section === "B"), [lines]) as ItemLine[];
  const expenseCategoryOptions = useMemo<CostContextOption[]>(() => {
    // PRIMARY: the full Chart-of-Accounts (same as banking categorize) — searchable existing accounts.
    const fromCoa = (coaAccountsQuery.data?.accounts ?? []).map((account) => ({
      id: String(account.id ?? ""),
      label: `${account.account_name ?? ""}`.trim(),
    }));
    const merged = new Map<string, CostContextOption>();
    for (const row of fromCoa) {
      if (row.id) merged.set(row.id, row);
    }
    for (const row of createdCategoryOptions) {
      if (row.id) merged.set(row.id, row);
    }
    if (merged.size > 0) return Array.from(merged.values());
    // FALLBACKS (only if the COA query hasn't resolved): accounting-categories, then cost-context.
    const fromAccounting = (accountingCategoriesQuery.data ?? []).map((entry) => ({
      id: String(entry.id ?? ""),
      label: `${entry.name ?? ""}`.trim() || String(entry.account_number ?? entry.qbo_id ?? ""),
    }));
    if (fromAccounting.length > 0) return fromAccounting;
    return (costContextQuery.data?.expense_categories ?? []).map((entry) => ({
      id: String(entry.id ?? ""),
      label: String(entry.name ?? ""),
    }));
  }, [
    coaAccountsQuery.data,
    accountingCategoriesQuery.data,
    costContextQuery.data?.expense_categories,
    createdCategoryOptions,
  ]);
  const itemOptions = useMemo<CostContextOption[]>(() => {
    const fromAccounting = (accountingItemsQuery.data ?? []).map((entry) => ({
      id: String(entry.id ?? ""),
      label: String(entry.name ?? ""),
    }));
    if (fromAccounting.length > 0) return fromAccounting;
    return (costContextQuery.data?.items ?? []).map((entry) => ({
      id: String(entry.id ?? ""),
      label: String(entry.name ?? ""),
    }));
  }, [accountingItemsQuery.data, costContextQuery.data?.items]);
  const partOptions = useMemo<CostContextOption[]>(
    () =>
      (costContextQuery.data?.parts ?? []).map((entry) => ({
        id: String(entry.id ?? ""),
        label: String(entry.part_description ?? entry.name ?? ""),
      })),
    [costContextQuery.data?.parts]
  );
  const locationOptions = useMemo<CostContextOption[]>(
    () =>
      (costContextQuery.data?.parts ?? [])
        .map((entry) => {
          const label = String(
            entry.location ??
              entry.location_label ??
              entry.bin_location ??
              entry.bin ??
              entry.warehouse_location ??
              ""
          ).trim();
          if (!label) return null;
          return { id: label.toLowerCase(), label };
        })
        .filter((row): row is CostContextOption => Boolean(row))
        .filter((row, index, all) => all.findIndex((candidate) => candidate.label === row.label) === index),
    [costContextQuery.data?.parts]
  );
  const defaultIncomeAccountQboId = useMemo(
    () => String((costContextQuery.data?.expense_categories ?? []).find((row) => Boolean(row.qbo_id))?.qbo_id ?? ""),
    [costContextQuery.data?.expense_categories]
  );
  const positionMetaByCode = useMemo<Record<string, PositionMeta>>(() => {
    const catalogRows = tirePositionsQuery.data?.rows ?? [];
    if (catalogRows.length === 0) return POS_DICT;
    const out: Record<string, PositionMeta> = {};
    for (const row of catalogRows) {
      const code = String(row.code ?? "").trim();
      if (!code) continue;
      const metadata = row.metadata ?? {};
      const sideRaw = String(metadata.side ?? "").toLowerCase();
      const side: PositionMeta["side"] = sideRaw === "left" || sideRaw === "right" || sideRaw === "center" ? sideRaw : "center";
      const fallback = POS_DICT[code];
      out[code] = {
        name: String(metadata.name ?? row.display_name ?? fallback?.name ?? code),
        group: String(metadata.group ?? fallback?.group ?? "Catalog"),
        side,
      };
    }
    return Object.keys(out).length > 0 ? out : POS_DICT;
  }, [tirePositionsQuery.data?.rows]);
  const allowedPositionCodes = useMemo<string[]>(
    () => Object.keys(positionMetaByCode),
    [positionMetaByCode]
  );

  const selectedLocationCodes =
    locationTarget == null
      ? []
      : lines
          .find((line) => line.id === locationTarget.lineId)
          ?.sub_rows?.find((row) => row.id === locationTarget.subId)?.part_location_codes ?? [];

  const onSectionAChange = (nextSectionA: CategoryLine[]) => {
    if (nextSectionA.length > 0) setCategoryFetchActive(true);
    updateLines([...nextSectionA.map((line) => ({ ...line, section: "A" as const })), ...sectionB.map((line) => ({ ...line, section: "B" as const }))]);
  };

  const onSectionBChange = (nextSectionB: ItemLine[]) => {
    if (nextSectionB.length > 0) setItemFetchActive(true);
    updateLines([...sectionA.map((line) => ({ ...line, section: "A" as const })), ...nextSectionB.map((line) => ({ ...line, section: "B" as const }))]);
  };

  return (
    <div className="space-y-4">
      <CostBreakdownBox
        sectionA={{ lines: sectionA }}
        sectionB={{ lines: sectionB }}
        expenseCategoryOptions={expenseCategoryOptions}
        itemOptions={itemOptions}
        partOptions={partOptions}
        locationOptions={locationOptions}
        operatingCompanyId={operatingCompanyId || undefined}
        onCategoryOptionCreated={(_lineId, opt) => {
          setCreatedCategoryOptions((prev) => {
            if (prev.some((row) => row.id === opt.id)) return prev;
            return [...prev, { id: opt.id, label: opt.label }];
          });
          void coaAccountsQuery.refetch();
        }}
        onQuickCreateCategory={(lineId) => setQuickCreateTarget({ kind: "category", lineId })}
        onQuickCreateItem={(lineId) => setQuickCreateTarget({ kind: "item", lineId })}
        onQuickCreatePart={(lineId, subId) => setQuickCreateTarget({ kind: "part", lineId, subId })}
        partsLaborMode={partsLaborMode ?? (mode === "wo" || mode === "bill" ? "parts-and-labor" : "parts-only")}
        variant={mode === "wo" ? "wo" : "default"}
        onSectionAChange={onSectionAChange}
        onSectionBChange={onSectionBChange}
        onOpenLocationMap={(lineId, subId) => setLocationTarget({ lineId, subId })}
        readOnly={readOnly}
      />
      {quickCreateTarget ? (
        <QuickCreateEntityModal
          open
          kind={quickCreateTarget.kind}
          operatingCompanyId={operatingCompanyId}
          defaultIncomeAccountQboId={defaultIncomeAccountQboId || undefined}
          onClose={() => setQuickCreateTarget(null)}
          onCreated={(created) => {
            if (quickCreateTarget.kind === "category" && quickCreateTarget.lineId) {
              updateLines(lines.map((line) => (line.id === quickCreateTarget.lineId ? { ...line, expense_category_uuid: created.id } : line)));
              setCreatedCategoryOptions((prev) => {
                if (prev.some((row) => row.id === created.id)) return prev;
                return [...prev, { id: created.id, label: created.label }];
              });
              void coaAccountsQuery.refetch();
            }
            if (quickCreateTarget.kind === "item" && quickCreateTarget.lineId) {
              updateLines(lines.map((line) => (line.id === quickCreateTarget.lineId ? { ...line, service_item_uuid: created.id } : line)));
            }
            if (quickCreateTarget.kind === "part" && quickCreateTarget.lineId && quickCreateTarget.subId) {
              updateLines(
                lines.map((line) =>
                  line.id !== quickCreateTarget.lineId
                    ? line
                    : {
                        ...line,
                        sub_rows: (line.sub_rows ?? []).map((row) =>
                          row.id !== quickCreateTarget.subId ? row : { ...row, part_uuid: created.id, description: created.label }
                        ),
                      }
                )
              );
            }
            setQuickCreateTarget(null);
            void costContextQuery.refetch();
          }}
        />
      ) : null}
      <PartLocationMapDialog
        open={Boolean(locationTarget)}
        selectedCodes={selectedLocationCodes}
        allowedCodes={allowedPositionCodes}
        positionMetaByCode={positionMetaByCode}
        onClose={() => setLocationTarget(null)}
        onApply={(codes) => {
          if (locationTarget) {
            const next = lines.map((line) =>
              line.id !== locationTarget.lineId
                ? line
                : {
                    ...line,
                    sub_rows: (line.sub_rows ?? []).map((row) =>
                      row.id === locationTarget.subId ? { ...row, part_location_codes: codes } : row
                    ),
                  }
            );
            updateLines(next);
          }
          setLocationTarget(null);
        }}
      />
    </div>
  );
}
