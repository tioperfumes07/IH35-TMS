/**
 * ROUND 443.254 N1 — Settlements chrome (tab bar) around every Settlements-mounted page.
 */
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { NavyPageSubNav } from "../../components/layout/NavyPageSubNav";
import { BackButton } from "../../components/shared/BackButton";
import { SETTLEMENTS_SUBNAV } from "./settlementsSubnav";

type Props = {
  children: ReactNode;
  /** Show ← Back to in-module parent (detail / register leaves). */
  showBack?: boolean;
  backLabel?: string;
  /** ROUND 443.254 N2 — same-module parent (never another module). */
  backTo?: string;
};

function activeSubnavId(pathname: string): string | undefined {
  const path = pathname.split("?")[0] || pathname;
  // Longest match first so /settlements/batch wins over /settlements.
  const ranked = [...SETTLEMENTS_SUBNAV].sort(
    (a, b) => (b.match?.length ?? b.to.length) - (a.match?.length ?? a.to.length),
  );
  for (const item of ranked) {
    const prefix = item.match ?? item.to;
    if (path === prefix || path.startsWith(`${prefix}/`)) return item.to;
  }
  return undefined;
}

export function SettlementsModuleShell({
  children,
  showBack = false,
  backLabel = "Settlements",
  backTo = "/driver-finance/settlements",
}: Props) {
  const { pathname } = useLocation();
  const activeId = activeSubnavId(pathname);

  return (
    <div className="space-y-3" data-testid="settlements-module-shell">
      {showBack ? (
        <div className="px-1 pt-1">
          <BackButton label={backLabel} fallbackTo={backTo} />
        </div>
      ) : null}
      <NavyPageSubNav items={[...SETTLEMENTS_SUBNAV]} activeId={activeId} />
      {children}
    </div>
  );
}
