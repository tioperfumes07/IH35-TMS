type Props = {
  checks: Array<{
    text: string;
    code: string;
    state: "live" | "pending" | "on_save";
  }>;
};

export function BookLoadValidationSection({ checks }: Props) {
  const liveCount = checks.filter((check) => check.state === "live").length;
  const pendingCount = checks.filter((check) => check.state === "pending").length;
  const onSaveCount = checks.filter((check) => check.state === "on_save").length;
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
                check.state === "live"
                  ? "bg-[#1c9d5b] text-white"
                  : check.state === "pending"
                    ? "bg-slate-200 text-slate-700"
                    : "bg-[#1f2733] text-white"
              }`}
              aria-label={check.state === "live" ? "Live gate" : check.state === "pending" ? "Not automated" : "Runs on save"}
            >
              {check.state === "live" ? "✓" : check.state === "pending" ? "—" : "→"}
            </span>
            <span className="flex-1">{check.text}</span>
            <span className="rounded-sm border border-gray-200 bg-white px-1.5 py-0.5 font-mono text-[9px] text-gray-500">{check.code}</span>
          </div>
        ))}
      </div>
      <div className="rounded-sm border border-gray-200 bg-[#f7f8fa] p-2.5 text-xs text-gray-800">
        <div className="mb-2 text-[9px] font-semibold uppercase tracking-[0.4px] text-gray-500">On save — book + dispatch</div>
        <div className="space-y-1.5">
          {saveActions.map((action) => (
            <div key={action} className="text-[10.5px] text-gray-600">
              <span className="mr-1">→</span>
              {action}
            </div>
          ))}
        </div>
        <div className="mt-2 text-[10px] font-semibold text-[#1f2733]">
          {liveCount} live gates · {pendingCount} not automated · {onSaveCount} run on save
        </div>
      </div>
    </section>
  );
}
