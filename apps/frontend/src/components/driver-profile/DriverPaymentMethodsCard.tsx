import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  driverPaymentMethodsApi,
  type CreateDriverPaymentMethodBody,
  type DriverPaymentMethod,
} from "../../api/driverPaymentMethods";
import { useAuth } from "../../auth/useAuth";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";

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

  // DRV-F3562 — ParityTable owns Search+Range+gear; raw HTML table skipped the surface bar.
  const columns = useMemo<ParityColumn<DriverPaymentMethod>[]>(() => {
    const cols: ParityColumn<DriverPaymentMethod>[] = [
      {
        key: "method",
        label: "Method",
        render: (m) => methodLabel(m),
      },
      {
        key: "account_holder_name",
        label: "Holder",
        render: (m) => m.account_holder_name ?? "—",
      },
      {
        key: "is_default",
        label: "Default",
        render: (m) =>
          m.is_default ? (
            <span className="rounded-sm bg-slate-100 px-2 py-0.5 font-medium text-slate-700">Default</span>
          ) : (
            "—"
          ),
      },
    ];
    if (manage) {
      cols.push({
        key: "actions",
        label: "Actions",
        className: "text-right",
        cellClass: "text-right",
        render: (m) => (
          <div className="flex justify-end gap-2">
            {!m.is_default ? (
              <button
                type="button"
                disabled={setDefaultMutation.isPending}
                onClick={() => setDefaultMutation.mutate(m.id)}
                className="text-slate-700 underline disabled:opacity-50"
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
        ),
      });
    }
    return cols;
  }, [manage, setDefaultMutation.isPending, voidMutation.isPending]);

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-800">Payment Methods</h2>
        {manage ? (
          <button
            type="button"
            onClick={() => {
              setShowAdd((s) => !s);
              setError(null);
            }}
            className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#0f1729]"
          >
            {showAdd ? "Cancel" : "+ Create method"}
          </button>
        ) : null}
      </div>

      {showAdd && manage ? (
        <div className="mt-3 grid gap-2 border-t border-gray-100 pt-3 text-xs">
          <label className="grid gap-1">
            <span className="font-semibold text-gray-600">Method</span>
            <select
              className="h-10 rounded-sm border border-gray-300 px-2"
              value={form.method}
              onChange={(e) => setForm((p) => ({ ...p, method: e.target.value as DriverPaymentMethod["method"] }))}
            >
              <option value="ach">ACH direct deposit</option>
              <option value="check">Check</option>
            </select>
          </label>
          <label className="grid gap-1">
            <span className="font-semibold text-gray-600">Account holder</span>
            <input
              className="h-10 rounded-sm border border-gray-300 px-2"
              value={form.account_holder_name ?? ""}
              onChange={(e) => setForm((p) => ({ ...p, account_holder_name: e.target.value }))}
              placeholder="Name on account"
            />
          </label>
          {form.method === "ach" ? (
            <>
              <label className="grid gap-1">
                <span className="font-semibold text-gray-600">Bank token (from vault) *</span>
                <input
                  className="h-10 rounded-sm border border-gray-300 px-2"
                  value={form.account_token ?? ""}
                  onChange={(e) => setForm((p) => ({ ...p, account_token: e.target.value }))}
                  placeholder="tok_… (tokenized reference; no raw account #)"
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="grid gap-1">
                  <span className="font-semibold text-gray-600">Routing last 4</span>
                  <input
                    className="h-10 rounded-sm border border-gray-300 px-2"
                    value={form.routing_last4 ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, routing_last4: e.target.value }))}
                    placeholder="1234"
                    maxLength={4}
                  />
                </label>
                <label className="grid gap-1">
                  <span className="font-semibold text-gray-600">Account last 4</span>
                  <input
                    className="h-10 rounded-sm border border-gray-300 px-2"
                    value={form.account_last4 ?? ""}
                    onChange={(e) => setForm((p) => ({ ...p, account_last4: e.target.value }))}
                    placeholder="5678"
                    maxLength={4}
                  />
                </label>
              </div>
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
              className="rounded-sm border border-[#1f2a44] bg-[#1f2a44] px-3 py-1 font-semibold text-white hover:bg-[#0f1729] disabled:opacity-50"
            >
              Save method
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-3">
        {/* DRV-MONEY-F6106 — a failed GET was silently rendering as "No payment methods on file.",
            a false-empty state on a money-bearing surface (an Owner/Administrator could conclude
            a driver has no payment method on file and take action on that wrong assumption, while
            the "+ Create method" action stayed available with no indication the list was broken). */}
        {methodsQuery.isError ? (
          <ListErrorState
            title="Couldn't load payment methods"
            status={0}
            message={(methodsQuery.error as Error | null)?.message}
            onRetry={() => void methodsQuery.refetch()}
          />
        ) : (
          <ParityTable<DriverPaymentMethod>
            columns={columns}
            rows={methods}
            rowKey={(m) => m.id}
            loading={methodsQuery.isLoading}
            emptyText="No payment methods on file."
            storageKey="driver-payment-methods-card"
            exportFilename="driver-payment-methods"
            tableTestId="driver-payment-methods-card-table"
          />
        )}
      </div>
    </section>
  );
}
