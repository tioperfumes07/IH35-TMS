import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  driverPaymentMethodsApi,
  type CreateDriverPaymentMethodBody,
  type DriverPaymentMethod,
} from "../../api/driverPaymentMethods";
import { useAuth } from "../../auth/useAuth";
import { ListErrorState } from "../ListErrorState";
import { SelectCombobox } from "../Combobox";

function canManage(role: string | undefined) {
  return role === "Owner" || role === "Administrator";
}

function methodLabel(m: DriverPaymentMethod) {
  if (m.method === "ach") {
    const tail = m.account_last4 ? ` ••••${m.account_last4}` : "";
    return `ACH${tail}`;
  }
  return "Check";
}

const EMPTY_FORM: CreateDriverPaymentMethodBody = {
  method: "ach",
  account_token: "",
  routing_last4: "",
  account_last4: "",
  account_holder_name: "",
  make_default: true,
};

export function DriverPaymentMethodsCard({ driverId, companyId }: { driverId: string; companyId: string }) {
  const { user } = useAuth();
  const manage = canManage(user?.role);
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<CreateDriverPaymentMethodBody>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);

  const queryKey = ["driver-payment-methods", companyId, driverId];
  const methodsQuery = useQuery({
    queryKey,
    queryFn: () => driverPaymentMethodsApi.list(companyId, driverId),
    enabled: Boolean(companyId && driverId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey });

  const createMutation = useMutation({
    mutationFn: () => {
      const body: CreateDriverPaymentMethodBody = {
        method: form.method,
        account_holder_name: form.account_holder_name?.trim() || null,
        make_default: form.make_default,
      };
      if (form.method === "ach") {
        body.account_token = form.account_token?.trim() || null;
        body.routing_last4 = form.routing_last4?.trim() || null;
        body.account_last4 = form.account_last4?.trim() || null;
      }
      return driverPaymentMethodsApi.create(companyId, driverId, body);
    },
    onSuccess: async () => {
      setShowAdd(false);
      setForm(EMPTY_FORM);
      setError(null);
      await invalidate();
    },
    onError: (e) => setError(String((e as Error)?.message ?? "Unable to add payment method")),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: string) => driverPaymentMethodsApi.setDefault(companyId, id),
    onSuccess: invalidate,
    onError: (e) => setError(String((e as Error)?.message ?? "Unable to set default payment method")),
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => driverPaymentMethodsApi.void(companyId, id, "Removed by office"),
    onSuccess: invalidate,
    onError: (e) => setError(String((e as Error)?.message ?? "Unable to remove payment method")),
  });

  const methods = methodsQuery.data?.payment_methods ?? [];
  const achValid = form.method !== "ach" || Boolean(form.account_token?.trim());

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-xs font-semibold text-gray-800">Payment Methods</h2>
        {manage ? (
          <button
            type="button"
            onClick={() => {
              setShowAdd((s) => !s);
              setError(null);
            }}
            className="rounded-sm border border-[#1F2A44] bg-[#1F2A44] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#0F1729]"
          >
            {showAdd ? "Cancel" : "+ Create method"}
          </button>
        ) : null}
      </div>

      {showAdd && manage ? (
        <div className="mt-3 grid gap-2 border-t border-gray-100 pt-3 text-xs">
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-gray-600">Method</span>
            <SelectCombobox
              className="h-9 w-full rounded-sm border border-gray-300 px-2 text-xs"
              value={form.method}
              onChange={(e) => setForm((p) => ({ ...p, method: e.target.value as DriverPaymentMethod["method"] }))}
            >
              <option value="ach">ACH direct deposit</option>
              <option value="check">Check</option>
            </SelectCombobox>
          </label>
          <label className="grid gap-1">
            <span className="text-xs font-semibold text-gray-600">Account holder</span>
            <input
              className="h-9 w-full rounded-sm border border-gray-300 px-2 text-xs"
              value={form.account_holder_name ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, account_holder_name: e.target.value }))}
              placeholder="Name on account"
            />
          </label>
          {form.method === "ach" ? (
            <>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-gray-600">Bank token (from vault) *</span>
                <input
                  className="h-9 w-full rounded-sm border border-gray-300 px-2 text-xs"
                  value={form.account_token ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, account_token: e.target.value }))}
                  placeholder="tok_… (tokenized reference; no raw account #)"
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-gray-600">Routing last 4</span>
                <input
                  className="h-9 w-full rounded-sm border border-gray-300 px-2 text-xs"
                  value={form.routing_last4 ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, routing_last4: e.target.value }))}
                  placeholder="1234"
                  maxLength={4}
                />
              </label>
              <label className="grid gap-1">
                <span className="text-xs font-semibold text-gray-600">Account last 4</span>
                <input
                  className="h-9 w-full rounded-sm border border-gray-300 px-2 text-xs"
                  value={form.account_last4 ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, account_last4: e.target.value }))}
                  placeholder="5678"
                  maxLength={4}
                />
              </label>
            </>
          ) : null}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(form.make_default)}
              onChange={(e) => setForm((p) => ({ ...p, make_default: e.target.checked }))}
            />
            Set as default
          </label>
          {error ? <p className="text-red-700">{error}</p> : null}
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!achValid || createMutation.isPending}
              onClick={() => createMutation.mutate()}
              className="rounded-sm border border-[#1F2A44] bg-[#1F2A44] px-3 py-1 font-semibold text-white hover:bg-[#0F1729] disabled:opacity-50"
            >
              Save method
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        {/* DRV-MONEY-F6106 — a failed GET was silently rendering as "No payment methods on file.",
            a false-empty state on a money-bearing surface. */}
        {methodsQuery.isError ? (
          <ListErrorState
            title="Couldn't load payment methods"
            status={0}
            message={(methodsQuery.error as Error | null)?.message}
            onRetry={() => void methodsQuery.refetch()}
          />
        ) : methodsQuery.isLoading ? (
          <p className="text-xs text-gray-500">Loading…</p>
        ) : methods.length === 0 ? (
          <p className="text-xs text-gray-500">No payment methods on file.</p>
        ) : (
          <table className="w-full text-xs" data-testid="driver-payment-methods-card-table">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-semibold uppercase text-[#4B5563]">
                <th className="pb-1 pr-3">Method</th>
                <th className="pb-1 pr-3">Holder</th>
                <th className="pb-1 pr-3">Default</th>
                {manage ? <th className="pb-1 text-right">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {methods.map((m) => (
                <tr key={m.id} className="border-b border-gray-100 last:border-0">
                  <td className="py-1 pr-3 font-medium text-[#1F2A44]">{methodLabel(m)}</td>
                  <td className="py-1 pr-3 text-gray-600">{m.account_holder_name ?? "—"}</td>
                  <td className="py-1 pr-3">
                    {m.is_default ? (
                      <span className="rounded-sm bg-[#F7F8FA] px-2 py-0.5 font-medium text-[#1F2A44]">Default</span>
                    ) : "—"}
                  </td>
                  {manage ? (
                    <td className="py-1 text-right">
                      <div className="flex justify-end gap-2">
                        {!m.is_default ? (
                          <button
                            type="button"
                            disabled={setDefaultMutation.isPending}
                            onClick={() => setDefaultMutation.mutate(m.id)}
                            className="text-[#1F2A44] underline disabled:opacity-50"
                          >
                            Make default
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={voidMutation.isPending}
                          onClick={() => voidMutation.mutate(m.id)}
                          className="text-red-700 underline disabled:opacity-50"
                        >
                          Remove
                        </button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
