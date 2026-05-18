type ValidationIssue = {
  text: string;
  source: string;
  advisory?: boolean;
};

type Props = {
  issues: ValidationIssue[] | string[];
  saveActions?: string[];
  passCount?: number;
};

export function BookLoadValidationSection({ issues, saveActions, passCount }: Props) {
  const normalizedIssues = issues.map((issue) =>
    typeof issue === "string" ? { text: issue, source: "validation" } : issue
  );
  const normalizedActions = saveActions ?? [];
  const normalizedPassCount = passCount ?? normalizedIssues.filter((issue) => !issue.advisory).length;
  return (
    <section className="grid gap-3 md:grid-cols-2">
      <ul className="space-y-1.5">
        {normalizedIssues.map((issue) => (
          <li key={`${issue.source}-${issue.text}`} className="flex items-center gap-2 border-b border-gray-100 pb-1.5 text-xs text-gray-800">
            <span
              className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-semibold ${
                issue.advisory ? "bg-[#FEF3C7] text-[#78350F]" : "bg-[#D1FAE5] text-[#064E3B]"
              }`}
            >
              {issue.advisory ? "!" : "✓"}
            </span>
            <span className="flex-1">{issue.text}</span>
            <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-[9px] text-gray-500">{issue.source}</span>
          </li>
        ))}
      </ul>
      <div className="rounded border border-gray-200 bg-[#F1EFE8] p-2.5 text-xs text-gray-800">
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-600">On save · book + dispatch</div>
        <ul className="space-y-1.5">
          {normalizedActions.map((action) => (
            <li key={action} className="leading-tight">
              <span className="mr-1 text-gray-500">→</span>
              {action}
            </li>
          ))}
        </ul>
        <div className="mt-2 text-[10px] font-semibold text-[#1A1F36]">{normalizedPassCount} of {normalizedIssues.length} checks pass</div>
      </div>
    </section>
  );
}
