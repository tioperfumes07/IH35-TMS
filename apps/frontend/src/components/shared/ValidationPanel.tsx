// GAP-14: Reusable ValidationPanel — used by pre-dispatch, pre-settlement (GAP-15), pre-accounting (GAP-16).

export type ValidationSeverity = "block" | "warn" | "info";

export type ValidationItem = {
  rule_id: string;
  severity: ValidationSeverity;
  message: string;
  evidence: Record<string, unknown>;
};

export type ValidationResult = {
  blockers: ValidationItem[];
  warnings: ValidationItem[];
  info: ValidationItem[];
  can_dispatch: boolean;
};

type Props = {
  result: ValidationResult;
  loading?: boolean;
  acknowledgedRules?: Set<string>;
  onAck?: (ruleId: string) => void;
};

const SEVERITY_STYLES: Record<ValidationSeverity, { bg: string; border: string; icon: string; iconBg: string; label: string }> = {
  block: {
    bg: "bg-red-50",
    border: "border-red-300",
    icon: "✕",
    iconBg: "bg-red-600",
    label: "Block",
  },
  warn: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    icon: "!",
    iconBg: "bg-amber-500",
    label: "Warning",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-300",
    icon: "i",
    iconBg: "bg-blue-500",
    label: "Info",
  },
};

function ValidationRow({
  item,
  acknowledged,
  onAck,
}: {
  item: ValidationItem;
  acknowledged: boolean;
  onAck?: (ruleId: string) => void;
}) {
  const styles = SEVERITY_STYLES[item.severity];

  return (
    <div
      className={`flex items-start gap-2.5 rounded border px-3 py-2 text-xs ${styles.bg} ${styles.border} ${acknowledged ? "opacity-60" : ""}`}
    >
      <span
        className={`mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white ${styles.iconBg}`}
      >
        {acknowledged ? "✓" : styles.icon}
      </span>
      <span className="flex-1 leading-snug">
        <span className="font-mono text-[9px] text-gray-400 mr-1">[{item.rule_id}]</span>
        {item.message}
      </span>
      {item.severity === "warn" && onAck && !acknowledged && (
        <button
          type="button"
          onClick={() => onAck(item.rule_id)}
          className="ml-1 flex-shrink-0 rounded border border-amber-400 bg-white px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 hover:bg-amber-50"
        >
          Ack
        </button>
      )}
    </div>
  );
}

export function ValidationPanel({ result, loading, acknowledgedRules, onAck }: Props) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
        <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Running pre-dispatch checks…
      </div>
    );
  }

  const allItems = [
    ...result.blockers,
    ...result.warnings,
    ...result.info,
  ];

  if (allItems.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-800">
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-green-600 text-[9px] font-bold text-white">✓</span>
        All pre-dispatch checks pass. Ready to book.
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {result.blockers.map((item) => (
        <ValidationRow
          key={item.rule_id}
          item={item}
          acknowledged={acknowledgedRules?.has(item.rule_id) ?? false}
          onAck={onAck}
        />
      ))}
      {result.warnings.map((item) => (
        <ValidationRow
          key={item.rule_id}
          item={item}
          acknowledged={acknowledgedRules?.has(item.rule_id) ?? false}
          onAck={onAck}
        />
      ))}
      {result.info.map((item) => (
        <ValidationRow
          key={item.rule_id}
          item={item}
          acknowledged={acknowledgedRules?.has(item.rule_id) ?? false}
          onAck={onAck}
        />
      ))}
    </div>
  );
}
