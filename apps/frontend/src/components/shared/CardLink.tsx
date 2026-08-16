import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from "react";
import { Link } from "react-router-dom";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  children: ReactNode;
  onNavigate?: () => void;
};

export function CardLink({ href, children, onNavigate, onClick, className, ...rest }: Props) {
  return (
    <Link
      to={href}
      className={className}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        // LV-MASTER-DETAIL-ROW-CLICK-NAVIGATES-AWAY: a plain left-click here always fell through to
        // react-router's own <Link> navigation regardless of onNavigate — the doc comment on every
        // caller ("also selects the master-detail row") promised a stay-on-page select, but the row
        // always navigated to the full detail page anyway, discarding the split view. A real anchor
        // is kept (right-click "open in new tab", hover preview, keyboard Enter all still work) —
        // only a genuinely plain left-click (no modifier, primary button) is intercepted to select
        // in place instead of navigating; cmd/ctrl/shift-click and middle-click still open normally.
        const isPlainLeftClick =
          event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;
        if (isPlainLeftClick && onNavigate) {
          event.preventDefault();
          onNavigate();
        }
      }}
      {...rest}
    >
      {children}
    </Link>
  );
}
