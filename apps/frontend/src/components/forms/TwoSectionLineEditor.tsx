import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useRef, useState } from "react";
import { expenseCategoriesCatalogClient } from "../../api/catalogs-accounting";
// ACCT-F92: one shared definition of which accounts belong in which picker.
import { entityLabel } from "../../lib/entity-label";
import { tirePositionsCatalogClient } from "../../api/catalogs-fleet";
import { getCoaAccounts } from "../../api/banking";
import { getWoCostContext, type WoCostSourceStatus } from "../../api/maintenance";
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
import { CappedListNotice } from "../CappedListNotice";
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
  /**
   * 443.159 (owner 2026-10-16: "all accounts must appear when creating a bill … same picker as Banking"):
   * the catalogs.accounts id chosen in Section A. Section A's picker is the Chart of Accounts — the SAME
   * source Banking categorize uses (getCoaAccounts) — so the chosen id is a GL account and travels as
   * bill_lines.account_id (the poster's explicit-override tier), never as expense_category_uuid.
   */
  account_id?: string;
  expense_category_code?: string;
  /** ECON-012 — map keys from catalogs.expense_categories.metadata */
  expense_category_kind?: string;
  expense_category_map_code?: string;
  service_item_uuid?: string;
  /** ACCT-F4431382 — WO mode, Section A: the catalogs.items row this category line bills. */
  item_id?: string;
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
  // WAVE-H1: Bill Section A reads catalogs.expense_categories (entity-scoped Lists catalog).
  // CoA-as-category stamped account ids into expense_category_uuid and broke the same-entity FK.
  // Expense/WO modes keep full CoA until their consumers are rewired the same way.
  const expenseCategoriesQuery = useQuery({
    queryKey: ["catalogs", "expense-categories", "line-category", operatingCompanyId],
    queryFn: () =>
      expenseCategoriesCatalogClient.list({
        operating_company_id: operatingCompanyId,
        is_active: "true",
        limit: 200,
      }),
    // 443.159: Section A no longer reads this catalog in any mode (Chart of Accounts instead); kept only so
    // legacy bill lines that already carry a category id still resolve on read paths that import it.
    enabled: false,
    staleTime: 30_000,
  });
  const coaAccountsQuery = useQuery({
    queryKey: ["catalogs", "coa-accounts", "line-category", operatingCompanyId],
    queryFn: () => getCoaAccounts(operatingCompanyId),
    // 443.159: every mode (bill included) picks Section A from the ONE chart-of-accounts source Banking uses.
    enabled: Boolean(operatingCompanyId),
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

  // ACCT-F4431382: the latest lines, updated synchronously, so a Section A item picked for the operator (the one
  // item that posts to the category's account) composes with any other line update in the same commit.
  const linesRef = useRef<TwoSectionLine[]>(initialLines);
  // 443.159: the Section A picker writes the chosen id into expense_category_uuid (CostBreakdownBox binding).
  // Section A's options are now ONLY Chart of Accounts rows (incl. accounts created inline), so every id picked
  // in this editor is a GL account → stamp it as account_id and payload builders send bill_lines.account_id.
  // The one exception is a legacy line loaded from an existing document that still carries a
  // catalogs.expense_categories id: that id is never in the chart and stays a category, untouched.
  const legacyCategoryIdsRef = useRef<Set<string>>(
    new Set(
      initialLines
        .filter((line) => line.section === "A" && !line.account_id && line.expense_category_uuid)
        .map((line) => String(line.expense_category_uuid))
    )
  );
  const updateLines = (raw: TwoSectionLine[]) => {
    const next = raw.map((line) => {
      if (line.section !== "A") return line;
      const picked = String(line.expense_category_uuid ?? "").trim();
      if (!picked) return line.account_id ? { ...line, account_id: undefined } : line;
      if (legacyCategoryIdsRef.current.has(picked)) return line.account_id ? { ...line, account_id: undefined } : line;
      return line.account_id === picked ? line : { ...line, account_id: picked };
    });
    linesRef.current = next;
    setLines(next);
    onChange(next);
  };
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onSectionAItemChange = useCallback((lineId: string, itemId: string | null) => {
    const next = linesRef.current.map((line) => (line.id === lineId ? { ...line, item_id: itemId ?? undefined } : line));
    linesRef.current = next;
    setLines(next);
    onChangeRef.current(next);
  }, []);

  const sectionA = useMemo(() => lines.filter((line) => line.section === "A"), [lines]) as CategoryLine[];
  const sectionB = useMemo(() => lines.filter((line) => line.section === "B"), [lines]) as ItemLine[];
  const expenseCategoryOptions = useMemo<CostContextOption[]>(() => {
    // 443.159 (owner 2026-10-16, his instruction is law): Section A lists the FULL active Chart of Accounts —
    // exactly the list Banking categorize shows (getCoaAccounts) — in bill, expense and work-order mode.
    // The earlier expense-only filter (ACCT-F92, below) is superseded by the owner's ruling.
    // Expense/WO cost line: expense-side accounts ONLY.
    // ACCT-F92 (live 2026-08-02): this mapped the FULL chart with no type filter, so the Work Order
    // "Parts & Labor > Type" picker offered Detention / Layover / Lumper / TONU Income (4210-4240
    // REVENUE), Driver Cash Advance (asset) and the Inter-company lease accounts as cost categories.
    // A repair parts line could be booked to revenue or to an inter-company account — the entry would
    // still balance, so nothing downstream would catch it. Every mode this editor serves (bill,
    // expense, work order) is a COST line, so Income/asset/liability are never valid here.
    const fromCoa = (coaAccountsQuery.data?.accounts ?? []).map((account) => ({
      id: String(account.id ?? ""),
      // CLS-UUID-LABEL: this chart path replaced the bill-mode category branch (443.159); a blank or
      // uuid-shaped account_name reads as "Account — not visible", never an empty row or a raw id.
      label: entityLabel(account.account_name, account.id, "Account"),
    }));
    const merged = new Map<string, CostContextOption>();
    for (const row of fromCoa) {
      if (row.id) merged.set(row.id, row);
    }
    for (const row of createdCategoryOptions) {
      if (row.id) merged.set(row.id, row);
    }
    if (merged.size > 0) return Array.from(merged.values());
    const fromAccounting = (accountingCategoriesQuery.data ?? []).map((entry) => ({
      id: String(entry.id ?? ""),
      label: `${entry.name ?? ""}`.trim() || entityLabel(entry.account_number, entry.id ?? entry.qbo_id, "Account"),
    }));
    if (fromAccounting.length > 0) return fromAccounting;
    return (costContextQuery.data?.expense_categories ?? []).map((entry) => ({
      id: String(entry.id ?? ""),
      label: String(entry.name ?? ""),
    }));
  }, [
    mode,
    expenseCategoriesQuery.data,
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
  const partsCatalogStatus: WoCostSourceStatus | undefined =
    costContextQuery.data?.sources?.inventory_parts?.status;
  const laborRatesCatalogStatus: WoCostSourceStatus | undefined =
    costContextQuery.data?.sources?.labor_rates?.status;

  const partOptions = useMemo<CostContextOption[]>(
    () =>
      partsCatalogStatus === "unavailable"
        ? []
        : (costContextQuery.data?.parts ?? []).map((entry) => ({
            id: String(entry.id ?? ""),
            label: String(entry.part_description ?? entry.name ?? ""),
          })),
    [costContextQuery.data?.parts, partsCatalogStatus]
  );
  const laborRateOptions = useMemo<CostContextOption[]>(
    () =>
      laborRatesCatalogStatus === "unavailable"
        ? []
        : (costContextQuery.data?.labor_rates ?? []).map((entry) => ({
            id: String(entry.id ?? ""),
            label: String(entry.rate_name ?? entry.rate_code ?? entry.name ?? ""),
          })),
    [costContextQuery.data?.labor_rates, laborRatesCatalogStatus]
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

  const tirePositionRows = tirePositionsQuery.data?.rows ?? [];

  return (
    <div className="space-y-4">
      <CostBreakdownBox
        sectionA={{ lines: sectionA }}
        sectionB={{ lines: sectionB }}
        expenseCategoryOptions={expenseCategoryOptions}
        itemOptions={itemOptions}
        partOptions={partOptions}
        laborRateOptions={laborRateOptions}
        partsCatalogStatus={partsCatalogStatus}
        laborRatesCatalogStatus={laborRatesCatalogStatus}
        locationOptions={locationOptions}
        operatingCompanyId={operatingCompanyId || undefined}
        categoryCreateKind="category"
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
        onSectionAItemChange={mode === "wo" ? onSectionAItemChange : undefined}
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
      <CappedListNotice
        shown={tirePositionRows.length}
        limit={500}
        total={tirePositionsQuery.data?.total ?? null}
        hint="Type to search for a tire position not listed."
        className="text-xs text-[#4B5563]"
      />
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
