import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, Link } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { createRecurringBillTemplate, type RecurringBillFrequency, type RecurringBillLineItem } from "../../../api/accounting";
import { listCatalogAccounts } from "../../../api/catalog-accounts";
import { listVendors } from "../../../api/mdata";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useToast } from "../../../components/Toast";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { ReferenceSelect, type ReferenceOption } from "../../../components/parity/ReferenceSelect";
import { coaAccountReferenceOption, vendorReferenceOption } from "../../../components/parity/referenceOptionLabels";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { companyToday } from "../../../lib/businessDate";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { CappedListNotice } from "../../../components/CappedListNotice";

const FREQUENCIES: { value: RecurringBillFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

function today() {
  return companyToday();
}

function nextMonth() {
  // Same calendar day next month in company-local business date (not UTC / browser-local).
  const [y, m, d] = companyToday().split("-").map(Number);
  const next = new Date(Date.UTC(y, m, d)); // month index m = next month (1-based m → 0-based m)
  const yy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(next.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function RecurringBillCreate() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [vendorUuid, setVendorUuid] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [frequency, setFrequency] = useState<RecurringBillFrequency>("monthly");
  const [nextGenerationDate, setNextGenerationDate] = useState(nextMonth());
  const [endDate, setEndDate] = useState("");
  const [autoPost, setAutoPost] = useState(false);
  const [lineItems, setLineItems] = useState<RecurringBillLineItem[]>([]);
  const [extraCoaOptions, setExtraCoaOptions] = useState<ReferenceOption[]>([]);

  const vendorsQuery = useQuery({
    queryKey: ["mdata", "vendors", companyId],
    queryFn: () => listVendors({ operating_company_id: companyId, limit: 1000 }),
    enabled: !!companyId,
  });

  const coaQuery = useQuery({
    queryKey: ["recurring-bill", "coa", companyId],
    // listCatalogAccounts (not getCoaAccounts): is_postable is required so header/parent
    // Liability rows cannot be chosen as bill-line expense accounts.
    queryFn: () =>
      listCatalogAccounts({ status: "active", operating_company_id: companyId, postable_only: true }),
    enabled: !!companyId,
  });

  const expenseCoaOptions = useMemo(() => {
    const base = (coaQuery.data?.accounts ?? [])
      .filter((acct) => {
        if (!acct.is_postable) return false;
        if (acct.deactivated_at) return false;
        const type = String(acct.account_type ?? "");
        return type === "Expense" || type === "CostOfGoodsSold" || type === "OtherExpense";
      })
      .map(coaAccountReferenceOption);
    const ids = new Set(base.map((o) => o.value));
    return [...base, ...extraCoaOptions.filter((o) => !ids.has(o.value))];
  }, [coaQuery.data?.accounts, extraCoaOptions]);

  const createMutation = useMutation({
    mutationFn: () =>
      createRecurringBillTemplate(
        companyId,
        {
          vendor_uuid: vendorUuid,
          template_name: templateName,
          amount: parseFloat(amount),
          memo: memo || null,
          frequency,
          next_generation_date: nextGenerationDate,
          end_date: endDate || null,
          auto_post: autoPost,
          line_items: lineItems,
        },
        `create-rbt-${companyId}-${Date.now()}`
      ),
    onSuccess: () => {
      pushToast("Recurring bill template created", "success");
      void queryClient.invalidateQueries({ queryKey: ["accounting", "recurring-bills"] });
      navigate("/accounting/bills/recurring");
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Create failed", "error"),
  });

  function addLineItem() {
    setLineItems((prev) => [...prev, { description: "", amount: 0, coa_account_id: null }]);
  }

  function removeLineItem(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLineItem(idx: number, field: keyof RecurringBillLineItem, value: string | number | null) {
    setLineItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  const vendors = vendorsQuery.data?.vendors ?? [];
  const linesValid =
    lineItems.length === 0 ||
    lineItems.every((row) => row.description.trim().length > 0 && Number(row.amount) > 0 && Boolean(row.coa_account_id));
  const isValid = vendorUuid && templateName && parseFloat(amount) > 0 && nextGenerationDate && linesValid;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6" data-testid="recurring-bill-create">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <Link to="/accounting" className="hover:underline">
          Accounting
        </Link>
        <span>/</span>
        <Link to="/accounting/bills" className="hover:underline">
          Bills
        </Link>
        <span>/</span>
        <Link to="/accounting/bills/recurring" className="hover:underline">
          Recurring Bills
        </Link>
        <span>/</span>
        <span className="text-gray-700">Create</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-sm p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Back"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Create Recurring Bill Template</h1>
      </div>

      {/* Flat QBO-style form — no nested bordered card (box-in-box). Vendor left, template name flush right. */}
      <div className="space-y-5">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-[16rem] flex-1">
            <label className="mb-1 block text-sm font-medium text-gray-700">Vendor *</label>
            {vendorsQuery.isError ? (
              <div className="mb-2">
                <ListErrorBanner
                  message={`Failed to load recurring-bill vendors: ${(vendorsQuery.error as Error)?.message ?? "Request failed"}`}
                  onRetry={() => void vendorsQuery.refetch()}
                />
              </div>
            ) : null}
            <ReferenceSelect
              value={vendorUuid || null}
              onChange={(next) => setVendorUuid(next ?? "")}
              options={vendors.map(vendorReferenceOption)}
              createKind="vendor"
              operatingCompanyId={companyId}
              placeholder="Select vendor..."
              disabled={!companyId}
            />
            <CappedListNotice
              shown={vendors.length}
              limit={1000}
              total={vendorsQuery.data?.total ?? null}
              hint="Type in the vendor field to search the full roster."
              className="mt-1 text-[11px] text-slate-600"
            />
          </div>
          <div className="ml-auto w-56 shrink-0 text-right">
            <label className="mb-1 block text-sm font-medium text-gray-700">Template name *</label>
            <input
              type="text"
              aria-label="Template name"
              className="w-full rounded-sm border border-gray-300 px-3 py-2 text-right text-sm focus:border-slate-300 focus:outline-hidden"
              placeholder="e.g. Monthly Office Rent"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Amount *</label>
          <MoneyInput
            valueDollars={amount ? Number(amount) : null}
            onChangeDollars={(d) => setAmount(d == null ? "" : String(d))}
            ariaLabel="Amount"
            className="w-full"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">Memo</label>
          <input
            type="text"
            className="w-full rounded-sm border border-gray-300 px-3 py-2 text-sm focus:border-slate-300 focus:outline-hidden"
            placeholder="Optional memo on generated bill"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Frequency *</label>
            <SelectCombobox
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as RecurringBillFrequency)}
              className="h-9 w-full rounded-sm border border-gray-300 px-2 text-[13px]"
            >
              {FREQUENCIES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </SelectCombobox>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">First Generation Date *</label>
            <DatePicker
              className="w-full"
              value={nextGenerationDate}
              min={today()}
              onChange={setNextGenerationDate}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">End Date (optional)</label>
          <DatePicker
            className="w-full"
            value={endDate}
            min={nextGenerationDate}
            onChange={setEndDate}
          />
        </div>

        <div className="flex items-center gap-2">
          <input
            id="auto-post"
            type="checkbox"
            className="h-4 w-4 rounded-sm"
            checked={autoPost}
            onChange={(e) => setAutoPost(e.target.checked)}
          />
          <label htmlFor="auto-post" className="text-sm text-gray-700">
            Auto-post bill to ledger when generated
          </label>
        </div>

        <div data-testid="recurring-bill-line-items">
          <div className="mb-2 flex items-center justify-between">
            <label className="text-sm font-medium text-gray-700">Line Items</label>
            <button
              type="button"
              onClick={addLineItem}
              className="flex items-center gap-1 text-xs font-medium text-slate-700 hover:underline"
            >
              <Plus className="h-3 w-3" />
              Add line
            </button>
          </div>
          {coaQuery.isError ? (
            <div className="mb-2">
              <ListErrorBanner
                message={`Failed to load chart of accounts: ${(coaQuery.error as Error)?.message ?? "Request failed"}`}
                onRetry={() => void coaQuery.refetch()}
              />
            </div>
          ) : null}
          {lineItems.length === 0 && (
            <p className="text-xs text-gray-500">
              No line items — generation uses the template amount as a single bill header (add lines with Category
              account for QBO-depth posting).
            </p>
          )}
          {lineItems.map((item, idx) => (
            <div key={idx} className="mb-3 grid gap-2 md:grid-cols-[1fr_minmax(10rem,14rem)_7rem_auto]">
              <input
                type="text"
                className="rounded-sm border border-gray-300 px-2 py-1.5 text-sm focus:border-slate-300 focus:outline-hidden"
                placeholder="Description"
                value={item.description}
                onChange={(e) => updateLineItem(idx, "description", e.target.value)}
              />
              <ReferenceSelect
                value={item.coa_account_id ?? null}
                onChange={(next) => updateLineItem(idx, "coa_account_id", next)}
                options={expenseCoaOptions}
                createKind="account"
                addNewLabel="+ Add new account"
                operatingCompanyId={companyId}
                placeholder="Category / account"
                disabled={!companyId || coaQuery.isLoading}
                onOptionCreated={(opt) => {
                  setExtraCoaOptions((prev) => [...prev, opt]);
                  updateLineItem(idx, "coa_account_id", opt.value);
                  void coaQuery.refetch();
                }}
              />
              <MoneyInput
                valueDollars={item.amount || null}
                onChangeDollars={(d) => updateLineItem(idx, "amount", d ?? 0)}
                ariaLabel="Line amount"
                className="w-full"
              />
              <button
                type="button"
                onClick={() => removeLineItem(idx)}
                className="rounded-sm p-1 text-gray-400 hover:text-red-500"
                aria-label="Remove line"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="rounded-sm border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={!isValid || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          className="rounded-sm bg-[#1F2A44] px-4 py-2 text-sm font-medium text-white hover:bg-[#1F2A44] disabled:opacity-50"
        >
          {createMutation.isPending ? "Creating…" : "Create Template"}
        </button>
      </div>
    </div>
  );
}
