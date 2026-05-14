import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

export type FlyoutLink = {
  label: string;
  to: string;
  badgeCount?: number;
};

type Props = {
  open: boolean;
  title: string;
  items: FlyoutLink[];
  onOpen: () => void;
  onClose: () => void;
};

export function SidebarFlyoutMenu({ open, title, items, onOpen, onClose }: Props) {
  const [visible, setVisible] = useState(open);
  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => setVisible(true), 200);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => setVisible(false), 300);
    return () => window.clearTimeout(timer);
  }, [open]);

  const safeItems = useMemo(() => items.filter((row) => Boolean(row.to)), [items]);
  if (!visible || safeItems.length === 0) return null;
  return (
    <div
      role="menu"
      tabIndex={-1}
      className="absolute left-full top-0 z-50 ml-1 min-w-[200px] rounded border border-slate-200 bg-white p-2 shadow-xl"
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
      onFocus={onOpen}
      onBlur={onClose}
    >
      <div className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{title}</div>
      <div className="space-y-1">
        {safeItems.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            role="menuitem"
            className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs text-slate-700 hover:bg-slate-100"
          >
            <span>{item.label}</span>
            {item.badgeCount != null && item.badgeCount > 0 ? (
              <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{item.badgeCount}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
