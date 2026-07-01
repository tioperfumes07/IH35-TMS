/**
 * ITEM1 / AF-2c — Products & Services editor with REAL referential links (QBO / NetSuite parity).
 *
 * QBO and NetSuite both model an item's income/expense accounts and its Category as REFERENCED
 * records, never freeform text. This editor writes the real FK columns on catalogs.items:
 *   default_income_account_id · default_expense_account_id · default_class_id · category_id
 *   plus item_type · unit_price_cents · taxable · description (the backend maps these metadata keys
 *   straight to columns; keys it doesn't recognise are dropped — so we send ONLY the real ones).
 *
 * Pickers:
 *   Income account  → Combobox over getCoaAccounts filtered to Income / Other Income
 *                     (carrier default: "Sales of Service Income").
 *   Expense account → Combobox filtered to Expense / Cost of Goods Sold / Other Expense.
 *   Category        → Combobox over the per-entity qbo_categories catalog with a REPEATABLE inline
 *                     "+ New category" (creates via the categories catalog, refetches, re-selects).
 *   Class           → Combobox over the per-entity classes catalog (optional).
 *
 * NON-FINANCIAL gate: catalog data, no posting. Same-entity + account-type are enforced server-side.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import type { AccountingCatalogCreateBody, AccountingCatalogRow, AccountingCatalogUpdateBody } from "../../../api/catalogs-accounting";
import { classesCatalogClient, qboCategoriesCatalogClient } from "../../../api/catalogs-accounting";
import { getCoaAccounts } from "../../../api/banking";
import type { AccountingCatalogClient } from "./AccountingCatalogModal";
import { Button } from "../../../components/Button";
import { Combobox, type ComboboxOption } from "../../../components/Combobox";
import { Modal } from "../../../components/Modal";
import { MoneyInput } from "../../../components/forms/MoneyInput";

const ITEM_TYPES = [
  { value: "Service", label: "Service" },
  { value: "NonInventory", label: "Non-inventory" },
  { value: "Inventory", label: "Inventory" },
  { value: "Bundle", label: "Bundle" },
];

const INCOME_TYPES = ["Income", "OtherIncome"];
const EXPENSE_TYPES = ["Expense", "CostOfGoodsSold", "OtherExpense"];
const CARRIER_DEFAULT_INCOME_NAME = "Sales of Service Income";

type Props = {
  open: boolean;
  mode: "create" | "edit";
  row: AccountingCatalogRow | null;
  operatingCompanyId: string;
  client: AccountingCatalogClient;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  code: string;
  displayName: string;
  itemType: string;
  isActive: boolean;
  taxable: boolean;
  sellEnabled: boolean;
  description: string;
  priceDollars: string;
  incomeAccountId: string | null;
  buyEnabled: boolean;
  expenseAccountId: string | null;
  categoryId: string | null;
  classId: string | null;
};

function rowToForm(row: AccountingCatalogRow | null): FormState {
  const m = row?.metadata ?? {};
  const asId = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
  return {
    code: row?.code ?? "",
    displayName: row?.display_name ?? "",
    itemType: String(m.item_type ?? "Service"),
    isActive: row?.is_active ?? true,
    taxable: Boolean(m.taxable),
    sellEnabled: asId(m.default_income_account_id) != null || row == null,
    description: row?.description ?? "",
    priceDollars: m.unit_price_cents != null ? String(Number(m.unit_price_cents) / 100) : "",
    incomeAccountId: asId(m.default_income_account_id),
    buyEnabled: asId(m.default_expense_account_id) != null,
    expenseAccountId: asId(m.default_expense_account_id),
    categoryId: asId(m.category_id),
    classId: asId(m.default_class_id),
  };
}

export function ItemEditorModal({ open, mode, row, operatingCompanyId, client, onClose, onSaved }: Props) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(rowToForm(null));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [saving, setSaving] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["catalogs", "accounts", "for-items", operatingCompanyId],
    queryFn: () => getCoaAccounts(operatingCompanyId),
    enabled: open && !!operatingCompanyId,
  });
  const categoriesQuery = useQuery({
    queryKey: ["catalogs", "accounting", "qbo-categories", operatingCompanyId],
    queryFn: () => qboCategoriesCatalogClient.list({ operating_company_id: operatingCompanyId, is_active: "true", limit: 200 }),
    enabled: open && !!operatingCompanyId,
  });
  const classesQuery = useQuery({
    queryKey: ["catalogs", "accounting", "classes", operatingCompanyId],
    queryFn: () => classesCatalogClient.list({ operating_company_id: operatingCompanyId, is_active: "true", limit: 200 }),
    enabled: open && !!operatingCompanyId,
  });

  const accounts = accountsQuery.data?.accounts ?? [];
  const incomeOptions: ComboboxOption[] = useMemo(
    () =>
      accounts
        .filter((a) => a.account_type && INCOME_TYPES.includes(a.account_type))
        .map((a) => ({ value: a.id, label: a.account_name, sublabel: a.account_number })),
    [accounts]
  );
  const expenseOptions: ComboboxOption[] = useMemo(
    () =>
      accounts
        .filter((a) => a.account_type && EXPENSE_TYPES.includes(a.account_type))
        .map((a) => ({ value: a.id, label: a.account_name, sublabel: a.account_number })),
    [accounts]
  );
  const categoryOptions: ComboboxOption[] = useMemo(
    () => (categoriesQuery.data?.rows ?? []).map((c) => ({ value: c.id, label: c.display_name })),
    [categoriesQuery.data]
  );
  const classOptions: ComboboxOption[] = useMemo(
    () => (classesQuery.data?.rows ?? []).map((c) => ({ value: c.id, label: c.display_name })),
    [classesQuery.data]
  );

  useEffect(() => {
    if (!open) return;
    setForm(rowToForm(row));
    setErrors({});
    setSubmitError("");
  }, [open, row]);

  // Carrier default: on a NEW sellable item with nothing chosen, preselect "Sales of Service Income".
  useEffect(() => {
    if (!open || mode !== "create") return;
    if (form.incomeAccountId || !form.sellEnabled) return;
    const dflt = accounts.find((a) => a.account_name === CARRIER_DEFAULT_INCOME_NAME && a.account_type && INCOME_TYPES.includes(a.account_type));
    if (dflt) setForm((prev) => (prev.incomeAccountId ? prev : { ...prev, incomeAccountId: dflt.id }));
  }, [open, mode, accounts, form.incomeAccountId, form.sellEnabled]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleAddCategory(name: string) {
    const trimmed = name.trim();
    if (!trimmed || creatingCategory) return;
    setCreatingCategory(true);
    setSubmitError("");
    try {
      // Repeatable inline create against the per-entity qbo_categories catalog (QBO "keep creating").
      const created = await qboCategoriesCatalogClient.create(operatingCompanyId, {
        code: trimmed.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 60) || "CAT",
        display_name: trimmed,
      });
      await queryClient.invalidateQueries({ queryKey: ["catalogs", "accounting", "qbo-categories", operatingCompanyId] });
      set("categoryId", created.id);
    } catch (err) {
      setSubmitError(err instanceof ApiError ? String((err.data as Record<string, unknown>)?.error ?? err.message) : "Failed to create category.");
    } finally {
      setCreatingCategory(false);
    }
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (!form.code.trim()) next.code = "Code is required.";
    if (!form.displayName.trim()) next.displayName = "Name is required.";
    if (form.sellEnabled && !form.incomeAccountId) next.incomeAccountId = "Income account is required.";
    if (form.buyEnabled && !form.expenseAccountId) next.expenseAccountId = "Expense account is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function handleSubmit() {
    if (!validate()) return;
    setSaving(true);
    setSubmitError("");
    // ONLY real-column keys — the backend maps these to columns; anything else is dropped.
    const metadata: Record<string, unknown> = {
      item_type: form.itemType,
      unit_price_cents: form.priceDollars ? Math.round(parseFloat(form.priceDollars) * 100) : null,
      taxable: form.taxable,
      default_income_account_id: form.sellEnabled ? form.incomeAccountId : null,
      default_expense_account_id: form.buyEnabled ? form.expenseAccountId : null,
      default_class_id: form.classId,
      category_id: form.categoryId,
    };
    const body: AccountingCatalogCreateBody & AccountingCatalogUpdateBody = {
      code: form.code.trim(),
      display_name: form.displayName.trim(),
      description: form.description.trim() || undefined,
      is_active: form.isActive,
      metadata,
    };
    try {
      if (mode === "create") await client.create(operatingCompanyId, body);
      else if (row) await client.update(row.id, operatingCompanyId, body);
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const data = (err.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? err.message));
      } else {
        setSubmitError("Failed to save item.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate() {
    if (!row) return;
    setSaving(true);
    try {
      await client.deactivate(row.id, operatingCompanyId);
      onSaved();
      onClose();
    } catch (err) {
      if (err instanceof ApiError) {
        const data = (err.data as Record<string, unknown>) ?? {};
        setSubmitError(String(data.error ?? data.message ?? err.message));
      } else {
        setSubmitError("Failed to deactivate item.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={mode === "create" ? "New product/service" : `Edit: ${row?.display_name ?? ""}`}
      sizePreset="lg"
    >
      <div className="flex max-h-[80vh] flex-col gap-3 overflow-y-auto text-sm">
        {/* Basic fields */}
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Name *</span>
            <input
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
              value={form.displayName}
              onChange={(e) => set("displayName", e.target.value)}
              autoFocus
            />
            {errors.displayName ? <p className="mt-1 text-[11px] text-red-700">{errors.displayName}</p> : null}
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">SKU / Code *</span>
            <input
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
              value={form.code}
              onChange={(e) => set("code", e.target.value.toUpperCase())}
            />
            {errors.code ? <p className="mt-1 text-[11px] text-red-700">{errors.code}</p> : null}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Item type</span>
            <select
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
              value={form.itemType}
              onChange={(e) => set("itemType", e.target.value)}
            >
              {ITEM_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </label>
          {/* Category — QBO places this right under Name. Repeatable inline "+ New category". */}
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Category</span>
            <div className="mt-1">
              <Combobox
                options={categoryOptions}
                value={form.categoryId}
                onChange={(v) => set("categoryId", v)}
                placeholder={creatingCategory ? "Creating…" : "Uncategorized"}
                loading={categoriesQuery.isLoading || creatingCategory}
                allowClear
                allowAddNew={{ label: "+ New category", onAdd: (query) => void handleAddCategory(query) }}
              />
            </div>
          </label>
        </div>

        {/* SELL SIDE */}
        <div className="rounded border border-gray-200 p-3">
          <label className="flex items-center gap-2 font-medium text-gray-700">
            <input
              type="checkbox"
              checked={form.sellEnabled}
              onChange={(e) => set("sellEnabled", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            I sell this product/service to my customers
          </label>
          {form.sellEnabled && (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-xs font-semibold text-gray-600">Description</span>
                <textarea
                  className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
                  rows={2}
                  value={form.description}
                  onChange={(e) => set("description", e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">Sales price / rate ($)</span>
                <MoneyInput
                  valueDollars={form.priceDollars ? Number(form.priceDollars) : null}
                  onChangeDollars={(d) => set("priceDollars", d == null ? "" : String(d))}
                  ariaLabel="Sales price"
                  className="mt-1 w-full"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-600">
                  Income account *{" "}
                  <span className="font-normal text-gray-400">(carrier default: Service income)</span>
                </span>
                <div className="mt-1">
                  <Combobox
                    options={incomeOptions}
                    value={form.incomeAccountId}
                    onChange={(v) => set("incomeAccountId", v)}
                    placeholder="Select income account"
                    loading={accountsQuery.isLoading}
                    allowClear
                  />
                </div>
                {errors.incomeAccountId ? <p className="mt-1 text-[11px] text-red-700">{errors.incomeAccountId}</p> : null}
              </label>
            </div>
          )}
        </div>

        {/* BUY SIDE */}
        <div className="rounded border border-gray-200 p-3">
          <label className="flex items-center gap-2 font-medium text-gray-700">
            <input
              type="checkbox"
              checked={form.buyEnabled}
              onChange={(e) => set("buyEnabled", e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            I purchase this product/service from a vendor
          </label>
          {form.buyEnabled && (
            <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-xs font-semibold text-gray-600">Expense account *</span>
                <div className="mt-1">
                  <Combobox
                    options={expenseOptions}
                    value={form.expenseAccountId}
                    onChange={(v) => set("expenseAccountId", v)}
                    placeholder="Select expense account"
                    loading={accountsQuery.isLoading}
                    allowClear
                  />
                </div>
                {errors.expenseAccountId ? <p className="mt-1 text-[11px] text-red-700">{errors.expenseAccountId}</p> : null}
              </label>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-xs font-semibold text-gray-600">Class</span>
            <div className="mt-1">
              <Combobox
                options={classOptions}
                value={form.classId}
                onChange={(v) => set("classId", v)}
                placeholder="No class"
                loading={classesQuery.isLoading}
                allowClear
              />
            </div>
          </label>
          <div className="flex flex-col justify-end gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={form.taxable}
                onChange={(e) => set("taxable", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Taxable
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => set("isActive", e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
              />
              Active
            </label>
          </div>
        </div>

        {submitError ? (
          <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">{submitError}</div>
        ) : null}

        <div className="flex items-center justify-between">
          <div>
            {mode === "edit" ? (
              <Button type="button" variant="secondary" disabled={saving} onClick={() => void handleDeactivate()}>
                Deactivate
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Close</Button>
            <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>
              {mode === "create" ? "+ Create" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
