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
    badge: "#FEE2E2",
    badgeFg: "#991B1B",
  },
  error: {
    Icon: AlertCircle,
    border: "border-orange-300",
    bg: "bg-orange-50",
    iconCls: "text-orange-600",
    badge: "#FFEDD5",
    badgeFg: "#7C2D12",
  },
  warning: {
    Icon: AlertTriangle,
    border: "border-amber-300",
    bg: "bg-amber-50",
    iconCls: "text-amber-600",
    badge: "#FEF3C7",
    badgeFg: "#92400E",
  },
  info: {
    Icon: Info,
    border: "border-[#E5E7EB]",
    bg: "bg-[#F7F8FA]",
    iconCls: "text-[#4B5563]",
    badge: "#DBEAFE",
    badgeFg: "#1E3A8A",
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
      className={`relative flex gap-3 rounded-sm border ${cfg.border} ${cfg.bg} px-3 py-3 transition-opacity ${dismissing ? "opacity-50" : "opacity-100"}`}
      aria-label={`Attention item ${rank}: ${item.title}`}
    >
      {/* Rank badge */}
      <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-xs font-bold text-[#6B7280] ring-1 ring-[#E5E7EB]">
        {rank}
      </div>

      {/* Severity icon */}
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${cfg.iconCls}`} aria-hidden />

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-[#0F1219]">{item.title}</span>
          <span
            className="rounded-full px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide"
            style={{ backgroundColor: cfg.badge, color: cfg.badgeFg }}
          >
            {item.severity}
          </span>
          <span className="ml-auto text-xs font-medium text-[#6B7280]">Score {item.score}</span>
        </div>

        {item.body ? (
          <p className="mt-0.5 text-xs text-[#4B5563]">{item.body}</p>
        ) : null}

        <div className="mt-2 flex items-center gap-2">
          <button
            type="button"
            className="rounded-sm bg-[#0F1219] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#1F2A44] focus:outline-hidden focus:ring-2 focus:ring-[#6B7280]"
            onClick={() => onAction(item.action_url)}
          >
            {item.action_label}
          </button>
          <button
            type="button"
            className="flex items-center gap-1 text-xs text-[#6B7280] hover:text-[#4B5563] focus:outline-hidden"
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
