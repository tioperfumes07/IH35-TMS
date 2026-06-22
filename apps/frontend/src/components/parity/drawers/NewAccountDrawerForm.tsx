/**
 * BK7 — New Account drawer form (two-column + cascade + lock flag).
 *
 * LEFT: Account name, Account number, Account type (grouped), Detail type
 *   (cascades from type), sub-account toggle → parent selector, description,
 *   "Use for billable expenses", Lock account flag.
 * RIGHT: Live BS/P&L tree preview showing where new account lands.
 *
 * GATE: Account create commit is FINANCIAL/GATED.
 *   The form is fully rendered and validated but the submit button shows
 *   "Awaiting approval — contact Jorge" when `accountCreateGated=true`.
 *   Change to `false` only after Jorge's explicit per-block OK.
 */
import { useState } from "react";
import { Lock } from "lucide-react";
import { createQboAccount } from "../../../api/qbo-mdata";
import { useToast } from "../../Toast";
import type { InlineCreateResult } from "../InlineCreateDrawer";

const ACCOUNT_CREATE_GATED = true; // FINANCIAL GATE — flip to false only on Jorge's explicit OK

type AccountTypeGroup = {
  group: string;
  types: { value: string; label: string }[];
};

const ACCOUNT_TYPE_GROUPS: AccountTypeGroup[] = [
  {
    group: "ASSET",
    types: [
      { value: "Bank", label: "Bank" },
      { value: "Accounts Receivable", label: "Accounts Receivable (A/R)" },
      { value: "Other Current Assets", label: "Other Current Assets" },
      { value: "Fixed Assets", label: "Fixed Assets" },
      { value: "Other Assets", label: "Other Assets" },
    ],
  },
  {
    group: "LIABILITY",
    types: [
      { value: "Credit Card", label: "Credit Card" },
      { value: "Accounts Payable", label: "Accounts Payable (A/P)" },
      { value: "Other Current Liabilities", label: "Other Current Liabilities" },
      { value: "Long Term Liabilities", label: "Long Term Liabilities" },
    ],
  },
  {
    group: "EQUITY",
    types: [{ value: "Equity", label: "Equity" }],
  },
  {
    group: "INCOME",
    types: [
      { value: "Income", label: "Income" },
      { value: "Other Income", label: "Other Income" },
    ],
  },
  {
    group: "EXPENSE",
    types: [
      { value: "Cost of Goods Sold", label: "Cost of Goods Sold" },
      { value: "Expenses", label: "Expenses" },
      { value: "Other Expense", label: "Other Expense" },
    ],
  },
];

const DETAIL_TYPES: Record<string, string[]> = {
  Bank: ["Checking", "Savings", "Money Market", "Other Bank Account"],
  "Accounts Receivable": ["Accounts Receivable"],
  "Other Current Assets": ["Allowance for Bad Debts", "Deferred Tax Assets", "Inventory", "Loans to Officers", "Other Current Assets", "Prepaid Expenses", "Retainage", "Undeposited Funds"],
  "Fixed Assets": ["Accumulated Depletion", "Accumulated Depreciation", "Buildings", "Furniture & Fixtures", "Intangible Assets", "Land", "Leasehold Improvements", "Machinery & Equipment", "Other Fixed Assets", "Vehicles"],
  "Other Assets": ["Goodwill", "Licenses", "Long-term Investments", "Long-term Notes Receivable", "Other Long-term Assets", "Security Deposits"],
  "Credit Card": ["Credit Card"],
  "Accounts Payable": ["Accounts Payable"],
  "Other Current Liabilities": ["Direct Deposit Payable", "Federal Income Tax Payable", "Health Insurance Payable", "Insurance Payable", "Line of Credit", "Loan Payable", "Other Taxes Payable", "Sales Tax Payable", "Unearned Revenue"],
  "Long Term Liabilities": ["Notes Payable", "Other Long Term Liabilities", "Shareholder Notes Payable"],
  Equity: ["Common Stock", "Dividends Paid", "Estimated Taxes", "Members Equity", "Opening Balance Equity", "Owner's Equity", "Paid-in Capital", "Partner Contributions", "Partner Distributions", "Preferred Stock", "Retained Earnings", "Treasury Stock"],
  Income: ["Discounts/Refunds Given", "Non-Profit Income", "Other Primary Income", "Sales of Product Income", "Service/Fee Income", "Unapplied Cash Payment Income"],
  "Other Income": ["Dividend Income", "Interest Earned", "Other Investment Income", "Other Miscellaneous Income", "Tax-Exempt Interest"],
  "Cost of Goods Sold": ["Equipment Rental in COGS", "Other Costs of Service-COS", "Shipping, Freight & Delivery-COS", "Supplies & Materials-COGS"],
  Expenses: ["Advertising/Promotional", "Auto", "Bad Debts", "Bank Charges", "Charitable Contributions", "Commissions & Fees", "Dues & Subscriptions", "Entertainment", "Equipment Rental", "Finance Costs", "Income Tax Expense", "Insurance", "Interest Paid", "Legal & Professional Fees", "Meals & Entertainment", "Office/General Administrative Expenses", "Other Business Expenses", "Other Miscellaneous Service Cost", "Payroll Expenses", "Printing", "Promotional Meals", "Rent or Lease", "Repair & Maintenance", "Shipping, Freight & Delivery", "Stationery & Printing", "Supplies", "Taxes Paid", "Travel", "Unapplied Cash Bill Payment Expense", "Utilities", "Vehicle"],
  "Other Expense": ["Depreciation", "Exchange Gain or Loss", "Other Miscellaneous Expense", "Penalties & Settlements"],
};

const BS_PL_SECTIONS: Record<string, string> = {
  Bank: "Balance Sheet → Assets → Current Assets",
  "Accounts Receivable": "Balance Sheet → Assets → Current Assets",
  "Other Current Assets": "Balance Sheet → Assets → Current Assets",
  "Fixed Assets": "Balance Sheet → Assets → Fixed Assets",
  "Other Assets": "Balance Sheet → Assets → Other Assets",
  "Credit Card": "Balance Sheet → Liabilities → Current Liabilities",
  "Accounts Payable": "Balance Sheet → Liabilities → Current Liabilities",
  "Other Current Liabilities": "Balance Sheet → Liabilities → Current Liabilities",
  "Long Term Liabilities": "Balance Sheet → Liabilities → Long-Term Liabilities",
  Equity: "Balance Sheet → Equity",
  Income: "Profit & Loss → Income",
  "Other Income": "Profit & Loss → Other Income",
  "Cost of Goods Sold": "Profit & Loss → Cost of Goods Sold",
  Expenses: "Profit & Loss → Expenses",
  "Other Expense": "Profit & Loss → Other Expenses",
};

type FormState = {
  name: string;
  accountNumber: string;
  accountType: string;
  detailType: string;
  isSubaccount: boolean;
  parentAccount: string;
  description: string;
  billableExpenses: boolean;
  lockAccount: boolean;
};

type Props = {
  operatingCompanyId: string;
  onCreated: (result: InlineCreateResult) => void;
  onClose: () => void;
};

export function NewAccountDrawerForm({ operatingCompanyId, onCreated, onClose }: Props) {
  const { pushToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>({
    name: "",
    accountNumber: "",
    accountType: "",
    detailType: "",
    isSubaccount: false,
    parentAccount: "",
    description: "",
    billableExpenses: false,
    lockAccount: false,
  });

  const detailOptions = form.accountType ? DETAIL_TYPES[form.accountType] ?? [] : [];
  const bsPlSection = form.accountType ? BS_PL_SECTIONS[form.accountType] : null;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
      ...(key === "accountType" ? { detailType: "" } : {}),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (ACCOUNT_CREATE_GATED) {
      pushToast("Account create is awaiting approval. Contact Jorge to enable.", "error");
      return;
    }
    if (!form.name.trim()) {
      pushToast("Account name is required.", "error");
      return;
    }
    if (!form.accountType) {
      pushToast("Account type is required.", "error");
      return;
    }
    setSaving(true);
    try {
      const res = await createQboAccount(operatingCompanyId, {
        name: form.name.trim(),
        account_type: form.accountType,
        account_sub_type: form.detailType || undefined,
        full_qualified_name: form.name.trim(),
      });
      onCreated({ id: String(res.account.id), label: form.name.trim() });
      pushToast("Account created", "success");
      onClose();
    } catch (err) {
      pushToast(String((err as Error).message ?? "Create failed"), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="h-full">
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        {/* LEFT COLUMN — fields */}
        <div className="flex flex-col gap-3">
          <label className="block">
            <span className="text-xs font-medium text-gray-700">Account name *</span>
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-none"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. BOA-CHECKING-1135"
              autoFocus
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Account number</span>
            <input
              className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-none"
              value={form.accountNumber}
              onChange={(e) => set("accountNumber", e.target.value)}
              placeholder="e.g. 1000"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Account type *</span>
            <select
              className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-none"
              value={form.accountType}
              onChange={(e) => set("accountType", e.target.value)}
            >
              <option value="">Select a type…</option>
              {ACCOUNT_TYPE_GROUPS.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.types.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          {detailOptions.length > 0 && (
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Detail type *</span>
              <select
                className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-none"
                value={form.detailType}
                onChange={(e) => set("detailType", e.target.value)}
              >
                <option value="">Select a detail type…</option>
                {detailOptions.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.isSubaccount}
              onChange={(e) => set("isSubaccount", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Make this a sub-account
          </label>

          {form.isSubaccount && (
            <label className="block">
              <span className="text-xs font-medium text-gray-700">Parent account *</span>
              <input
                className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-none"
                value={form.parentAccount}
                onChange={(e) => set("parentAccount", e.target.value)}
                placeholder="Parent account name"
              />
            </label>
          )}

          <label className="block">
            <span className="text-xs font-medium text-gray-700">Description</span>
            <textarea
              className="mt-1 w-full rounded border border-gray-300 px-2.5 py-1.5 text-sm focus:border-slate-300 focus:outline-none"
              rows={2}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.billableExpenses}
              onChange={(e) => set("billableExpenses", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Use for billable expenses
          </label>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <Lock className="h-3.5 w-3.5 text-gray-400" />
            <input
              type="checkbox"
              checked={form.lockAccount}
              onChange={(e) => set("lockAccount", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Lock account (restrict posting)
          </label>
        </div>

        {/* RIGHT COLUMN — live BS/P&L preview */}
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Where this account lands</p>
          <div className="min-h-[120px] rounded border border-dashed border-gray-200 bg-gray-50 p-3">
            {form.accountType ? (
              <div className="text-xs text-gray-700">
                <p className="font-medium text-gray-900">{form.accountType}</p>
                {form.detailType && (
                  <p className="mt-0.5 text-gray-500">Sub-type: {form.detailType}</p>
                )}
                {bsPlSection && (
                  <p className="mt-2 rounded bg-slate-100 px-2 py-1.5 text-slate-700">
                    {bsPlSection}
                  </p>
                )}
                {form.name.trim() && (
                  <p className="mt-2 font-medium text-gray-900">
                    → {form.name.trim()}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-xs text-gray-400">Select an account type to preview placement</p>
            )}
          </div>
          {ACCOUNT_CREATE_GATED && (
            <div className="mt-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <span className="font-semibold">Account creation gated.</span> The form is ready but the submit is disabled pending financial-cluster approval. Contact Jorge to enable.
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 flex justify-end gap-2 border-t border-gray-100 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || ACCOUNT_CREATE_GATED}
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 hover:bg-emerald-700"
          title={ACCOUNT_CREATE_GATED ? "Account create awaiting financial approval" : undefined}
        >
          {saving ? "Saving…" : ACCOUNT_CREATE_GATED ? "Awaiting approval" : "Save"}
        </button>
      </div>
    </form>
  );
}
