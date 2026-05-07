import { YNQuestionRow } from "./YNQuestionRow";

const QUESTIONS = [
  "Did the business operate during the period?",
  "Do you intend to continue to operate the business?",
  "Have you paid all of your bills on time?",
  "Did you pay your employees on time?",
  "Have you deposited all receipts into DIP accounts?",
  "Have you timely filed tax returns and paid taxes?",
  "Have all legally required government filings been made?",
  "Have you made all required payments to the UST?",
  "Have you timely paid insurance expenses?",
];

type Props = {
  answers: Record<string, string>;
  exhibitCountByLine: Record<number, number>;
  onChange: (next: Record<string, string>) => void;
  onOpenExhibit: (lineNumber: number) => void;
};

export function Part1ComplianceQuestions({ answers, exhibitCountByLine, onChange, onOpenExhibit }: Props) {
  return (
    <section className="rounded border border-gray-200 bg-white p-3">
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Part 1 — Compliance Y/N (Lines 1-9)</h3>
      <div className="space-y-2">
        {QUESTIONS.map((question, index) => {
          const line = index + 1;
          const value = answers[String(line)] ?? "";
          const needsExhibit = value === "No" && (exhibitCountByLine[line] ?? 0) === 0;
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
