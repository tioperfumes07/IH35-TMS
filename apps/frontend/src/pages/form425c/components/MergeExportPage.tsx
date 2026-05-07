import { Button } from "../../../components/Button";

type Props = {
  canGenerate: boolean;
  isGenerating: boolean;
  onGenerate: () => void;
  onMarkFiled: () => void;
  markingFiled: boolean;
};

export function MergeExportPage({ canGenerate, isGenerating, onGenerate, onMarkFiled, markingFiled }: Props) {
  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Merge & Export</h3>
      <p className="mb-3 text-xs text-gray-600">
        Generates filing package PDF (Form lines + exhibits + attachment references). Manual court e-filing remains out of scope for this block.
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={onGenerate} loading={isGenerating} disabled={!canGenerate}>
          Save & Generate Filing PDF
        </Button>
        <Button size="sm" variant="secondary" onClick={onMarkFiled} loading={markingFiled} disabled={!canGenerate}>
          Mark Filed
        </Button>
      </div>
    </section>
  );
}
