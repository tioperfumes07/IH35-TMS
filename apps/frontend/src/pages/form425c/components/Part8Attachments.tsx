import { useState } from "react";
import { Button } from "../../../components/Button";

type State = {
  attachment_38_bank_statements_uuids: string[];
  attachment_39_recon_reports_uuids: string[];
  attachment_40_financial_reports_uuids: string[];
  attachment_41_budget_uuids: string[];
  attachment_42_job_costing_uuids: string[];
};

type Props = {
  state: State;
  onAttach: (line: number, fileUuid: string) => Promise<void> | void;
};

const ROWS: Array<{ line: number; label: string; key: keyof State }> = [
  { line: 38, label: "Bank statements", key: "attachment_38_bank_statements_uuids" },
  { line: 39, label: "Reconciliation reports", key: "attachment_39_recon_reports_uuids" },
  { line: 40, label: "Financial reports", key: "attachment_40_financial_reports_uuids" },
  { line: 41, label: "Budget attachments", key: "attachment_41_budget_uuids" },
  { line: 42, label: "Job costing attachments", key: "attachment_42_job_costing_uuids" },
];

export function Part8Attachments({ state, onAttach }: Props) {
  const [inputs, setInputs] = useState<Record<number, string>>({});

  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Part 8 — Attachments (Lines 38-42)</h3>
      <div className="space-y-2 text-xs">
        {ROWS.map((row) => {
          const attached = state[row.key] ?? [];
          return (
            <div key={row.line} className="grid items-center gap-2 rounded border border-gray-200 p-2 md:grid-cols-[80px_1fr_120px_280px_80px]">
              <div className="font-semibold text-gray-700">Line {row.line}</div>
              <div className="text-gray-700">{row.label}</div>
              <div className={`rounded px-2 py-1 text-center ${attached.length > 0 ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
                {attached.length > 0 ? `Attached (${attached.length})` : "Missing"}
              </div>
              <input
                className="h-8 rounded border border-gray-300 px-2"
                placeholder="Paste docs.files UUID"
                value={inputs[row.line] ?? ""}
                onChange={(e) => setInputs((prev) => ({ ...prev, [row.line]: e.target.value }))}
              />
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  const value = (inputs[row.line] ?? "").trim();
                  if (!value) return;
                  await onAttach(row.line, value);
                  setInputs((prev) => ({ ...prev, [row.line]: "" }));
                }}
              >
                Link
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}
