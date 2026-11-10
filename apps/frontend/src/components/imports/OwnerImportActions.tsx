import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { importAlwaysTrackLoadHistory, importFaroPurchaseReport } from "../../api/ownerImports";
import { ActionButton } from "../shared/ActionButton";
import { OwnerImportModal } from "./OwnerImportModal";
import { faroPurchasePlan, loadHistoryPlan } from "./ownerImportPlans";

/** Owner role only — the routes are Owner-only too (403 otherwise). */
function useIsOwner(): boolean {
  const { user } = useAuth();
  return user?.role === "Owner";
}

export function ImportLoadHistoryAction() {
  const isOwner = useIsOwner();
  const { selectedCompany } = useCompanyContext();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const code = selectedCompany?.code;
  if (!isOwner || !selectedCompany || (code !== "USMCA" && code !== "TRK" && code !== "TRANSP")) return null;
  return (
    <>
      <ActionButton data-testid="dispatch-import-load-history" onClick={() => setOpen(true)}>
        Import load history
      </ActionButton>
      <OwnerImportModal
        open={open}
        title="Import load history"
        accept=".xlsx"
        pickLabel="Drag & drop the AlwaysTrack LOAD HISTORY export (.xlsx), or click to pick file"
        testId="import-load-history"
        onClose={() => setOpen(false)}
        run={async (file, commit) =>
          loadHistoryPlan(await importAlwaysTrackLoadHistory({ operatingCompanyId: selectedCompany.id, sourceCompanyCode: code, file, commit }))
        }
        onPosted={() => void queryClient.invalidateQueries({ queryKey: ["dispatch"] })}
      />
    </>
  );
}

export function ImportFaroPurchaseReportAction() {
  const isOwner = useIsOwner();
  const { selectedCompanyId } = useCompanyContext();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  if (!isOwner || !selectedCompanyId) return null;
  return (
    <>
      <ActionButton data-testid="factoring-import-faro-purchase-report" onClick={() => setOpen(true)}>
        Import Faro purchase report
      </ActionButton>
      <OwnerImportModal
        open={open}
        title="Import Faro purchase report"
        accept=".csv"
        pickLabel="Drag & drop the Faro PURCHASE REPORT export (.csv), or click to pick file"
        testId="import-faro-purchase-report"
        onClose={() => setOpen(false)}
        run={async (file, commit) => faroPurchasePlan(await importFaroPurchaseReport({ operatingCompanyId: selectedCompanyId, file, commit }))}
        onPosted={() => void queryClient.invalidateQueries({ queryKey: ["factoring"] })}
      />
    </>
  );
}
