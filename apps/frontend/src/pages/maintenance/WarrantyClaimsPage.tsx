import { useEffect, useMemo, useRef, useState } from "react";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMaintenanceWarrantyClaim,
  detectMaintenanceWarrantyFromWorkOrder,
  fileMaintenanceWarrantyClaim,
  listMaintenanceWarrantyClaims,
  type MaintenanceWarrantyClaimRow,
} from "../../api/maintenance";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ListErrorState } from "../../components/ListErrorState";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { useSearchParams } from "react-router-dom";

type ClaimDraft = {
  part_description: string;
  claim_amount_cents: string;
  vendor_id: string;
  work_order_id: string;
  claim_number: string;
};

const EMPTY_CLAIM: ClaimDraft = {
  part_description: "",
  claim_amount_cents: "",
  vendor_id: "",
  work_order_id: "",
  claim_number: "",
};

export function WarrantyClaimsPage() {
  const [searchParams] = useSearchParams();
  const highlightedClaimId = searchParams.get("claim_id")?.trim() || "";
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [fileTarget, setFileTarget] = useState<MaintenanceWarrantyClaimRow | null>(null);
  const [detectWoId, setDetectWoId] = useState("");
  const [claimDraft, setClaimDraft] = useState<ClaimDraft>(EMPTY_CLAIM);
  const [fileClaimNumber, setFileClaimNumber] = useState("");
  const actionGenerationRef = useRef(0);

  const claimsQ = useQuery({
    queryKey: ["maintenance", "warranty-claims", companyId],
    queryFn: () => listMaintenanceWarrantyClaims(companyId),
    enabled: Boolean(companyId),
  });

  // LST-PICKER-01/1858: maintenance.warranty_claims.vendor_id REFERENCES mdata.vendors(id).
  // EntityPicker kind=vendor allowCreate reads/writes that same table (no catalogs.maintenance_vendors,
  // no capped listVendors page).

  const refresh = async (submittedCompanyId: string) => {
    await queryClient.invalidateQueries({ queryKey: ["maintenance", "warranty-claims", submittedCompanyId] });
  };

  const createMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; draft: ClaimDraft }) =>
      createMaintenanceWarrantyClaim({
        operating_company_id: input.companyId,
        part_description: input.draft.part_description,
        claim_amount_cents: Number(input.draft.claim_amount_cents || "0"),
        vendor_id: input.draft.vendor_id || undefined,
        work_order_id: input.draft.work_order_id || undefined,
        claim_number: input.draft.claim_number,
      }),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setCreateOpen(false);
      setClaimDraft(EMPTY_CLAIM);
      await refresh(input.companyId);
      pushToast("Warranty claim created", "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to create claim", "error");
    },
  });

  const fileMutation = useMutation({
    mutationFn: (input: { id: string; companyId: string; generation: number; claimNumber: string }) =>
      fileMaintenanceWarrantyClaim(input.id, {
        operating_company_id: input.companyId,
        claim_number: input.claimNumber || undefined,
      }),
    onSuccess: async (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setFileTarget(null);
      setFileClaimNumber("");
      await refresh(input.companyId);
      pushToast("Claim filed with vendor", "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to file claim", "error");
    },
  });

  const detectMutation = useMutation({
    mutationFn: (input: { companyId: string; generation: number; workOrderId: string }) =>
      detectMaintenanceWarrantyFromWorkOrder({
        operating_company_id: input.companyId,
        work_order_id: input.workOrderId,
        create_draft_claims: true,
      }),
    onSuccess: async (result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      await refresh(input.companyId);
      const count = result.created_claims?.length ?? result.eligible?.length ?? 0;
      pushToast(count ? `Detected ${count} warranty-eligible part(s)` : "No eligible warranty parts found", "success");
    },
    onError: (_error, input) => {
      if (input.generation === actionGenerationRef.current) pushToast("Failed to detect warranty parts from WO", "error");
    },
  });

  useEffect(() => {
    actionGenerationRef.current += 1;
    createMutation.reset();
    fileMutation.reset();
    detectMutation.reset();
    setCreateOpen(false);
    setFileTarget(null);
    setDetectWoId("");
    setClaimDraft(EMPTY_CLAIM);
    setFileClaimNumber("");
  }, [companyId]);

  useEffect(() => {
    if (!claimsQ.isError) return;
    setCreateOpen(false);
    setFileTarget(null);
    setDetectWoId("");
    setClaimDraft(EMPTY_CLAIM);
    setFileClaimNumber("");
  }, [claimsQ.isError]);

  const claims = claimsQ.isError ? [] : (claimsQ.data?.rows ?? []);

  const columns = useMemo<ParityColumn<MaintenanceWarrantyClaimRow>[]>(
    () => [
      { key: "part_description", label: "Part", sortable: true, render: (row) => row.part_description },
      { key: "vendor_name", label: "Vendor", sortable: true, render: (row) => <EntityLinkOrTombstone kind="vendor" id={row.vendor_id} name={row.vendor_name} noun="Vendor" /> },
      { key: "work_order_id", label: "Work order", render: (row) => <EntityLinkOrTombstone kind="work_order" id={row.work_order_id} name={row.work_order_display_id} noun="Work order" /> },
      { key: "claim_number", label: "Claim #", sortable: true, render: (row) => row.claim_number || "—" },
      { key: "status", label: "Status", sortable: true, render: (row) => row.status_label ?? row.status },
      { key: "claim_amount_cents", label: "Amount", render: (row) => `$${((row.claim_amount_cents ?? 0) / 100).toFixed(2)}` },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) =>
          row.status === "draft" ? (
            <Button type="button" variant="secondary" onClick={() => setFileTarget(row)}>
              File claim
            </Button>
          ) : (
            "—"
          ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-4" data-testid="maint-warranty-claims-page">
      {/* UI-BACK-BUTTON-MISSING-ENTIRELY: see VehiclesMasterDataPage.tsx sibling comment. */}
      <PageHeader
        title="Warranty Claims"
        subtitle="Track parts warranty coverage, file vendor claims, and detect eligible parts from completed work orders."
        breadcrumb={[{ label: "Maintenance" }, { label: "Warranty Claims" }]}
        backHref="/maintenance"
        actions={
          <Button type="button" disabled={!companyId || claimsQ.isError} onClick={() => setCreateOpen(true)}>
            + Create Claim
          </Button>
        }
      />

      <div className="grid gap-3 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-[1fr_auto]">
        <label className="text-xs text-gray-700">
          Detect from work order
          {/* C1 PICKER LAW: was a raw-UUID box. This is a LOOKUP action (scan a completed WO for
              warranty-eligible parts), so allowCreate={false} — a work order is a transaction with
              its own wide wizard and is never conjured from a dropdown. */}
          <EntityPicker
            kind="work_order"
            operatingCompanyId={companyId}
            value={detectWoId || null}
            onChange={(next) => setDetectWoId(next ?? "")}
            allowCreate={false}
            placeholder="Select work order"
            className="mt-1"
            dataField="warranty-detect-wo-input"
            dataTestId="warranty-detect-wo-input"
            enabled={!claimsQ.isError}
          />
        </label>
        <div className="self-end">
          <Button
            type="button"
            variant="secondary"
            disabled={claimsQ.isError || !companyId || !detectWoId.trim() || detectMutation.isPending}
            onClick={() => detectMutation.mutate({ companyId, generation: actionGenerationRef.current, workOrderId: detectWoId })}
            data-testid="warranty-detect-from-wo"
          >
            Detect from WO
          </Button>
        </div>
      </div>

      <section data-testid="warranty-claims-table">
        {claimsQ.isError ? (
          <ListErrorState
            title="Couldn't load warranty claims"
            status={0}
            message={(claimsQ.error as Error)?.message}
            onRetry={() => void claimsQ.refetch()}
          />
        ) : (
          <ParityTable
            rows={claims}
            columns={columns}
            rowKey={(row) => row.id}
            rowClassName={(row) => (row.id === highlightedClaimId ? "bg-slate-100 ring-1 ring-slate-400" : "")}
            loading={claimsQ.isPending}
            storageKey="maintenance-warranty-claims"
            emptyText="No warranty claims yet."
            exportFilename="warranty-claims"
          />
        )}
      </section>

      <Modal variant="drawer" open={createOpen} onClose={() => setCreateOpen(false)} title="+ Create Claim">
        <div className="space-y-3 text-sm">
          <label className="block text-xs">
            Part description
            <input
              className="mt-1 block w-full rounded-sm border border-gray-300 px-2 py-1"
              value={claimDraft.part_description}
              onChange={(e) => setClaimDraft((d) => ({ ...d, part_description: e.target.value }))}
            />
          </label>
          <label className="block text-xs">
            Vendor
            <div className="mt-1" data-testid="warranty-vendor-select">
              <EntityPicker
                kind="vendor"
                allowCreate
                operatingCompanyId={companyId}
                value={claimDraft.vendor_id || null}
                onChange={(next) => setClaimDraft((d) => ({ ...d, vendor_id: next ?? "" }))}
                enabled={createOpen}
                placeholder="Select vendor…"
                dataField="warranty-claim-vendor"
              />
            </div>
          </label>
          <label className="block text-xs">
            Claim amount (USD)
            {/* M-1: was raw "(cents)"; cents-mode MoneyInput (operator types dollars; claim_amount_cents
                = Number(claimDraft.claim_amount_cents) unchanged, byte-for-byte). */}
            <MoneyInput
              valueCents={claimDraft.claim_amount_cents ? Number(claimDraft.claim_amount_cents) : null}
              onChangeCents={(c) => setClaimDraft((d) => ({ ...d, claim_amount_cents: c == null ? "" : String(c) }))}
              ariaLabel="Claim amount (USD)"
              className="mt-1 w-full"
            />
          </label>
          <label className="block text-xs">
            Work order (optional)
            <EntityPicker
              kind="work_order"
              operatingCompanyId={companyId}
              value={claimDraft.work_order_id || null}
              onChange={(next) => setClaimDraft((d) => ({ ...d, work_order_id: next ?? "" }))}
              allowCreate={false}
              placeholder="Select work order"
              className="mt-1"
              dataField="warranty-claim-work-order"
            />
          </label>
          <Button
            type="button"
            disabled={claimsQ.isError || !claimDraft.part_description.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate({ companyId, generation: actionGenerationRef.current, draft: { ...claimDraft } })}
          >
            Save claim
          </Button>
        </div>
      </Modal>

      <Modal
        open={Boolean(fileTarget)}
        onClose={() => {
          setFileTarget(null);
          setFileClaimNumber("");
        }}
        title="File claim"
      >
        <div className="space-y-3 text-sm">
          <p className="text-xs text-gray-600">File warranty claim for {fileTarget?.part_description}.</p>
          <div className="flex flex-wrap gap-3 text-xs text-slate-700">
            <span>Vendor: <EntityLinkOrTombstone kind="vendor" id={fileTarget?.vendor_id} name={fileTarget?.vendor_name} noun="Vendor" /></span>
            <span>Work order: <EntityLinkOrTombstone kind="work_order" id={fileTarget?.work_order_id} name={fileTarget?.work_order_display_id} noun="Work order" /></span>
          </div>
          <label className="block text-xs">
            Vendor claim number
            <input
              className="mt-1 block w-full rounded-sm border border-gray-300 px-2 py-1"
              value={fileClaimNumber}
              onChange={(e) => setFileClaimNumber(e.target.value)}
            />
          </label>
          <Button
            type="button"
            disabled={claimsQ.isError || !fileTarget || fileMutation.isPending}
            onClick={() => {
              if (!fileTarget) return;
              fileMutation.mutate({ id: fileTarget.id, companyId, generation: actionGenerationRef.current, claimNumber: fileClaimNumber });
            }}
          >
            File claim
          </Button>
        </div>
      </Modal>
    </div>
  );
}
