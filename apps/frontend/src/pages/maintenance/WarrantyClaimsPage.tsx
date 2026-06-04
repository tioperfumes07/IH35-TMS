import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createMaintenanceWarrantyClaim,
  detectMaintenanceWarrantyFromWorkOrder,
  fileMaintenanceWarrantyClaim,
  listMaintenanceVendors,
  listMaintenanceWarrantyClaims,
  type MaintenanceWarrantyClaimRow,
} from "../../api/maintenance";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

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
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [fileTarget, setFileTarget] = useState<MaintenanceWarrantyClaimRow | null>(null);
  const [detectWoId, setDetectWoId] = useState("");
  const [claimDraft, setClaimDraft] = useState<ClaimDraft>(EMPTY_CLAIM);
  const [fileClaimNumber, setFileClaimNumber] = useState("");

  const claimsQ = useQuery({
    queryKey: ["maintenance", "warranty-claims", companyId],
    queryFn: () => listMaintenanceWarrantyClaims(companyId),
    enabled: Boolean(companyId),
  });

  const vendorsQ = useQuery({
    queryKey: ["maintenance", "vendors", companyId, "warranty-claims"],
    queryFn: () => listMaintenanceVendors(companyId),
    enabled: Boolean(companyId),
  });

  const vendors = useMemo(
    () => (vendorsQ.data?.rows ?? []) as Array<{ id: string; display_name?: string; name?: string }>,
    [vendorsQ.data?.rows]
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["maintenance", "warranty-claims", companyId] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      createMaintenanceWarrantyClaim({
        operating_company_id: companyId,
        part_description: claimDraft.part_description,
        claim_amount_cents: Number(claimDraft.claim_amount_cents || "0"),
        vendor_id: claimDraft.vendor_id || undefined,
        work_order_id: claimDraft.work_order_id || undefined,
        claim_number: claimDraft.claim_number,
      }),
    onSuccess: async () => {
      setCreateOpen(false);
      setClaimDraft(EMPTY_CLAIM);
      await refresh();
      pushToast("Warranty claim created", "success");
    },
    onError: () => pushToast("Failed to create claim", "error"),
  });

  const fileMutation = useMutation({
    mutationFn: () =>
      fileMaintenanceWarrantyClaim(String(fileTarget?.id), {
        operating_company_id: companyId,
        claim_number: fileClaimNumber || undefined,
      }),
    onSuccess: async () => {
      setFileTarget(null);
      setFileClaimNumber("");
      await refresh();
      pushToast("Claim filed with vendor", "success");
    },
    onError: () => pushToast("Failed to file claim", "error"),
  });

  const detectMutation = useMutation({
    mutationFn: () =>
      detectMaintenanceWarrantyFromWorkOrder({
        operating_company_id: companyId,
        work_order_id: detectWoId,
        create_draft_claims: true,
      }),
    onSuccess: async (result) => {
      await refresh();
      const count = result.created_claims?.length ?? result.eligible?.length ?? 0;
      pushToast(count ? `Detected ${count} warranty-eligible part(s)` : "No eligible warranty parts found", "success");
    },
    onError: () => pushToast("Failed to detect warranty parts from WO", "error"),
  });

  const claims = claimsQ.data?.rows ?? [];

  return (
    <div className="space-y-4" data-testid="maint-warranty-claims-page">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Warranty Claims</h2>
          <p className="text-xs text-gray-500">
            Track parts warranty coverage, file vendor claims, and detect eligible parts from completed work orders.
          </p>
        </div>
        <Button type="button" disabled={!companyId} onClick={() => setCreateOpen(true)}>
          + Create Claim
        </Button>
      </div>

      <div className="grid gap-3 rounded border border-gray-200 bg-white p-3 md:grid-cols-[1fr_auto]">
        <label className="text-xs text-gray-700">
          Detect from work order
          <input
            className="mt-1 block w-full rounded border border-gray-300 px-2 py-1 text-sm"
            placeholder="Work order UUID"
            value={detectWoId}
            onChange={(e) => setDetectWoId(e.target.value)}
            data-testid="warranty-detect-wo-input"
          />
        </label>
        <div className="self-end">
          <Button
            type="button"
            variant="secondary"
            disabled={!companyId || !detectWoId.trim() || detectMutation.isPending}
            onClick={() => detectMutation.mutate()}
            data-testid="warranty-detect-from-wo"
          >
            Detect from WO
          </Button>
        </div>
      </div>

      <section data-testid="warranty-claims-table">
        <table className="w-full text-left text-xs">
          <thead className="text-[11px] uppercase text-gray-500">
            <tr>
              <th className="py-1">Part</th>
              <th className="py-1">Vendor</th>
              <th className="py-1">Claim #</th>
              <th className="py-1">Status</th>
              <th className="py-1">Amount</th>
              <th className="py-1">Actions</th>
            </tr>
          </thead>
          <tbody>
            {claims.map((claim) => (
              <tr key={claim.id} className="border-t border-gray-100">
                <td className="py-1">{claim.part_description}</td>
                <td className="py-1">{claim.vendor_name ?? "—"}</td>
                <td className="py-1">{claim.claim_number || "—"}</td>
                <td className="py-1">{claim.status_label ?? claim.status}</td>
                <td className="py-1">${((claim.claim_amount_cents ?? 0) / 100).toFixed(2)}</td>
                <td className="py-1">
                  {claim.status === "draft" ? (
                    <Button type="button" variant="secondary" onClick={() => setFileTarget(claim)}>
                      File claim
                    </Button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {claims.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-3 text-gray-500">
                  No warranty claims yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="+ Create Claim">
        <div className="space-y-3 text-sm">
          <label className="block text-xs">
            Part description
            <input
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1"
              value={claimDraft.part_description}
              onChange={(e) => setClaimDraft((d) => ({ ...d, part_description: e.target.value }))}
            />
          </label>
          <label className="block text-xs">
            Vendor
            <select
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1"
              value={claimDraft.vendor_id}
              onChange={(e) => setClaimDraft((d) => ({ ...d, vendor_id: e.target.value }))}
              data-testid="warranty-vendor-select"
            >
              <option value="">Select vendor…</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.display_name ?? vendor.name ?? vendor.id}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            Claim amount (cents)
            <input
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1"
              value={claimDraft.claim_amount_cents}
              onChange={(e) => setClaimDraft((d) => ({ ...d, claim_amount_cents: e.target.value }))}
            />
          </label>
          <label className="block text-xs">
            Work order ID (optional)
            <input
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1"
              value={claimDraft.work_order_id}
              onChange={(e) => setClaimDraft((d) => ({ ...d, work_order_id: e.target.value }))}
            />
          </label>
          <Button
            type="button"
            disabled={!claimDraft.part_description.trim() || createMutation.isPending}
            onClick={() => createMutation.mutate()}
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
          <label className="block text-xs">
            Vendor claim number
            <input
              className="mt-1 block w-full rounded border border-gray-300 px-2 py-1"
              value={fileClaimNumber}
              onChange={(e) => setFileClaimNumber(e.target.value)}
            />
          </label>
          <Button type="button" disabled={fileMutation.isPending} onClick={() => fileMutation.mutate()}>
            File claim
          </Button>
        </div>
      </Modal>
    </div>
  );
}
