import { useEffect, useState, type ReactNode } from "react";

function storageKey(scope: string, cardId: string) {
  return `ih35.card-collapse.${scope}.${cardId}`;
}

/**
 * DRV-F422 — every card header has a chevron, open by default, remembered per viewer
 * per tab. A collapsed card still shows its count. Collapsing hides rows, never the fact
 * that rows exist.
 */
export function CollapsibleProfileCard({
  scope,
  cardId,
  title,
  subtitle,
  count,
  action,
  defaultOpen = true,
  children,
}: {
  scope: string;
  cardId: string;
  title: string;
  subtitle?: string;
  count?: number | string | null;
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey(scope, cardId));
      if (raw === "0") setOpen(false);
      if (raw === "1") setOpen(true);
    } catch {
      /* private mode */
    }
  }, [scope, cardId]);

  const toggle = () => {
    setOpen((current) => {
      const next = !current;
      try {
        localStorage.setItem(storageKey(scope, cardId), next ? "1" : "0");
      } catch {
        /* private mode */
      }
      return next;
    });
  };

  return (
    <div className="pb-card" data-testid={`collapsible-card-${cardId}`} data-card-open={open ? "1" : "0"}>
      <div className={`dd-card-head${open ? "" : " dd-card-head--closed"}`}>
        <div>
          <div className="dd-card-title">{title}</div>
          {subtitle ? <div className="dd-card-sub">{subtitle}</div> : null}
        </div>
        <div className="flex items-center gap-2">
          {count != null ? (
            <span className="rounded-full bg-[#F7F8FA] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#1F2A44]" data-testid={`collapsible-card-count-${cardId}`}>
              {count}
            </span>
          ) : null}
          {action}
          <button
            type="button"
            className="h-6 w-6 rounded-sm text-[11px] text-[#6B7280] hover:bg-[#F7F8FA] hover:text-[#0F1219]"
            aria-expanded={open}
            aria-label={open ? `Collapse ${title}` : `Expand ${title}`}
            onClick={toggle}
            data-testid={`collapsible-card-chevron-${cardId}`}
          >
            {open ? "▾" : "▸"}
          </button>
        </div>
      </div>
      {open ? children : null}
    </div>
  );
}
