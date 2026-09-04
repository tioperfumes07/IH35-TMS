import { useMemo, useState, type JSX } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { UseFormGetValues, UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { searchCustomersAutocomplete } from "../../../api/mdata";
import { CappedListNotice } from "../../../components/CappedListNotice";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";

export type BookLoadFormValues = {
  customer_id: string;
  /** QuickBooks mirror list id (display); TMS FK is `customer_id`. */
  customer_qbo_id: string;
  /** Cached label from selected QBO row. */
  customer_name: string;
  customer_wo_number: string;
  customer_po_number: string;
  commodity: string;
  weight_lbs: number;
  hazmat: boolean;
  driver_instructions_text: string;
  notes: string;
  linehaul_cents: number;
  fuel_surcharge_cents: number;
  accessorial_cents: number;
};

type Props = {
  register: UseFormRegister<BookLoadFormValues>;
  watch: UseFormWatch<BookLoadFormValues>;
  operatingCompanyId?: string;
  setValue?: UseFormSetValue<BookLoadFormValues>;
  getValues?: UseFormGetValues<BookLoadFormValues>;
  customerIdError?: string;
  showOptionalFields?: boolean;
};

export function BookLoadCustomerSection({
  register,
  watch,
  operatingCompanyId,
  setValue,
  getValues,
  customerIdError,
  showOptionalFields = true,
}: Props) {
  const queryClient = useQueryClient();
  // GO-21 A2: was a plain paginated listCustomers(limit: 200/500) — against ~2.7k prod customers
  // that is a slice, not a search, and the customer the owner wants is frequently simply absent.
  // Now hits the server's dedicated ranked autocomplete mode (exact match, then prefix match, then
  // full-text relevance, across the WHOLE company customer set — see api/mdata.ts
  // searchCustomersAutocomplete). Server-clamped (customer-autocomplete.shared.ts) to 2000 rows per
  // request regardless of what's asked (raised 100 -> 300 -> 2000, A2 TURBO 2026-09-02). NOTE: this
  // component is currently an orphan, never rendered by the live Book Load flow (see
  // BookLoadModalV4.tsx, which has the real fix) — kept in sync anyway so it doesn't silently
  // regress if it's ever wired back in.
  const AUTOCOMPLETE_LIMIT = 2000;
  const [customerSearch, setCustomerSearch] = useState("");
  const dollarsToCents = (value: unknown) => {
    if (value === null || value === undefined || value === "") return 0;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.round(numeric * 100);
  };

  const customersQuery = useQuery({
    queryKey: ["book-load-customer-section", "customers-autocomplete", operatingCompanyId, customerSearch],
    queryFn: () => searchCustomersAutocomplete(String(operatingCompanyId), customerSearch, { limit: AUTOCOMPLETE_LIMIT }),
    enabled: Boolean(operatingCompanyId),
    staleTime: 30_000,
  });
  const watchedCustomerId = watch("customer_id");
  const watchedCustomerName = watch("customer_name");
  // ACCT-F10158 companion: seed the committed customer when the capped/search page omits it
  // (same FE-COMBOBOX-STALE-LABEL class as BookLoadModalV4 Edit hydrate).
  const customerOptions = useMemo(() => {
    // C1 (owner correction 2026-09-02): kept in sync with the live picker's identical fix
    // (BookLoadModalV4.tsx, PR #19812) -- both fallbacks used to fall to the raw uuid whenever a
    // name came back empty/blank.
    const fromApi = (customersQuery.data ?? []).map((c) => ({ value: c.id, label: entityLabel(c.display_name, c.id, "Customer") }));
    const id = String(watchedCustomerId || "").trim();
    const name = String(watchedCustomerName || "").trim();
    if (id && !fromApi.some((o) => o.value === id)) {
      return [{ value: id, label: entityLabel(name, id, "Customer") }, ...fromApi];
    }
    return fromApi;
  }, [customersQuery.data, watchedCustomerId, watchedCustomerName]);

  return (
    <section className="rounded-sm border border-slate-200 bg-slate-100 p-3">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-700">A. Customer · Invoice · Charges</h3>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <input type="hidden" {...register("customer_id", { required: "Select a customer from QuickBooks search results" })} />
          <label className="text-[11px] font-semibold text-gray-600">Customer *</label>
          {operatingCompanyId && setValue ? (
            <ReferenceSelect
              value={watch("customer_id") || null}
              onChange={(next) => {
                const match = customerOptions.find((o) => o.value === next);
                setValue("customer_id", next ?? "", { shouldDirty: true, shouldValidate: true });
                setValue("customer_name", match?.label ?? "", { shouldDirty: true, shouldValidate: false });
              }}
              options={customerOptions}
              createKind="customer"
              operatingCompanyId={operatingCompanyId}
              placeholder="Search customers…"
              onSearch={setCustomerSearch}
              loading={customersQuery.isLoading}
              disabled={customersQuery.isLoading || customersQuery.isError}
              onOptionCreated={(opt) => {
                void queryClient.invalidateQueries({ queryKey: ["book-load-customer-section", "customers"] });
                setValue("customer_id", opt.value, { shouldDirty: true, shouldValidate: true });
                setValue("customer_name", opt.label, { shouldDirty: true, shouldValidate: false });
              }}
            />
          ) : (
            <div className="rounded-sm border border-slate-200 bg-white px-2 py-2 text-xs text-slate-700">Company context required for customer lookup.</div>
          )}
          {customersQuery.isError ? (
            <ListErrorBanner message="Could not load customers." onRetry={() => void customersQuery.refetch()} />
          ) : null}
          {/* GO-21 A2: an empty or short result must say why — never a silent short list. Distinct
              from the loading/error states above and the truncation notice below. */}
          {!customersQuery.isError && !customersQuery.isLoading && customerSearch.trim() && (customersQuery.data ?? []).length === 0 ? (
            <p className="text-[11px] text-slate-600" data-testid="book-load-customer-no-matches">
              No customers match “{customerSearch.trim()}”. Check the spelling, or{" "}
              <span className="font-semibold">+ Add new</span> if this is a new customer.
            </p>
          ) : null}
          {/* CLS-SILENT-CAP: the ranked autocomplete search is server-clamped to 100 rows per
              request. Surface truncation so a customer past that cap is not silently missing —
              typing narrows the match set below the cap for any reasonably distinct name. */}
          <CappedListNotice
            shown={customersQuery.data?.length ?? 0}
            limit={AUTOCOMPLETE_LIMIT}
            hint="Keep typing to narrow — this search covers every customer, not just what's shown."
            className="text-[11px] text-slate-600"
          />
          {customerIdError ? <p className="text-[11px] text-red-600">{customerIdError}</p> : null}
          {/* Exact Leaves book_load:customer — ReferenceSelect alone left selected UUID non-navigable */}
          {watch("customer_id") ? (
            <div
              className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600"
              data-testid="book-load-customer-selected-entitylinks"
            >
              <span data-testid="book-load-customer-link">
                Customer:{" "}
                <EntityLink
                  kind="customer"
                  id={watch("customer_id")}
                  label={entityLabel(watch("customer_name") || null, watch("customer_id"), "Customer")}
                />
              </span>
            </div>
          ) : null}
        </div>
        <Field label="Customer WO# / PU#" input={<input {...register("customer_wo_number")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" />} />
        <Field label="Customer PO#" input={<input {...register("customer_po_number")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" />} />
        {operatingCompanyId && setValue && getValues ? (
          <div className="md:col-span-2">
            <label className="text-[11px] font-semibold text-gray-600">Customer reference lookup (appends to Special notes)</label>
            <div className="mt-1">
              <ReferenceSelect
                value={null}
                onChange={(next) => {
                  if (!next) return;
                  const match = customerOptions.find((o) => o.value === next);
                  const prev = String(getValues("notes") ?? "");
                  const line = `Customer reference: ${match?.label ?? "Unknown"}`;
                  setValue("notes", prev ? `${prev}\n${line}` : line, { shouldDirty: true });
                }}
                options={customerOptions}
                createKind="customer"
                operatingCompanyId={operatingCompanyId}
                placeholder="Search customers to add a reference…"
                onSearch={setCustomerSearch}
                loading={customersQuery.isLoading}
                onOptionCreated={(opt) => {
                  void queryClient.invalidateQueries({ queryKey: ["book-load-customer-section", "customers"] });
                  const prev = String(getValues("notes") ?? "");
                  const line = `Customer reference: ${opt.label}`;
                  setValue("notes", prev ? `${prev}\n${line}` : line, { shouldDirty: true });
                }}
              />
            </div>
          </div>
        ) : null}
        <Field label="Commodity" input={<input {...register("commodity")} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" />} />
        <Field label="Weight (lbs)" input={<input type="number" {...register("weight_lbs", { valueAsNumber: true })} className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs" />} />
        <label className="flex items-center gap-2 text-[11px] font-semibold text-gray-700">
          <input type="checkbox" {...register("hazmat")} />
          Hazmat
        </label>
        <Field
          label="Rate ($)"
          input={
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register("linehaul_cents", { setValueAs: dollarsToCents })}
              className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            />
          }
        />
        <Field
          label="Fuel surcharge ($)"
          input={
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register("fuel_surcharge_cents", { setValueAs: dollarsToCents })}
              className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            />
          }
        />
        <Field
          label="Accessorial ($)"
          input={
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              {...register("accessorial_cents", { setValueAs: dollarsToCents })}
              className="h-8 w-full rounded-sm border border-gray-300 px-2 text-xs"
            />
          }
        />
      </div>
      {showOptionalFields ? (
        <>
          <div className="mt-2">
            <label className="text-[11px] font-semibold text-gray-600">Special notes</label>
            <textarea {...register("notes")} rows={2} className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs" />
          </div>
          <div className="mt-2">
            <label className="text-[11px] font-semibold text-gray-600">
              Driver instructions
              <span className="ml-2 rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-700">VISIBLE TO DRIVER</span>
            </label>
            <textarea {...register("driver_instructions_text")} rows={3} className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs" />
          </div>
        </>
      ) : null}
    </section>
  );
}

function Field({ label, input }: { label: string; input: JSX.Element }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-semibold text-gray-600">{label}</label>
      {input}
    </div>
  );
}
