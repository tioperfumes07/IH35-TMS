import { useState } from "react";
import { DatePicker } from "../../components/forms/DatePicker";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCustomerContract,
  listCustomerContracts,
  supersedeCustomerContract,
  type CustomerContract,
} from "../../api/customer-contracts";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { useToast } from "../Toast";
import { UploadModal } from "../documents/UploadModal";
import { DataTable } from "../DataTable";

type Props = {
  customerId: string;
  customerName: string;
  operatingCompanyId: string;
};

const CONTRACT_TYPE_LABELS: Record<CustomerContract["contract_type"], string> = {
  rate_agreement: "Rate Agreement",
  master_service: "Master Service",
  broker_carrier: "Broker-Carrier",
  other: "Other",
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value + "T00:00:00").toLocaleDateString("en-US");
}

function formatBytes(bytes: number | null) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type MetaForm = {
  contract_type: CustomerContract["contract_type"];
  effective_date: string;
  expiration_date: string;
  notes: string;
};

function emptyMeta(): MetaForm {
  return { contract_type: "rate_agreement", effective_date: "", expiration_date: "", notes: "" };
}

export function CustomerContractsTab({ customerId, customerName, operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { user } = useAuth();

  const canWrite = ["Owner", "Administrator", "Manager"].includes(user?.role ?? "");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const [meta, setMeta] = useState<MetaForm>(emptyMeta());
  const [supersedeTarget, setSupersedeTarget] = useState<CustomerContract | null>(null);
  const [includeSuperseded, setIncludeSuperseded] = useState(false);

  const contractsQuery = useQuery({
    queryKey: ["customer-contracts", customerId, operatingCompanyId, includeSuperseded],
    queryFn: () =>
      listCustomerContracts(customerId, operatingCompanyId, includeSuperseded).then(
        (r) => r.contracts
      ),
    enabled: Boolean(customerId && operatingCompanyId),
  });

  const createMutation = useMutation({
    mutationFn: (fileId: string | undefined) =>
      createCustomerContract({
        operating_company_id: operatingCompanyId,
        customer_id: customerId,
        file_id: fileId,
        contract_type: meta.contract_type,
        effective_date: meta.effective_date || null,
        expiration_date: meta.expiration_date || null,
        notes: meta.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-contracts", customerId] });
      setMetaOpen(false);
      setMeta(emptyMeta());
      pushToast("Contract registered", "success");
    },
    onError: () => pushToast("Failed to register contract", "error"),
  });

  const supersedeMutation = useMutation({
    mutationFn: ({ id, fileId }: { id: string; fileId?: string }) =>
      supersedeCustomerContract(id, {
        operating_company_id: operatingCompanyId,
        file_id: fileId,
        contract_type: meta.contract_type,
        effective_date: meta.effective_date || null,
        expiration_date: meta.expiration_date || null,
        notes: meta.notes || null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customer-contracts", customerId] });
      setMetaOpen(false);
      setSupersedeTarget(null);
      setMeta(emptyMeta());
      pushToast("Contract superseded", "success");
    },
    onError: () => pushToast("Failed to supersede contract", "error"),
  });

  function handleUploadSuccess() {
    setUploadOpen(false);
    setMetaOpen(true);
  }

  function handleMetaSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (supersedeTarget) {
      supersedeMutation.mutate({ id: supersedeTarget.id });
    } else {
      createMutation.mutate(undefined);
    }
  }

  function openSupersede(contract: CustomerContract) {
    setSupersedeTarget(contract);
    setMeta({
      contract_type: contract.contract_type,
      effective_date: contract.effective_date ?? "",
      expiration_date: contract.expiration_date ?? "",
      notes: "",
    });
    setMetaOpen(true);
  }

  const contracts = contractsQuery.data ?? [];
  const isSaving = createMutation.isPending || supersedeMutation.isPending;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-600">
          Signed contracts and rate agreements. Each upload creates an immutable record. To update,
          use <strong>Supersede</strong> — the prior version is retained.
        </p>
        {canWrite && (
          <Button size="sm" onClick={() => setUploadOpen(true)}>
            + Upload Contract
          </Button>
        )}
      </div>

      <div className="flex items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={includeSuperseded}
            onChange={(e) => setIncludeSuperseded(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          Show superseded versions
        </label>
      </div>

      {contractsQuery.isLoading ? (
        <div className="text-xs text-gray-500">Loading contracts…</div>
      ) : contracts.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-xs text-gray-500">
          No contracts on file.{canWrite ? " Upload one above." : ""}
        </div>
      ) : (
        <DataTable
          columns={[
            { key: "contract_type", label: "Type", render: (row: CustomerContract) => CONTRACT_TYPE_LABELS[row.contract_type] },
            { key: "file_name", label: "File", render: (row: CustomerContract) => row.file_name ?? "—" },
            { key: "file_size_bytes", label: "Size", render: (row: CustomerContract) => formatBytes(row.file_size_bytes) },
            { key: "effective_date", label: "Effective", render: (row: CustomerContract) => formatDate(row.effective_date) },
            { key: "expiration_date", label: "Expires", render: (row: CustomerContract) => formatDate(row.expiration_date) },
            { key: "created_at", label: "Uploaded", render: (row: CustomerContract) => formatDate(row.created_at) },
            { key: "supersedes_id", label: "Status", render: (row: CustomerContract) => row.supersedes_id ? <span className="text-xs text-amber-600">Superseded</span> : <span className="text-xs text-green-700">Current</span> },
            ...(canWrite
              ? [{
                  key: "actions",
                  label: "",
                  render: (row: CustomerContract) =>
                    !row.supersedes_id ? (
                      <Button size="sm" variant="secondary" onClick={() => openSupersede(row)}>
                        Supersede
                      </Button>
                    ) : null,
                }]
              : []),
          ]}
          rows={contracts}
          rowKey={(row: CustomerContract) => row.id}
        />
      )}

      {uploadOpen && (
        <UploadModal
          entityType="customer"
          entityId={customerId}
          entityName={customerName}
          onClose={() => setUploadOpen(false)}
          onUploadSuccess={handleUploadSuccess}
        />
      )}

      {metaOpen && (
        <Modal
          open
          onClose={() => { setMetaOpen(false); setSupersedeTarget(null); setMeta(emptyMeta()); }}
          title={supersedeTarget ? "Supersede Contract" : "Register Contract"}
        >
          <form className="space-y-3" onSubmit={handleMetaSubmit}>
            {supersedeTarget && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded p-2">
                Superseding: <strong>{CONTRACT_TYPE_LABELS[supersedeTarget.contract_type]}</strong>
                {supersedeTarget.effective_date ? ` (effective ${formatDate(supersedeTarget.effective_date)})` : ""}
              </p>
            )}
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Contract type *</span>
              <select
                value={meta.contract_type}
                onChange={(e) => setMeta((m) => ({ ...m, contract_type: e.target.value as CustomerContract["contract_type"] }))}
                className="h-9 w-full rounded border border-gray-300 px-2 text-[13px]"
                required
              >
                {Object.entries(CONTRACT_TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-gray-600">Effective date</span>
                <DatePicker
                  value={meta.effective_date}
                  onChange={(next) => setMeta((m) => ({ ...m, effective_date: next }))}
                  className="h-9 w-full rounded border border-gray-300 px-2 text-[13px]"
                />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-semibold text-gray-600">Expiration date</span>
                <DatePicker
                  value={meta.expiration_date}
                  onChange={(next) => setMeta((m) => ({ ...m, expiration_date: next }))}
                  className="h-9 w-full rounded border border-gray-300 px-2 text-[13px]"
                />
              </label>
            </div>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-semibold text-gray-600">Notes</span>
              <textarea
                value={meta.notes}
                onChange={(e) => setMeta((m) => ({ ...m, notes: e.target.value }))}
                rows={2}
                maxLength={2000}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                onClick={() => { setMetaOpen(false); setSupersedeTarget(null); setMeta(emptyMeta()); }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? "Saving…" : supersedeTarget ? "Supersede" : "Register"}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
