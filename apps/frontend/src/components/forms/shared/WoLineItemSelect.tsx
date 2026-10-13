/**
 * ACCT-F4431382 — the work-order line ITEM picker (catalogs.items, same entity).
 *
 * The WO -> A/P bill copy (two-section-service.copyToAccountingLines) takes each bill line's account from the
 * work-order line's ITEM (443.67 G3: line account = item account) and refuses a line with no item by name
 * (wo_line_item_required). So every billable WO line carries an item:
 *
 *  - WoCategoryLineItemSelect — a Section A CATEGORY line stays a category line for the operator, and names its
 *    item the DEGH-03 way (443.113, same rule as a check category line and resolveCheckCategoryItem): only the
 *    items whose default expense account IS the line's category account are offered. Exactly one such item =
 *    the deterministic mapping, picked for the operator. None or several = the operator picks; save is refused
 *    until they do. Never a guess from the description.
 *  - WoLineItemSelect — a flat edit-mode cost line picks any active item of the company.
 */
import { useEffect, useMemo, useState } from "react";
import { ReferenceSelect } from "../../parity/ReferenceSelect";
import { useAccountingItemsQuery } from "../../../hooks/useAccountingItemsQuery";

export const WO_LINE_ITEM_REQUIRED_MESSAGE = "Pick the item — the bill line posts to the item's account.";

type CategoryItemProps = {
  lineId: string;
  operatingCompanyId: string;
  /** The Section A line's category = a catalogs.accounts id (WO mode). */
  accountId: string | null;
  value: string | null;
  onChange: (itemId: string | null) => void;
  readOnly?: boolean;
};

export function WoCategoryLineItemSelect({ lineId, operatingCompanyId, accountId, value, onChange, readOnly = false }: CategoryItemProps) {
  const q = useAccountingItemsQuery({ operatingCompanyId, kind: "all", expenseAccountId: accountId, enabled: Boolean(accountId) });
  const options = useMemo(() => (q.data ?? []).map((i) => ({ value: String(i.id), label: String(i.name ?? "") })), [q.data]);
  const loaded = Boolean(accountId) && q.isSuccess;
  const soleItemId = loaded && options.length === 1 ? options[0].value : null;

  // The deterministic mapping: exactly ONE item posts to this category's account -> that item.
  useEffect(() => {
    if (readOnly || !soleItemId || value) return;
    onChange(soleItemId);
  }, [onChange, readOnly, soleItemId, value]);

  const hint = !accountId
    ? null
    : !loaded || value
      ? null
      : options.length === 0
        ? "No item posts to this category's account — create the item, or use a Section B item line."
        : `${options.length} items post to this category — ${WO_LINE_ITEM_REQUIRED_MESSAGE}`;

  return (
    <div data-testid={`wo-section-a-item-${lineId}`}>
      <ReferenceSelect
        value={value}
        onChange={onChange}
        options={options}
        createKind="item"
        operatingCompanyId={operatingCompanyId}
        placeholder={!accountId ? "Pick a category first" : "Select item… (required)"}
        addNewLabel="+ Add new item"
        disabled={readOnly || !accountId}
        loading={q.isLoading && Boolean(accountId)}
        onOptionCreated={(opt) => onChange(opt.value)}
        size="sm"
      />
      {hint ? (
        <p data-testid={`wo-section-a-item-hint-${lineId}`} className="mt-1 text-xs text-red-700">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

type LineItemProps = {
  testId: string;
  operatingCompanyId: string;
  value: string | null;
  onChange: (itemId: string | null) => void;
  /** The current item's name when it is not in the first page of options (a persisted line). */
  valueLabel?: string | null;
};

export function WoLineItemSelect({ testId, operatingCompanyId, value, onChange, valueLabel }: LineItemProps) {
  const [search, setSearch] = useState("");
  const q = useAccountingItemsQuery({ operatingCompanyId, kind: "all", search, enabled: Boolean(operatingCompanyId) });
  const options = useMemo(() => {
    const rows = (q.data ?? []).map((i) => ({ value: String(i.id), label: String(i.name ?? "") }));
    if (value && valueLabel && !rows.some((r) => r.value === value)) rows.unshift({ value, label: valueLabel });
    return rows;
  }, [q.data, value, valueLabel]);
  return (
    <div data-testid={testId}>
      <ReferenceSelect
        value={value}
        onChange={onChange}
        options={options}
        createKind="item"
        operatingCompanyId={operatingCompanyId}
        placeholder="Select item… (required)"
        addNewLabel="+ Add new item"
        loading={q.isLoading}
        onSearch={setSearch}
        onOptionCreated={(opt) => onChange(opt.value)}
        size="sm"
      />
      {!value ? <p className="mt-1 text-xs text-red-700">{WO_LINE_ITEM_REQUIRED_MESSAGE}</p> : null}
    </div>
  );
}
