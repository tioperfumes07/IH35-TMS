/**
 * ROUND 443.254 N1 — same live pages, mounted under /driver-finance/… with Settlements chrome.
 * ROUND 443.280-A — Pre-Settlements + Deductions mount board bodies only (no DriversPage layer).
 * ROUND 443.282 — Escrow mounts SettlementsEscrowBoard (not Accounting EscrowPage under this shell).
 * ROUND 443.326 — SettlementsModuleShell = SettlementsSubNavWrapper; createControl on board leaves.
 */
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { DriversPage } from "../Drivers";
import { FeedGateIntakePage, FeedGatePage } from "../feed-gate/FeedGatePage";
import { SettlementsCashAdvancesBoard } from "./SettlementsCashAdvancesBoard";
import { LiabilitiesHomePage } from "../liabilities/LiabilitiesHome";
import { SettlementsModuleShell } from "./SettlementsModuleShell";
import { SettlementsPreSettlementsBoard } from "./SettlementsPreSettlementsBoard";
import { SettlementsDeductionsBoard } from "./SettlementsDeductionsBoard";
import { SettlementsEscrowBoard } from "./SettlementsEscrowBoard";

const CREATOR_LABEL = "+ Settlement Creator";

function SettlementCreatorButton({ testId }: { testId: string }) {
  const navigate = useNavigate();
  return (
    <Button
      size="sm"
      data-testid={testId}
      onClick={() => navigate("/driver-finance/settlements?creator=1")}
    >
      {CREATOR_LABEL}
    </Button>
  );
}

export function SettlementsDriversPage() {
  return (
    <SettlementsModuleShell title={"Drivers"} subtitle={"Roster under Settlements"}>
      <DriversPage initialSubnav="roster" />
    </SettlementsModuleShell>
  );
}

export function SettlementsProfilesPage() {
  return (
    <SettlementsModuleShell title={"Profiles"} subtitle={"Driver profiles under Settlements"}>
      <DriversPage initialSubnav="profiles" />
    </SettlementsModuleShell>
  );
}

export function SettlementsPreSettlementsPage() {
  return (
    <SettlementsModuleShell
      title={"Pre-Settlements"}
      subtitle={"Open tours ready to close"}
      createControl={<SettlementCreatorButton testId="settlements-presettle-creator" />}
    >
      <SettlementsPreSettlementsBoard />
    </SettlementsModuleShell>
  );
}

export function SettlementsFeedGatePage() {
  return (
    <SettlementsModuleShell title={"Feed gate"} subtitle={"Purchase-day feed control"}>
      <FeedGatePage />
    </SettlementsModuleShell>
  );
}

export function SettlementsFeedGateIntakePage() {
  return (
    <SettlementsModuleShell title={"Feed gate"} subtitle={"Intake checklist"}>
      <FeedGateIntakePage />
    </SettlementsModuleShell>
  );
}

export function SettlementsCashAdvancesPage() {
  return (
    <SettlementsModuleShell
      title={"Cash Advances"}
      subtitle={"Requests and advances on open tours"}
      createControl={<SettlementCreatorButton testId="settlements-cash-advances-creator" />}
    >
      <SettlementsCashAdvancesBoard />
    </SettlementsModuleShell>
  );
}

export function SettlementsLiabilitiesPage() {
  return (
    <SettlementsModuleShell title={"Liabilities"} subtitle={"Driver liabilities under Settlements"}>
      <LiabilitiesHomePage />
    </SettlementsModuleShell>
  );
}

export function SettlementsEscrowPage() {
  return (
    <SettlementsModuleShell
      title={"Escrow"}
      subtitle={"Held balances by driver"}
      createControl={<SettlementCreatorButton testId="settlements-escrow-creator" />}
    >
      <SettlementsEscrowBoard />
    </SettlementsModuleShell>
  );
}

export function SettlementsPayRateTemplatesPage() {
  return (
    <SettlementsModuleShell title={"Pay rate templates"} subtitle={"Templates under Settlements"}>
      <DriversPage initialSubnav="pay_rate_templates" />
    </SettlementsModuleShell>
  );
}

export function SettlementsDeductionsPage() {
  return (
    <SettlementsModuleShell
      title={"Deductions"}
      subtitle={"Escrow, advances, fines, damages"}
      createControl={<SettlementCreatorButton testId="settlements-deductions-creator" />}
    >
      <SettlementsDeductionsBoard />
    </SettlementsModuleShell>
  );
}
