/**
 * ROUND 443.293-A — full settlement document (eight sections) shared by Statement tab and workflow.
 * Same read models as PDF: tour readout + company settlement report + settlement lines.
 */
import type { CompanySettlementReport } from "../../../api/accounting";
import type { TourReadout } from "../../../api/tourReadout";
import { SettlementLoadsSection } from "./SettlementLoadsSection";
import { CompanyWaterfallSection } from "./CompanyWaterfallSection";
import { FuelPurchasesSection } from "./FuelPurchasesSection";
import { EarningsSection } from "./EarningsSection";
import { DeadheadPaySection } from "./DeadheadPaySection";
import { ExtraPaySection } from "./ExtraPaySection";
import { ReimbursementsSection } from "./ReimbursementsSection";
import { DeductionsSection, type DeductionRow } from "./DeductionsSection";
import { SettlementStatementLinkedRecordsPanel } from "./SettlementStatementLinkedRecordsPanel";

type EarningsLine = Parameters<typeof EarningsSection>[0]["lines"][number];
type DeadheadLine = Parameters<typeof DeadheadPaySection>[0]["lines"][number];
type ExtraLine = Parameters<typeof ExtraPaySection>[0]["lines"][number];
type ReimbLine = Parameters<typeof ReimbursementsSection>[0]["lines"][number];

export type SettlementDocumentBodyProps = {
  operatingCompanyId: string;
  settlementId: string;
  settlementDisplayId: string | null;
  readout: TourReadout | undefined;
  companyReport: CompanySettlementReport | undefined;
  earnings: EarningsLine[];
  deadhead: DeadheadLine[];
  extraWithSeq: ExtraLine[];
  reimbursementsWithSeq: ReimbLine[];
  deductionsWithSeq: DeductionRow[];
  isOpen: boolean;
  /** Document tab is read-only; workflow enables hold/edit/add when open. */
  interactiveDeductions?: boolean;
  onHoldDeduction?: (row: DeductionRow) => void;
  onResumeDeduction?: (row: DeductionRow) => void;
  onAddDeduction?: () => void;
  onEditDeduction?: (row: DeductionRow) => void;
  matchedBankTransactionId?: string | null;
  onOpenJournalEntry?: () => void;
  onOpenFuelFills?: () => void;
};

export function SettlementDocumentBody({
  operatingCompanyId,
  settlementId,
  settlementDisplayId,
  readout,
  companyReport,
  earnings,
  deadhead,
  extraWithSeq,
  reimbursementsWithSeq,
  deductionsWithSeq,
  isOpen,
  interactiveDeductions = false,
  onHoldDeduction,
  onResumeDeduction,
  onAddDeduction,
  onEditDeduction,
  matchedBankTransactionId,
  onOpenJournalEntry,
  onOpenFuelFills,
}: SettlementDocumentBodyProps) {
  return (
    <div className="space-y-3" data-testid="settlement-document-eight-sections">
      {readout ? (
        <SettlementLoadsSection legs={readout.legs} operatingCompanyId={operatingCompanyId} />
      ) : null}
      {readout ? <CompanyWaterfallSection readout={readout} report={companyReport} /> : null}
      <FuelPurchasesSection rows={companyReport?.sections.fuel_purchases.rows ?? []} />
      <EarningsSection lines={earnings} isOpen={isOpen} operatingCompanyId={operatingCompanyId} />
      <DeadheadPaySection lines={deadhead} isOpen={isOpen} operatingCompanyId={operatingCompanyId} />
      <ExtraPaySection lines={extraWithSeq} isOpen={isOpen} operatingCompanyId={operatingCompanyId} />
      <ReimbursementsSection
        lines={reimbursementsWithSeq}
        isOpen={isOpen}
        operatingCompanyId={operatingCompanyId}
      />
      <DeductionsSection
        rows={deductionsWithSeq}
        isOpen={isOpen}
        operatingCompanyId={operatingCompanyId}
        onHold={interactiveDeductions && onHoldDeduction ? onHoldDeduction : () => {}}
        onResume={interactiveDeductions ? onResumeDeduction : undefined}
        onAdd={interactiveDeductions ? onAddDeduction : undefined}
        onEdit={interactiveDeductions ? onEditDeduction : undefined}
      />
      <SettlementStatementLinkedRecordsPanel
        settlementId={settlementId}
        companyId={operatingCompanyId}
        settlementDisplayId={settlementDisplayId}
        readout={readout}
        companyReport={companyReport}
        matchedBankTransactionId={matchedBankTransactionId ?? null}
        onOpenJournalEntry={onOpenJournalEntry ?? (() => {})}
        onOpenFuelFills={onOpenFuelFills}
      />
    </div>
  );
}
