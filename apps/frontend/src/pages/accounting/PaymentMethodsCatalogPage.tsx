import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { Button } from "../../components/Button";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { Modal } from "../../components/Modal";
import { VoidReasonModal } from "../../components/accounting/VoidReasonModal";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { getCoaAccounts } from "../../api/banking";
import {
  createPaymentMethod,
  listPaymentMethods,
  updatePaymentMethod,
  voidPaymentMethod,
  type PaymentMethod,
} from "../../api/paymentMethods";

type FormState = { name: string; gl_account_id: string | null; sort_order: number };

const EMPTY_FORM: FormState = { name: "", gl_account_id: null, sort_order: 0 };

/**
 * Owner-editable payment-method CATALOG manager (catalogs.payment_methods). Additive screen —
 * DISTINCT from the generic /lists/accounting/payment-methods factory-catalog page (a different,
 * older table). List / add / edit / set-active / void. Owner/Administrator write-gated server-side;
 * everyone authenticated can read (pickers need it).
 */
export function PaymentMethodsCatalogPage() {
  const { selectedCompanyId } = useCompanyContext();
  const { user } = useAuth();
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const canWrite = user?.role === "Owner" || user?.role === "Administrator";

  const [includeInactive, setIncludeInactive] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<FormState>(EMPTY_FORM);
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<FormState>(EMPTY_FORM);
  const [voidTarget, setVoidTarget] = useState<PaymentMethod | null>(null);

  const methodsQuery = useQuery({
    queryKey: ["catalogs", "payment-methods", companyId, includeInactive],
    queryFn: () => listPaymentMethods(companyId, includeInactive),
    enabled: Boolean(companyId),
  });

  const accountsQuery = useQuery({
    queryKey: ["catalogs", "accounts", "for-payment-methods-catalog", companyId],
    queryFn: () => getCoaAccounts(companyId),
    enabled: (createOpen || Boolean(editId)) && Boolean(companyId),
  });
  const accountOptions = useMemo(
    () => (accountsQuery.data?.accounts ?? []).map((a) => ({ value: a.id, label: a.account_name, type: a.account_number ?? undefined })),
    [accountsQuery.data]
  );
  const accountNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of accountsQuery.data?.accounts ?? []) map.set(a.id, a.account_name);
    return map;
  }, [accountsQuery.data]);

  const rows = methodsQuery.data ?? [];

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["catalogs", "payment-methods", companyId] });

  const createMut = useMutation({
    mutationFn: () => createPaymentMethod(companyId, { name: createForm.name.trim(), gl_account_id: createForm.gl_account_id, sort_order: createForm.sort_order }),
    onSuccess: () => {
      pushToast("Payment method created", "success");
      setCreateOpen(false);
      setCreateForm(EMPTY_FORM);
      invalidate();
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Create failed", "error"),
  });

  const updateMut = useMutation({
    mutationFn: () =>
      updatePaymentMethod(editId as string, companyId, {
        name: editForm.name.trim(),
        gl_account_id: editForm.gl_account_id,
        sort_order: editForm.sort_order,
      }),
    onSuccess: () => {
      pushToast("Payment method updated", "success");
      setEditId(null);
      invalidate();
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Update failed", "error"),
  });

  const setActiveMut = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) => updatePaymentMethod(id, companyId, { is_active }),
    onSuccess: () => invalidate(),
    onError: (err) => pushToast(err instanceof Error ? err.message : "Update failed", "error"),
  });

  const voidMut = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidPaymentMethod(id, companyId, reason),
    onSuccess: () => {
      pushToast("Payment method voided", "success");
      invalidate();
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Void failed", "error"),
  });

  return (
    <AccountingSubNavWrapper
      title="Payment Methods Catalog"
      subtitle="Owner-editable list of methods the company pays drivers/vendors by, each pinned to a GL cash/bank account"
      actions={
        canWrite ? (
          <Button
            onClick={() => {
              setCreateForm(EMPTY_FORM);
              setCreateOpen(true);
            }}
          >
            + Create
          </Button>
        ) : null
      }
    >
      {methodsQuery.isError ? <ListErrorBanner onRetry={() => void methodsQuery.refetch()} /> : null}

      <label className="flex items-center gap-2 text-xs font-medium text-gray-600">
        <input
          type="checkbox"
          checked={includeInactive}
          onChange={(e) => setIncludeInactive(e.target.checked)}
          aria-label="Show voided/inactive methods"
        />
        Show inactive / voided
      </label>

      <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="px-3 py-2">Sort</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">GL account</th>
              <th className="px-3 py-2">Status</th>
              {canWrite ? <th className="px-3 py-2">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {methodsQuery.isLoading ? (
              <tr>
                <td className="px-3 py-3 text-xs text-gray-500" colSpan={5}>Loading…</td>
              </tr>
            ) : null}
            {!methodsQuery.isLoading && rows.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-xs text-gray-500" colSpan={5}>No payment methods yet.</td>
              </tr>
            ) : null}
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-gray-100">
                <td className="px-3 py-2 text-xs text-gray-600">{row.sort_order}</td>
                <td className="px-3 py-2 font-medium text-gray-900">{row.name}</td>
                <td className="px-3 py-2 text-xs text-gray-600">
                  {row.gl_account_id ? (accountNameById.get(row.gl_account_id) ?? row.gl_account_id.slice(0, 8)) : "Unassigned"}
                </td>
                <td className="px-3 py-2">
                  {row.is_active ? (
                    <span className="inline-flex rounded-sm bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">Active</span>
                  ) : (
                    <span className="inline-flex rounded-sm bg-slate-100 px-2 py-0.5 text-xs text-slate-900">Inactive / Voided</span>
                  )}
                </td>
                {canWrite ? (
                  <td className="space-x-2 px-3 py-2 whitespace-nowrap">
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setEditId(row.id);
                        setEditForm({ name: row.name, gl_account_id: row.gl_account_id, sort_order: row.sort_order });
                      }}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={setActiveMut.isPending}
                      onClick={() => setActiveMut.mutate({ id: row.id, is_active: !row.is_active })}
                    >
                      {row.is_active ? "Set inactive" : "Set active"}
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => setVoidTarget(row)}>
                      Void
                    </Button>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Add new payment method">
        <div className="space-y-3 text-sm">
          {accountsQuery.isError ? (
            <ListErrorBanner
              message={`Failed to load GL accounts: ${(accountsQuery.error as Error)?.message ?? "Request failed"}`}
              onRetry={() => void accountsQuery.refetch()}
            />
          ) : null}
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Name *</span>
            <input
              className="mt-1 h-10 w-full rounded-sm border border-gray-300 px-2"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Zelle"
              aria-label="Payment method name"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">GL account (cash/bank)</span>
            <div className="mt-1">
              <ReferenceSelect
                value={createForm.gl_account_id}
                onChange={(v) => setCreateForm((f) => ({ ...f, gl_account_id: v }))}
                options={accountOptions}
                createKind="account"
                operatingCompanyId={companyId}
                placeholder="Select GL account (optional)"
                disabled={accountsQuery.isLoading}
                onOptionCreated={() => void accountsQuery.refetch()}
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Sort order</span>
            <input
              type="number"
              className="mt-1 h-10 w-full rounded-sm border border-gray-300 px-2"
              value={createForm.sort_order}
              onChange={(e) => setCreateForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
              aria-label="Sort order"
            />
          </label>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={createForm.name.trim().length === 0 || createMut.isPending}
              loading={createMut.isPending}
              onClick={() => createMut.mutate()}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(editId)} onClose={() => setEditId(null)} title="Edit payment method">
        <div className="space-y-3 text-sm">
          {accountsQuery.isError ? (
            <ListErrorBanner
              message={`Failed to load GL accounts: ${(accountsQuery.error as Error)?.message ?? "Request failed"}`}
              onRetry={() => void accountsQuery.refetch()}
            />
          ) : null}
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Name *</span>
            <input
              className="mt-1 h-10 w-full rounded-sm border border-gray-300 px-2"
              value={editForm.name}
              onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              aria-label="Edit payment method name"
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">GL account (cash/bank)</span>
            <div className="mt-1">
              <ReferenceSelect
                value={editForm.gl_account_id}
                onChange={(v) => setEditForm((f) => ({ ...f, gl_account_id: v }))}
                options={accountOptions}
                createKind="account"
                operatingCompanyId={companyId}
                placeholder="Select GL account"
                disabled={accountsQuery.isLoading}
                onOptionCreated={() => void accountsQuery.refetch()}
              />
            </div>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-gray-600">Sort order</span>
            <input
              type="number"
              className="mt-1 h-10 w-full rounded-sm border border-gray-300 px-2"
              value={editForm.sort_order}
              onChange={(e) => setEditForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))}
              aria-label="Edit sort order"
            />
          </label>
          <div className="flex justify-end gap-2 border-t border-gray-100 pt-3">
            <Button type="button" variant="secondary" onClick={() => setEditId(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={editForm.name.trim().length === 0 || updateMut.isPending}
              loading={updateMut.isPending}
              onClick={() => updateMut.mutate()}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      <VoidReasonModal
        open={Boolean(voidTarget)}
        title="Void Payment Method"
        entityRef={voidTarget ? voidTarget.name : undefined}
        minLength={3}
        postsReversingEntry={false}
        onClose={() => setVoidTarget(null)}
        onSubmit={async (reason) => {
          if (!voidTarget) return;
          await voidMut.mutateAsync({ id: voidTarget.id, reason });
          setVoidTarget(null);
        }}
      />
    </AccountingSubNavWrapper>
  );
}
