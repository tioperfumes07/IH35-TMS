type Props = {
  issues: string[];
};

export function BookLoadValidationSection({ issues }: Props) {
  const checks = issues.map((issue, index) => ({
    text: issue,
    code: index < 4 ? "WF-044" : "advisory",
    advisory: index === issues.length - 1,
  }));
  const passCount = checks.filter((check) => !check.advisory).length;
  const saveActions = [
    "Create load with assigned status",
    "Auto-create driver bill with short miles",
    "Queue QBO outbox invoice + bill",
    "Send driver dispatch message",
    "Prepare factoring packet",
  ];

  return (
    <section className="grid gap-3 md:grid-cols-2">
      <div className="space-y-1.5">
        {checks.map((check, index) => (
          <div key={`${check.text}-${index}`} className="flex items-center gap-2 border-b border-gray-100 pb-1.5 text-xs text-gray-800">
            <span
              className={`inline-flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-semibold ${
                check.advisory ? "bg-[#b8791d] text-white" : "bg-[#1c9d5b] text-white"
              }`}
            >
              {check.advisory ? "!" : "✓"}
            </span>
            <span className="flex-1">{check.text}</span>
            <span className="rounded border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[9px] text-gray-500">{check.code}</span>
          </div>
        ))}
      </div>
      <div className="rounded border border-gray-200 bg-[#f7f8fa] p-2.5 text-xs text-gray-800">
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">On save — book + dispatch</div>
        <div className="space-y-1.5">
          {saveActions.map((action) => (
            <div key={action} className="text-[10.5px] text-gray-600">
              <span className="mr-1">→</span>
              {action}
            </div>
          ))}
        </div>
        <div className="mt-2 text-[10px] font-semibold text-[#1f2733]">{passCount} of {checks.length} checks pass</div>
      </div>
    </section>
  );
}
