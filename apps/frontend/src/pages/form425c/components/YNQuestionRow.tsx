type Props = {
  lineNumber: number;
  question: string;
  value?: string;
  alert?: "none" | "needs_exhibit";
  onChange: (next: string) => void;
  onOpenExhibit?: () => void;
};

export function YNQuestionRow({ lineNumber, question, value, alert = "none", onChange, onOpenExhibit }: Props) {
  return (
    <div className="grid items-center gap-2 rounded border border-gray-200 px-2 py-2 text-xs md:grid-cols-[52px_1fr_220px_120px]">
      <div className="font-semibold text-gray-700">Line {lineNumber}</div>
      <div className="text-gray-800">{question}</div>
      <div className="flex gap-2">
        {["Yes", "No", "N/A"].map((option) => (
          <button
            key={option}
            type="button"
            className={`rounded border px-2 py-1 ${value === option ? "border-green-600 bg-green-50 text-green-700" : "border-gray-300 text-gray-600"}`}
            onClick={() => onChange(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="flex items-center justify-end gap-2">
        {alert === "needs_exhibit" ? <span className="h-2 w-2 rounded-full bg-red-500" /> : <span className="h-2 w-2 rounded-full bg-green-500" />}
        <button type="button" className="text-[11px] text-blue-700 underline" onClick={onOpenExhibit}>
          Exhibit
        </button>
      </div>
    </div>
  );
}
