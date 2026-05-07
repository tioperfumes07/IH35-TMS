import { YNQuestionRow } from "./YNQuestionRow";

const QUESTIONS = [
  "Bank accounts opened over DIP amounts?",
  "Sale/transfer of significant assets?",
  "Did any event adversely impact cash flow?",
  "Any unusual or significant anticipated expenses?",
  "Borrowed money or made unusual payments?",
  "Any substantial investment in your business?",
  "Did any bills become overdue for reasons outside normal operations?",
  "Allowed pre-petition checks to clear the bank?",
  "Any other unusual event requiring trustee narrative?",
];

type Props = {
  answers: Record<string, string>;
  exhibitCountByLine: Record<number, number>;
  onChange: (next: Record<string, string>) => void;
  onOpenExhibit: (lineNumber: number) => void;
};

export function Part2UnusualEvents({ answers, exhibitCountByLine, onChange, onOpenExhibit }: Props) {
  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Part 2 — Unusual Events Y/N (Lines 10-18)</h3>
      <div className="space-y-2">
        {QUESTIONS.map((question, index) => {
          const line = index + 10;
          const value = answers[String(line)] ?? "";
          const needsExhibit = value === "Yes" && (exhibitCountByLine[line] ?? 0) === 0;
          return (
            <YNQuestionRow
              key={line}
              lineNumber={line}
              question={question}
              value={value}
              alert={needsExhibit ? "needs_exhibit" : "none"}
              onChange={(next) => onChange({ ...answers, [String(line)]: next })}
              onOpenExhibit={() => onOpenExhibit(line)}
            />
          );
        })}
      </div>
    </section>
  );
}
