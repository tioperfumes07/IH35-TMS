import { useRef, useState } from "react";
import { colors } from "../../design/tokens";
import type { SamsaraVisualStatus } from "../../lib/integration-telematics-status";
import { StatusBarPopover } from "./StatusBarPopover";
import type { QboSyncPill } from "./TopStatusBar";

type Props = {
  qboVis: { label: string; dot: "gray" | "green" };
  samsaraVis: SamsaraVisualStatus;
  relayVis: SamsaraVisualStatus;
  qboSyncPill: QboSyncPill | null;
  onOpenQboSyncDashboard: () => void;
  onReconnectQbo: () => void;
};

function dotClass(dot: "gray" | "green" | "yellow" | "red"): string {
  if (dot === "green") return "bg-emerald-500";
  if (dot === "yellow") return "bg-amber-400";
  if (dot === "red") return "bg-red-500";
  return "bg-slate-500";
}

type IntegrationKey = "qbo" | "samsara" | "relay" | "sync";

export function StatusBarMobile({
  qboVis,
  samsaraVis,
  relayVis,
  qboSyncPill,
  onOpenQboSyncDashboard,
  onReconnectQbo,
}: Props) {
  const [openKey, setOpenKey] = useState<IntegrationKey | null>(null);
  const anchorRefs = {
    qbo: useRef<HTMLButtonElement>(null),
    samsara: useRef<HTMLButtonElement>(null),
    relay: useRef<HTMLButtonElement>(null),
    sync: useRef<HTMLButtonElement>(null),
  };

  const items: Array<{
    key: IntegrationKey;
    label: string;
    dot: "gray" | "green" | "yellow" | "red";
    detail: string;
    action?: { label: string; onClick: () => void };
  }> = [
    { key: "qbo", label: "QuickBooks", dot: qboVis.dot, detail: qboVis.label },
    {
      key: "samsara",
      label: "Samsara",
      dot: samsaraVis.dot,
      detail: samsaraVis.title ? `${samsaraVis.label} — ${samsaraVis.title}` : samsaraVis.label,
    },
    { key: "relay", label: "Relay", dot: relayVis.dot, detail: relayVis.label },
  ];

  if (qboSyncPill) {
    items.push({
      key: "sync",
      label: "QBO Sync",
      dot: qboSyncPill.dot,
      detail: qboSyncPill.label,
      action: qboSyncPill.needsReconnect
        ? { label: "Reconnect QuickBooks", onClick: onReconnectQbo }
        : { label: "View sync log →", onClick: onOpenQboSyncDashboard },
    });
  }

  const active = openKey ? items.find((item) => item.key === openKey) : null;

  return (
    <div
      className="relative flex h-10 max-h-14 items-center justify-center gap-3 rounded-full px-3"
      style={{ backgroundColor: "#151A24" }}
      data-status-bar-mobile
    >
      {items.map((item) => (
        <button
          key={item.key}
          ref={anchorRefs[item.key]}
          type="button"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10"
          aria-label={item.label}
          title={item.detail}
          onClick={() => setOpenKey((current) => (current === item.key ? null : item.key))}
        >
          <span className={`inline-block h-2.5 w-2.5 rounded-full ${dotClass(item.dot)}`} />
        </button>
      ))}
      {active ? (
        <StatusBarPopover
          open
          anchorRef={anchorRefs[active.key]}
          onClose={() => setOpenKey(null)}
          title={active.label}
        >
          <p style={{ color: colors.sidebarTextActive }}>{active.detail}</p>
          {active.action ? (
            <button
              type="button"
              className="mt-2 rounded border border-slate-500 px-2 py-1 text-[11px] font-semibold hover:bg-white/10"
              onClick={() => {
                active.action?.onClick();
                setOpenKey(null);
              }}
            >
              {active.action.label}
            </button>
          ) : null}
        </StatusBarPopover>
      ) : null}
    </div>
  );
}
