/**
 * ROUND 443.254 N1 / 443.326 — Settlements chrome around every Settlements-mounted page.
 * Uses SettlementsSubNavWrapper (breadcrumb + h1 + HoverDropdownNav). Legacy navy tab strip retired.
 */
import type { ReactNode } from "react";
import { BackButton } from "../../components/shared/BackButton";
import { SettlementsSubNavWrapper } from "./SettlementsSubNavWrapper";

type Props = {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  createControl?: ReactNode;
  kpiStrip?: ReactNode;
  crumbs?: Array<{ label: string; href: string }>;
  /** Show ← Back to in-module parent (detail / register leaves). */
  showBack?: boolean;
  backLabel?: string;
  /** ROUND 443.254 N2 — same-module parent (never another module). */
  backTo?: string;
};

export function SettlementsModuleShell({
  children,
  title = "Settlements",
  subtitle,
  actions,
  createControl,
  kpiStrip,
  crumbs,
  showBack = false,
  backLabel = "Settlements",
  backTo = "/driver-finance/settlements",
}: Props) {
  return (
    <div data-testid="settlements-module-shell">
      {showBack ? (
        <div className="px-1 pt-1">
          <BackButton label={backLabel} fallbackTo={backTo} />
        </div>
      ) : null}
      <SettlementsSubNavWrapper
        title={title}
        subtitle={subtitle}
        actions={actions}
        createControl={createControl}
        kpiStrip={kpiStrip}
        crumbs={crumbs}
      >
        {children}
      </SettlementsSubNavWrapper>
    </div>
  );
}
