import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { createRecurringBillTemplate, type RecurringBillFrequency, type RecurringBillLineItem } from "../../../api/accounting";
import { listVendors } from "../../../api/mdata";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useToast } from "../../../components/Toast";
import { MoneyInput } from "../../../components/forms/MoneyInput";

const FREQUENCIES: { value: RecurringBillFrequency; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nextMonth() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
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

  const vendorsQuery = useQuery({
    queryKey: ["mdata", "vendors", companyId],
    queryFn: () => listVendors({ operating_company_id: companyId }),
    enabled: !!companyId,
  });

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
      navigate("/accounting/bills?tab=recurring");
    },
    onError: (err) => pushToast(err instanceof Error ? err.message : "Create failed", "error"),
  });

  function addLineItem() {
    setLineItems((prev) => [...prev, { description: "", amount: 0 }]);
  }

  function removeLineItem(idx: number) {
    setLineItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateLineItem(idx: number, field: keyof RecurringBillLineItem, value: string | number | null) {
    setLineItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  }

  const vendors = vendorsQuery.data?.vendors ?? [];
  const isValid = vendorUuid && templateName && parseFloat(amount) > 0 && nextGenerationDate;

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-semibold text-gray-900">Create Recurring Bill Template</h1>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <div className="space-y-5">
          {/* Template name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Template Name *</label>
            <input
              type="text"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none"
              placeholder="e.g. Monthly Office Rent"
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
            />
          </div>

          {/* Vendor */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Vendor *</label>
            <select
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none"
              value={vendorUuid}
              onChange={(e) => setVendorUuid(e.target.value)}
            >
              <option value="">— Select vendor —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Amount *</label>
            {/* M-1: dollars-mode QBO money entry (its own $ prefix); backend amount = numeric(12,2) DOLLARS, byte-for-byte. */}
            <MoneyInput
              valueDollars={amount ? Number(amount) : null}
              onChangeDollars={(d) => setAmount(d == null ? "" : String(d))}
              ariaLabel="Amount"
              className="w-full"
            />
          </div>

          {/* Memo */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Memo</label>
            <input
              type="text"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none"
              placeholder="Optional memo on generated bill"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />
          </div>

          {/* Frequency + Schedule */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Frequency *</label>
              <select
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none"
                value={frequency}
                onChange={(e) => setFrequency(e.target.value as RecurringBillFrequency)}
              >
                {FREQUENCIES.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">First Generation Date *</label>
              <input
                type="date"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none"
                value={nextGenerationDate}
                min={today()}
                onChange={(e) => setNextGenerationDate(e.target.value)}
              />
            </div>
          </div>

          {/* End date */}
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">End Date (optional)</label>
            <input
              type="date"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-slate-300 focus:outline-none"
              value={endDate}
              min={nextGenerationDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          {/* Auto post */}
          <div className="flex items-center gap-2">
            <input
              id="auto-post"
              type="checkbox"
              className="h-4 w-4 rounded"
              checked={autoPost}
              onChange={(e) => setAutoPost(e.target.checked)}
            />
            <label htmlFor="auto-post" className="text-sm text-gray-700">
              Auto-post bill to ledger when generated
            </label>
          </div>

          {/* Line Items */}
          <div>
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
            {lineItems.length === 0 && (
              <p className="text-xs text-gray-400">No line items — the template amount will be used as a single line.</p>
            )}
            {lineItems.map((item, idx) => (
              <div key={idx} className="mb-2 flex items-center gap-2">
                <input
                  type="text"
                  className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-slate-300 focus:outline-none"
                  placeholder="Description"
                  value={item.description}
                  onChange={(e) => updateLineItem(idx, "description", e.target.value)}
                />
                <div className="w-28">
                  {/* M-1: dollars-mode QBO money entry (own $ prefix); line amount DOLLARS, byte-for-byte. */}
                  <MoneyInput
                    valueDollars={item.amount || null}
                    onChangeDollars={(d) => updateLineItem(idx, "amount", d ?? 0)}
                    ariaLabel="Line amount"
                    className="w-full"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeLineItem(idx)}
                  className="rounded p-1 text-gray-400 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button
          onClick={() => navigate(-1)}
          className="rounded border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          disabled={!isValid || createMutation.isPending}
          onClick={() => createMutation.mutate()}
          className="rounded bg-[#1F2A44] px-4 py-2 text-sm font-medium text-white hover:bg-[#1F2A44] disabled:opacity-50"
        >
          {createMutation.isPending ? "Creating…" : "Create Template"}
        </button>
      </div>
    </div>
  );
}
