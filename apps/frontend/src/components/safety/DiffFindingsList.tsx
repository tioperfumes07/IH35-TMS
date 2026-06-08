type Finding = {
  location: string;
  severity: string;
  description: string;
  confidence: number;
};

type Props = {
  findings: Finding[];
  onAccept?: (index: number) => void;
  onReject?: (index: number) => void;
  readOnly?: boolean;
};

export function DiffFindingsList({ findings, onAccept, onReject, readOnly = false }: Props) {
  if (findings.length === 0) {
    return <p className="text-xs text-slate-500" data-testid="diff-findings-empty">No damage findings.</p>;
  }

  return (
    <ul className="space-y-2" data-testid="diff-findings-list">
      {findings.map((finding, index) => (
        <li key={`${finding.location}-${index}`} className="rounded border border-slate-200 bg-white p-3 text-xs">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-semibold text-slate-900">{finding.location}</p>
              <p className="text-slate-600">{finding.description}</p>
              <p className="mt-1 text-slate-500">
                Severity: {finding.severity} · Confidence: {(finding.confidence * 100).toFixed(0)}%
              </p>
            </div>
            {!readOnly ? (
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  className="rounded border border-emerald-300 px-2 py-1 text-emerald-800 hover:bg-emerald-50"
                  onClick={() => onAccept?.(index)}
                >
                  Accept
                </button>
                <button
                  type="button"
                  className="rounded border border-rose-300 px-2 py-1 text-rose-800 hover:bg-rose-50"
                  onClick={() => onReject?.(index)}
                >
                  Reject
                </button>
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
