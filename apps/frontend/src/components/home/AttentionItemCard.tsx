/**
 * GAP-65 — AttentionItemCard
 *
 * A single ranked attention item card. Shows severity badge, score, title,
 * body text, action button, and a dismiss control.
 */

import { AlertCircle, AlertTriangle, Info, ShieldAlert, X } from "lucide-react";

export type AttentionItemSeverity = "info" | "warning" | "error" | "critical";

export interface AttentionItemData {
  id: string;
  item_id: string;
  source: string;
  score: number;
  title: string;
  body: string;
  action_url: string;
  action_label: string;
  severity: AttentionItemSeverity;
  extra: Record<string, unknown>;
  dismissed: boolean;
  computed_at: string | null;
}

const SEVERITY_CONFIG: Record<
  AttentionItemSeverity,
  { Icon: typeof Info; border: string; bg: string; iconCls: string; badge: string; badgeFg: string }
> = {
  critical: {
    Icon: ShieldAlert,
    border: "border-red-300",
    bg: "bg-red-50",
    iconCls: "text-red-600",
    badge: "#fee2e2",
    badgeFg: "#991b1b",
  },
  error: {
    Icon: AlertCircle,
    border: "border-orange-300",
    bg: "bg-orange-50",
    iconCls: "text-orange-600",
    badge: "#ffedd5",
    badgeFg: "#7c2d12",
  },
  warning: {
    Icon: AlertTriangle,
    border: "border-amber-300",
    bg: "bg-amber-50",
    iconCls: "text-amber-600",
    badge: "#fef3c7",
    badgeFg: "#92400e",
  },
  info: {
    Icon: Info,
    border: "border-blue-200",
    bg: "bg-blue-50",
    iconCls: "text-blue-500",
    badge: "#dbeafe",
    badgeFg: "#1e3a8a",
  },
};

type Props = {
  item: AttentionItemData;
  rank: number;
  onAction: (url: string) => void;
  onDismiss: (itemId: string) => void;
  dismissing?: boolean;
};

export function AttentionItemCard({ item, rank, onAction, onDismiss, dismissing = false }: Props) {
  const cfg = SEVERITY_CONFIG[item.severity] ?? SEVERITY_CONFIG.info;
  const { Icon } = cfg;

  return (
    <div
      className={`relative flex gap-3 rounded border ${cfg.border} ${cfg.bg} px-3 py-3 transition-opacity ${dismissing ? "opacity-50" : "opacity-100"}`}
      aria-label={`Attention item ${rank}: ${item.title}`}
    >
      {/* Rank badge */}
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-500 ring-1 ring-slate-200">
        {rank}
      </div>

      {/* Severity icon */}
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.iconCls}`} aria-hidden />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-slate-900">{item.title}</span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
            style={{ backgroundColor: cfg.badge, color: cfg.badgeFg }}
          >
            {item.severity}
          </span>
          <span className="ml-auto text-[10px] font-medium text-slate-400">Score {item.score}</span>
        </div>

        {item.body ? (
          <p className="mt-0.5 text-xs text-slate-600">{item.body}</p>
        ) : null}

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="rounded bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500"
            onClick={() => onAction(item.action_url)}
          >
            {item.action_label}
          </button>
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 focus:outline-none"
            onClick={() => onDismiss(item.item_id)}
            disabled={dismissing}
            aria-label={`Dismiss: ${item.title}`}
          >
            <X className="h-3 w-3" />
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
