/**
 * ROUND 443.254 N1 — same live pages, mounted under /driver-finance/… with Settlements chrome.
 */
import { DriversPage } from "../Drivers";
import { FeedGatePage } from "../feed-gate/FeedGatePage";
import { CashAdvancesHomePage } from "../cash-advances/CashAdvancesHome";
import { LiabilitiesHomePage } from "../liabilities/LiabilitiesHome";
import { EscrowPage } from "../accounting/EscrowPage";
import { SettlementsModuleShell } from "./SettlementsModuleShell";

export function SettlementsDriversPage() {
  return (
    <SettlementsModuleShell>
      <DriversPage initialSubnav="roster" />
    </SettlementsModuleShell>
  );
}

export function SettlementsProfilesPage() {
  return (
    <SettlementsModuleShell>
      <DriversPage initialSubnav="profiles" />
    </SettlementsModuleShell>
  );
}

export function SettlementsPreSettlementsPage() {
  return (
    <SettlementsModuleShell>
      <DriversPage initialSubnav="pre_settlements" />
    </SettlementsModuleShell>
  );
}

export function SettlementsFeedGatePage() {
  return (
    <SettlementsModuleShell>
      <FeedGatePage />
    </SettlementsModuleShell>
  );
}

export function SettlementsCashAdvancesPage() {
  return (
    <SettlementsModuleShell>
      <CashAdvancesHomePage />
    </SettlementsModuleShell>
  );
}

export function SettlementsLiabilitiesPage() {
  return (
    <SettlementsModuleShell>
      <LiabilitiesHomePage />
    </SettlementsModuleShell>
  );
}

export function SettlementsEscrowPage() {
  return (
    <SettlementsModuleShell>
      <EscrowPage settlementsMount />
    </SettlementsModuleShell>
  );
}

export function SettlementsPayRateTemplatesPage() {
  return (
    <SettlementsModuleShell>
      <DriversPage initialSubnav="pay_rate_templates" />
    </SettlementsModuleShell>
  );
}

export function SettlementsDeductionsPage() {
  return (
    <SettlementsModuleShell>
      <DriversPage initialSubnav="deductions" />
    </SettlementsModuleShell>
  );
}
