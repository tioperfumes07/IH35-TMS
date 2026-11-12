/**
 * ROUND 8.12 — Settlement Document Designs board (docs/design/boards/settlements/SettlementDocumentDesigns.html).
 * Print-specimen review surface: static approved sheets, not a money engine.
 */
import { SettlementsModuleShell } from "./SettlementsModuleShell";
import { BoardSection } from "../../components/v3/BoardSection";

export function SettlementDocumentDesignsPage() {
  return (
    <SettlementsModuleShell showBack backLabel="Settlements" backTo="/driver-finance/settlements">
      <div className="space-y-2" data-testid="settlement-document-designs-page">
        <BoardSection
          title="Settlement document designs"
          subtitle="Approved print specimens — paper stays white/black for printer fidelity"
          testId="settlement-document-designs-board"
        >
          <iframe
            title="Settlement Document Designs"
            src="/design/settlement-document-designs.html"
            className="h-[calc(100vh-220px)] min-h-[640px] w-full border-0 bg-white"
            data-testid="settlement-document-designs-frame"
          />
        </BoardSection>
      </div>
    </SettlementsModuleShell>
  );
}
