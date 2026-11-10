// TABLE_DATE_OMIT: the owner import PLAN preview — one row per file line with its outcome; nothing is written until Post, the dates live on the records once imported.
import { useEffect, useState } from "react";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { ParityTable } from "../parity/ParityTable";
import { BoardSection } from "../v3/BoardSection";
import { MoneyCell } from "../shared/MoneyCell";
import { useToast } from "../Toast";
import { userFacingApiError } from "../../lib/api-error-message";

export type OwnerImportPlanRow = {
  key: string;
  ref: string;
  outcomeLabel: string;
  refused: boolean;
  reason: string;
  cents: number;
};

export type OwnerImportPlan = {
  commit: boolean;
  summary: string;
  rows: OwnerImportPlanRow[];
};

type Props = {
  open: boolean;
  title: string;
  accept: string;
  pickLabel: string;
  testId: string;
  onClose: () => void;
  /** commit=false answers the plan (nothing written); commit=true posts exactly that file. */
  run: (file: File, commit: boolean) => Promise<OwnerImportPlan>;
  onPosted?: () => void;
};

/** file pick -> preview plan -> Post. Refused / held rows are listed with their reason; the Post button needs a plan first. */
export function OwnerImportModal({ open, title, accept, pickLabel, testId, onClose, run, onPosted }: Props) {
  const { pushToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [plan, setPlan] = useState<OwnerImportPlan | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setFile(null);
    setPlan(null);
    setLoading(false);
  }, [open]);

  const submit = async () => {
    if (!file) {
      pushToast(`Select the ${accept} file first`, "error");
      return;
    }
    setLoading(true);
    try {
      const posting = plan !== null;
      const res = await run(file, posting);
      if (!posting) {
        setPlan(res);
        return;
      }
      pushToast(res.summary, res.rows.some((r) => r.refused) ? "error" : "success");
      onPosted?.();
      onClose();
    } catch (error) {
      pushToast(userFacingApiError(error, `${title} failed`), "error");
    } finally {
      setLoading(false);
    }
  };

  const refused = plan?.rows.filter((r) => r.refused) ?? [];

  return (
    <Modal open={open} onClose={() => (loading ? undefined : onClose())} title={title} confirmDiscardOnClose isDirty={Boolean(file)}>
      <div className="space-y-3 text-xs" data-testid={testId}>
        <label className="block rounded-sm border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center text-gray-600">
          <input
            type="file"
            accept={accept}
            className="hidden"
            data-testid={`${testId}-file`}
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setPlan(null);
            }}
          />
          {pickLabel}
        </label>
        <BoardSection title="Selected file" testId={`${testId}-selected`}>
          <div className="px-2 py-1">
            Selected: <span className="font-semibold">{file?.name ?? "none"}</span>
          </div>
        </BoardSection>
        {plan ? (
          <BoardSection title="Import plan" testId={`${testId}-plan`}>
            <div className="space-y-2 p-3">
              <div className="font-semibold" data-testid={`${testId}-summary`}>
                {plan.summary} — nothing written yet
              </div>
              <ParityTable<OwnerImportPlanRow>
                tableTestId={`${testId}-plan-table`}
                appearance="board"
                hidePager
                density="compact"
                suppressToolbarSearch
                suppressToolbarRange
                rows={plan.rows}
                rowKey={(row) => row.key}
                emptyText="No lines in this file."
                columns={[
                  { key: "ref", label: "Line", sortable: true, sortValue: (row) => row.ref, render: (row) => row.ref },
                  { key: "outcome", label: "Outcome", sortable: true, sortValue: (row) => row.outcomeLabel, render: (row) => row.outcomeLabel },
                  { key: "reason", label: "Reason", render: (row) => row.reason || "—" },
                  {
                    key: "amount",
                    label: "Amount",
                    sortable: true,
                    kind: "money",
                    sortValue: (row) => row.cents,
                    render: (row) => <MoneyCell cents={row.cents} drill={{ none: "import plan preview — amounts as printed in the file" }} />,
                  },
                ]}
              />
              {refused.length > 0 ? (
                <div data-testid={`${testId}-refused`} role="alert" className="space-y-1 rounded-sm border border-red-200 bg-red-50 p-3 text-red-900">
                  <div className="font-semibold">
                    {refused.length} line{refused.length === 1 ? "" : "s"} refused or held — they will not post:
                  </div>
                  <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5">
                    {refused.map((r) => (
                      <li key={r.key}>
                        {r.ref}: {r.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </BoardSection>
        ) : null}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button size="sm" loading={loading} onClick={() => void submit()} data-testid={`${testId}-submit`}>
            {plan ? "Post" : "Preview"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
