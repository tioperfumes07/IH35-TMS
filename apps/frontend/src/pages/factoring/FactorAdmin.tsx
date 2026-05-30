import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  assignCustomerFactor,
  createFactor,
  getCustomerFactor,
  listFactors,
  type Factor,
} from "../../api/factoring";
import { listCustomers } from "../../api/mdata";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { useCompanyContext } from "../../contexts/CompanyContext";

function formatPct(value: number) {
  return `${(Number(value || 0) * 100).toFixed(2)}%`;
}

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

type AddFactorForm = {
  name: string;
  advance_rate: string;
  fee_rate: string;
  reserve_rate: string;
  recourse_days: string;
};

export function FactorAdmin() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [showAddFactorModal, setShowAddFactorModal] = useState(false);
  const [showAssignCustomerModal, setShowAssignCustomerModal] = useState(false);
  const [selectedFactor, setSelectedFactor] = useState<Factor | null>(null);
  const [detailCustomerId, setDetailCustomerId] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [assignCustomerId, setAssignCustomerId] = useState("");
  const [assignFactorId, setAssignFactorId] = useState("");
  const [assignEffectiveFrom, setAssignEffectiveFrom] = useState(todayDate());
  const [addForm, setAddForm] = useState<AddFactorForm>({
    name: "",
    advance_rate: "0.95",
    fee_rate: "0.025",
    reserve_rate: "0.10",
    recourse_days: "90",
  });

  const factorsQuery = useQuery({
    queryKey: ["factoring", "factors", companyId],
    queryFn: () => listFactors(companyId).then((res) => res.factors),
    enabled: Boolean(companyId),
  });

  const customersQuery = useQuery({
    queryKey: ["factoring", "factor-admin", "customers", companyId, customerSearch],
    queryFn: () =>
      listCustomers({
        operating_company_id: companyId,
        status: "active",
        search: customerSearch || undefined,
      }).then((res) => res.customers),
    enabled: Boolean(companyId),
  });

  const customerFactorDetailQuery = useQuery({
    queryKey: ["factoring", "customer-factor-detail", companyId, detailCustomerId],
    queryFn: () => getCustomerFactor(detailCustomerId, companyId),
    enabled: Boolean(companyId && detailCustomerId),
  });

  const addFactorMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: addForm.name.trim(),
        advance_rate: Number(addForm.advance_rate),
        fee_rate: Number(addForm.fee_rate),
        reserve_rate: Number(addForm.reserve_rate),
        recourse_days: Number(addForm.recourse_days),
      };
      return createFactor(companyId, payload);
    },
    onSuccess: async () => {
      setShowAddFactorModal(false);
      setAddForm({ name: "", advance_rate: "0.95", fee_rate: "0.025", reserve_rate: "0.10", recourse_days: "90" });
      pushToast("Factor created", "success");
      await queryClient.invalidateQueries({ queryKey: ["factoring", "factors", companyId] });
    },
    onError: (error) => pushToast(String((error as Error).message || "Failed to create factor"), "error"),
  });

  const assignMutation = useMutation({
    mutationFn: async () =>
      assignCustomerFactor(assignCustomerId, companyId, {
        factor_id: assignFactorId,
        effective_from: assignEffectiveFrom,
      }),
    onSuccess: async () => {
      pushToast("Customer assignment saved", "success");
      setShowAssignCustomerModal(false);
      setDetailCustomerId(assignCustomerId);
      await queryClient.invalidateQueries({ queryKey: ["factoring", "customer-factor-detail", companyId, assignCustomerId] });
    },
    onError: (error) => pushToast(String((error as Error).message || "Failed to assign customer"), "error"),
  });

  const selectedCustomer = useMemo(
    () => (customersQuery.data ?? []).find((customer) => customer.id === detailCustomerId) ?? null,
    [customersQuery.data, detailCustomerId]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-gray-900">Factor Administration</div>
          <div className="text-xs text-gray-600">Manage factors, assign customers, and review assignment/batch history.</div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => setShowAssignCustomerModal(true)}>
            Assign Customer
          </Button>
          <Button size="sm" onClick={() => setShowAddFactorModal(true)}>
            Add Factor
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200 text-xs">
          <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-2 py-2">Name</th>
              <th className="px-2 py-2">Advance Rate</th>
              <th className="px-2 py-2">Fee Rate</th>
              <th className="px-2 py-2">Reserve Rate</th>
              <th className="px-2 py-2">Recourse Days</th>
              <th className="px-2 py-2">Active</th>
              <th className="px-2 py-2">Updated</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {(factorsQuery.data ?? []).map((factor) => (
              <tr
                key={factor.id}
                onClick={() => setSelectedFactor(factor)}
                className={`cursor-pointer ${selectedFactor?.id === factor.id ? "bg-blue-50" : "hover:bg-gray-50"}`}
              >
                <td className="px-2 py-2 font-medium text-gray-900">{factor.name}</td>
                <td className="px-2 py-2">{formatPct(factor.advance_rate)}</td>
                <td className="px-2 py-2">{formatPct(factor.fee_rate)}</td>
                <td className="px-2 py-2">{formatPct(factor.reserve_rate)}</td>
                <td className="px-2 py-2">{factor.recourse_days}</td>
                <td className="px-2 py-2">{factor.active ? "Yes" : "No"}</td>
                <td className="px-2 py-2">{new Date(factor.updated_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {!factorsQuery.isLoading && (factorsQuery.data ?? []).length === 0 ? (
              <tr>
                <td className="px-2 py-4 text-gray-500" colSpan={7}>
                  No factors configured yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {selectedFactor ? (
        <div className="space-y-2 rounded border border-gray-200 bg-white p-3">
          <div className="text-sm font-semibold text-gray-900">{selectedFactor.name} details</div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
              placeholder="Search customer"
              className="w-56 rounded border border-gray-300 px-2 py-1"
            />
            <select
              value={detailCustomerId}
              onChange={(event) => setDetailCustomerId(event.target.value)}
              className="w-80 rounded border border-gray-300 px-2 py-1"
            >
              <option value="">Select customer for detail view</option>
              {(customersQuery.data ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} ({customer.customer_code || customer.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </div>

          {detailCustomerId ? (
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="rounded border border-gray-200 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">
                  Assignment History {selectedCustomer ? `- ${selectedCustomer.name}` : ""}
                </div>
                <div className="max-h-72 overflow-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-2 py-2">Factor</th>
                        <th className="px-2 py-2">Effective From</th>
                        <th className="px-2 py-2">Effective To</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(customerFactorDetailQuery.data?.assignments ?? [])
                        .filter((row) => row.factor_id === selectedFactor.id)
                        .map((row) => (
                          <tr key={row.id}>
                            <td className="px-2 py-2">{row.factor_name}</td>
                            <td className="px-2 py-2">{row.effective_from}</td>
                            <td className="px-2 py-2">{row.effective_to ?? "Active"}</td>
                          </tr>
                        ))}
                      {!customerFactorDetailQuery.isLoading &&
                      (customerFactorDetailQuery.data?.assignments ?? []).filter((row) => row.factor_id === selectedFactor.id).length === 0 ? (
                        <tr>
                          <td className="px-2 py-3 text-gray-500" colSpan={3}>
                            No assignments found for this factor/customer.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded border border-gray-200 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-600">Batch History</div>
                <div className="max-h-72 overflow-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-xs">
                    <thead className="bg-gray-50 text-left uppercase tracking-wide text-gray-500">
                      <tr>
                        <th className="px-2 py-2">Batch</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Submitted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(customerFactorDetailQuery.data?.batches ?? []).map((row) => (
                        <tr key={row.id}>
                          <td className="px-2 py-2">{row.batch_number}</td>
                          <td className="px-2 py-2 capitalize">{row.status}</td>
                          <td className="px-2 py-2">{row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : "-"}</td>
                        </tr>
                      ))}
                      {!customerFactorDetailQuery.isLoading && (customerFactorDetailQuery.data?.batches ?? []).length === 0 ? (
                        <tr>
                          <td className="px-2 py-3 text-gray-500" colSpan={3}>
                            No batch history for this customer.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-xs text-gray-600">Select a customer to view assignment and batch history.</div>
          )}
        </div>
      ) : null}

      {showAddFactorModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-md rounded border border-gray-200 bg-white p-4 shadow-xl">
            <div className="mb-3 text-sm font-semibold text-gray-900">Add Factor</div>
            <div className="space-y-2 text-xs">
              <label className="block">
                <div className="mb-1">Name</div>
                <input
                  value={addForm.name}
                  onChange={(event) => setAddForm((current) => ({ ...current, name: event.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="block">
                <div className="mb-1">Advance Rate (0-1)</div>
                <input
                  value={addForm.advance_rate}
                  onChange={(event) => setAddForm((current) => ({ ...current, advance_rate: event.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="block">
                <div className="mb-1">Fee Rate (0-1)</div>
                <input
                  value={addForm.fee_rate}
                  onChange={(event) => setAddForm((current) => ({ ...current, fee_rate: event.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="block">
                <div className="mb-1">Reserve Rate (0-1)</div>
                <input
                  value={addForm.reserve_rate}
                  onChange={(event) => setAddForm((current) => ({ ...current, reserve_rate: event.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="block">
                <div className="mb-1">Recourse Days</div>
                <input
                  value={addForm.recourse_days}
                  onChange={(event) => setAddForm((current) => ({ ...current, recourse_days: event.target.value }))}
                  className="w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowAddFactorModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                loading={addFactorMutation.isPending}
                onClick={() => {
                  if (!addForm.name.trim()) {
                    pushToast("Factor name is required", "error");
                    return;
                  }
                  void addFactorMutation.mutateAsync();
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showAssignCustomerModal ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-3">
          <div className="w-full max-w-md rounded border border-gray-200 bg-white p-4 shadow-xl">
            <div className="mb-3 text-sm font-semibold text-gray-900">Assign Customer to Factor</div>
            <div className="space-y-2 text-xs">
              <label className="block">
                <div className="mb-1">Customer search</div>
                <input
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Type customer name"
                  className="w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
              <label className="block">
                <div className="mb-1">Customer</div>
                <select
                  value={assignCustomerId}
                  onChange={(event) => setAssignCustomerId(event.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1"
                >
                  <option value="">Select customer</option>
                  {(customersQuery.data ?? []).map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <div className="mb-1">Factor</div>
                <select
                  value={assignFactorId}
                  onChange={(event) => setAssignFactorId(event.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1"
                >
                  <option value="">Select factor</option>
                  {(factorsQuery.data ?? [])
                    .filter((factor) => factor.active)
                    .map((factor) => (
                      <option key={factor.id} value={factor.id}>
                        {factor.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                <div className="mb-1">Effective date</div>
                <input
                  type="date"
                  value={assignEffectiveFrom}
                  onChange={(event) => setAssignEffectiveFrom(event.target.value)}
                  className="w-full rounded border border-gray-300 px-2 py-1"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={() => setShowAssignCustomerModal(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                loading={assignMutation.isPending}
                onClick={() => {
                  if (!assignCustomerId || !assignFactorId || !assignEffectiveFrom) {
                    pushToast("Customer, factor, and effective date are required", "error");
                    return;
                  }
                  void assignMutation.mutateAsync();
                }}
              >
                Assign
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
