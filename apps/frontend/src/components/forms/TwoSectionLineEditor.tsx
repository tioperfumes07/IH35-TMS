import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getWoCostContext } from "../../api/maintenance";
import { useCompanyContext } from "../../contexts/CompanyContext";
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

  const costContextQuery = useQuery({
    queryKey: ["maintenance", "wo-cost-context", operatingCompanyId],
    queryFn: () => getWoCostContext(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
    staleTime: 30_000,
  });

  const updateLines = (next: TwoSectionLine[]) => {
    setLines(next);
    onChange(next);
  };

  const sectionA = useMemo(() => lines.filter((line) => line.section === "A"), [lines]) as CategoryLine[];
  const sectionB = useMemo(() => lines.filter((line) => line.section === "B"), [lines]) as ItemLine[];
  const expenseCategoryOptions = useMemo<CostContextOption[]>(
    () =>
      (costContextQuery.data?.expense_categories ?? []).map((entry) => ({
        id: String(entry.id ?? ""),
        label: String(entry.name ?? ""),
      })),
    [costContextQuery.data?.expense_categories]
  );
  const itemOptions = useMemo<CostContextOption[]>(
    () =>
      (costContextQuery.data?.items ?? []).map((entry) => ({
        id: String(entry.id ?? ""),
        label: String(entry.name ?? ""),
      })),
    [costContextQuery.data?.items]
  );
  const partOptions = useMemo<CostContextOption[]>(
    () =>
      (costContextQuery.data?.parts ?? []).map((entry) => ({
        id: String(entry.id ?? ""),
        label: String(entry.part_description ?? entry.name ?? ""),
      })),
    [costContextQuery.data?.parts]
  );
  const defaultIncomeAccountQboId = useMemo(
    () => String((costContextQuery.data?.expense_categories ?? []).find((row) => Boolean(row.qbo_id))?.qbo_id ?? ""),
    [costContextQuery.data?.expense_categories]
  );

  const selectedLocationCodes =
    locationTarget == null
      ? []
      : lines
          .find((line) => line.id === locationTarget.lineId)
          ?.sub_rows?.find((row) => row.id === locationTarget.subId)?.part_location_codes ?? [];

  const onSectionAChange = (nextSectionA: CategoryLine[]) => {
    updateLines([...nextSectionA.map((line) => ({ ...line, section: "A" as const })), ...sectionB.map((line) => ({ ...line, section: "B" as const }))]);
  };

  const onSectionBChange = (nextSectionB: ItemLine[]) => {
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
        onQuickCreateCategory={(lineId) => setQuickCreateTarget({ kind: "category", lineId })}
        onQuickCreateItem={(lineId) => setQuickCreateTarget({ kind: "item", lineId })}
        onQuickCreatePart={(lineId, subId) => setQuickCreateTarget({ kind: "part", lineId, subId })}
        partsLaborMode={partsLaborMode ?? (mode === "wo" || mode === "bill" ? "parts-and-labor" : "parts-only")}
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
