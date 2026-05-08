import { useMemo, useState } from "react";
import {
  CostBreakdownBox,
  type CategoryLine,
  type ItemLine,
  type ItemSubRow,
} from "./shared/CostBreakdownBox";
import { PartLocationMapDialog } from "./PartLocationMapDialog";

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
  const [lines, setLines] = useState<TwoSectionLine[]>(initialLines);
  const [locationTarget, setLocationTarget] = useState<{ lineId: string; subId: string } | null>(null);

  const updateLines = (next: TwoSectionLine[]) => {
    setLines(next);
    onChange(next);
  };

  const sectionA = useMemo(() => lines.filter((line) => line.section === "A"), [lines]) as CategoryLine[];
  const sectionB = useMemo(() => lines.filter((line) => line.section === "B"), [lines]) as ItemLine[];

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
        partsLaborMode={partsLaborMode ?? (mode === "wo" || mode === "bill" ? "parts-and-labor" : "parts-only")}
        onSectionAChange={onSectionAChange}
        onSectionBChange={onSectionBChange}
        onOpenLocationMap={(lineId, subId) => setLocationTarget({ lineId, subId })}
        readOnly={readOnly}
      />
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
