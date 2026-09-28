// R-154 §5 (PR 4/7) — Write Check form. QBO layout inside the shared ParityDrawer shell (A3): payee,
// bank account, check date, check number / print-later, memo, then a category/item line table.
//
// Scope of this PR: the create flow only (matches PR 3/7's backend scope). Explicitly OUT of scope,
// disclosed rather than silently missing:
//   - attachments and audit history.
//   - Employee payee: no dedicated picker exists anywhere in this codebase yet (mdata has none —
//     identity.users has no "employee roster" UI). A plain UUID field is offered so the path is not
//     silently broken, with a visible note; a real employee picker is follow-up work, not invented here.
//
// Category-line picker deliberately does NOT use the shared ReferenceSelect's inline "+ Add new" --
// its options are accounting.expense_category_account_map ROWS (kind+code pairs), a different model
// than ReferenceSelect's createKind="category" (which creates a catalogs.accounts row). Offering
// inline creation here would either create the wrong kind of record or silently mismap. R-154.1 §B's
// own law ("no map row -> CATEGORY_UNMAPPED, never a guessed account") also means a check form is not
// the place to mint a new mapping — that is a chart-of-accounts governance action, done elsewhere.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "../Modal";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { DriverPickerWithCreate } from "../drivers/DriverPickerWithCreate";
import { EntityPicker } from "../EntityPicker";
import { EntityLink } from "../shared/EntityLink";
import { DatePicker } from "../forms/DatePicker";
import { MoneyInput } from "../forms/MoneyInput";
import { Button } from "../Button";
import { listExpenseCategoryMappings, listVendorBills, type ExpenseCategoryMapRow, type VendorBill } from "../../api/accounting";
import { formatDateUS } from "../../lib/formatDate";
import { getCashGlMapping, getBankingTiles, type CashGlBankAccount } from "../../api/banking";
import { listVendors, listCustomers } from "../../api/mdata";
import { useAccountingItemsQuery } from "../../hooks/useAccountingItemsQuery";
import { UploadZone } from "../UploadZone";
import {
  createCheck,
  getCheck,
  getCheckNextNumber,
  getCheckNumberStatus,
  payCheckBills,
  resolveCheckPayeePreview,
  type CheckLineInput,
  type CheckPayeeKind,
  type CheckRemitToAddress,
} from "../../api/checks";

const EMPTY_ADDRESS: CheckRemitToAddress = {
  address_line1: null,
  address_line2: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
};

function formatMoneyCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Payment date defaults to today in Central Time (spec §2) -- the operator's wall-clock browser
// timezone is not authoritative here; the fleet's operating timezone is.
function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); // en-CA => YYYY-MM-DD
}

type DraftLine = {
  key: string;
  kind: "category" | "item";
  categoryMapId: string | null; // key into the fetched map rows, not sent directly
  itemId: string | null;
  amountCents: number | null; // category lines only -- an item line's amount is always computed below
  // R-172 step 4 -- item grid Qty/Rate (R-83 owner ruling: "amount = qty x rate, computed, never
  // typed"). rateDollars is the human-entered per-unit price (fractional cents allowed, e.g.
  // $5.229/gal); rate_cents = rateDollars * 100 is derived only at save time.
  quantity: number | null;
  rateDollars: number | null;
  description: string;
  billable: boolean;
  customerId: string | null;
  // R-172 step 3 -- per-line fleet linkage (spec's category-grid columns); null means "use the
  // header's own value for this dimension" (createCheck() applies that fallback server-side).
  loadId: string | null;
  driverId: string | null;
  unitId: string | null;
  trailerId: string | null;
  workOrderId: string | null;
};

function newDraftLine(kind: "category" | "item" = "category"): DraftLine {
  return {
    key: newLineKey(),
    kind,
    categoryMapId: null,
    itemId: null,
    amountCents: null,
    quantity: null,
    rateDollars: null,
    description: "",
    billable: false,
    customerId: null,
    loadId: null,
    driverId: null,
    unitId: null,
    trailerId: null,
    workOrderId: null,
  };
}

// R-83: an item line's amount is ALWAYS quantity x rate, computed, never typed -- this is the one
// place that computation happens on the client, mirrored exactly by the server's own recomputation
// in createCheck() (never trust either side alone; the DB's own CHECK is the final word).
function lineAmountCents(line: DraftLine): number | null {
  if (line.kind === "category") return line.amountCents;
  if (!(line.quantity && line.quantity > 0) || !(line.rateDollars && line.rateDollars > 0)) return null;
  return Math.round(line.quantity * line.rateDollars * 100);
}

function newLineKey(): string {
  return `line-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Shared between the category and item grids -- both carry the same Billable/Customer pair and the
// same 5 fleet-linkage pickers (spec step 3/4), so the columns stay pixel-identical across both grids
// instead of two hand-copied implementations drifting apart. These render CELL CONTENT ONLY (no
// <td> wrapper) -- go26-consolidation-ratchet routes every grid through ParityTable, which owns the
// <td> itself (column.render(row) => ReactNode content, same contract as every other ParityTable caller).
function renderBillableCell(line: DraftLine, onUpdate: (patch: Partial<DraftLine>) => void) {
  return (
    <input
      type="checkbox"
      checked={line.billable}
      onChange={(e) => onUpdate({ billable: e.target.checked, customerId: e.target.checked ? line.customerId : null })}
      aria-label="Billable"
    />
  );
}

function renderCustomerCell(
  line: DraftLine,
  operatingCompanyId: string,
  customerOptions: Array<{ value: string; label: string }>,
  onUpdate: (patch: Partial<DraftLine>) => void
) {
  return line.billable ? (
    <ReferenceSelect
      id={`check-line-customer-${line.key}`}
      value={line.customerId}
      onChange={(next) => onUpdate({ customerId: next })}
      options={customerOptions}
      createKind="customer"
      operatingCompanyId={operatingCompanyId}
      placeholder="Select customer…"
      size="sm"
    />
  ) : (
    <span className="text-gray-300">—</span>
  );
}

type LinkageKind = "load" | "driver" | "unit" | "trailer" | "work_order";
const LINKAGE_PATCH_KEY: Record<LinkageKind, keyof DraftLine> = {
  load: "loadId",
  driver: "driverId",
  unit: "unitId",
  trailer: "trailerId",
  work_order: "workOrderId",
};
const LINKAGE_VALUE: Record<LinkageKind, (line: DraftLine) => string | null> = {
  load: (l) => l.loadId,
  driver: (l) => l.driverId,
  unit: (l) => l.unitId,
  trailer: (l) => l.trailerId,
  work_order: (l) => l.workOrderId,
};
const LINKAGE_LABEL: Record<LinkageKind, string> = {
  load: "Load",
  driver: "Driver",
  unit: "Truck",
  trailer: "Trailer",
  work_order: "Work order",
};
const LINKAGE_KINDS: LinkageKind[] = ["load", "driver", "unit", "trailer", "work_order"];

function renderLinkageCell(kind: LinkageKind, line: DraftLine, operatingCompanyId: string, onUpdate: (patch: Partial<DraftLine>) => void) {
  return (
    <EntityPicker
      kind={kind}
      operatingCompanyId={operatingCompanyId}
      value={LINKAGE_VALUE[kind](line)}
      onChange={(next) => onUpdate({ [LINKAGE_PATCH_KEY[kind]]: next } as Partial<DraftLine>)}
      placeholder="(header)"
      allowCreate={false}
      size="sm"
    />
  );
}

/** Billable + Customer + the 5 fleet-linkage columns, identical across the category and item grids. */
function sharedLineColumns(
  operatingCompanyId: string,
  customerOptions: Array<{ value: string; label: string }>,
  onUpdate: (key: string, patch: Partial<DraftLine>) => void
): Array<ParityColumn<DraftLine>> {
  return [
    {
      key: "billable",
      label: "Billable",
      sortable: false,
      className: "w-14 text-center",
      cellClass: "text-center",
      render: (line) => renderBillableCell(line, (patch) => onUpdate(line.key, patch)),
    },
    {
      key: "customerId",
      label: "Customer",
      sortable: false,
      render: (line) => renderCustomerCell(line, operatingCompanyId, customerOptions, (patch) => onUpdate(line.key, patch)),
    },
    ...LINKAGE_KINDS.map(
      (kind): ParityColumn<DraftLine> => ({
        key: kind,
        label: LINKAGE_LABEL[kind],
        sortable: false,
        render: (line) => renderLinkageCell(kind, line, operatingCompanyId, (patch) => onUpdate(line.key, patch)),
      })
    ),
  ];
}

export type WriteCheckFormProps = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: (checkId: string) => void;
  /** R-172 step 6 -- Save / Save and new (spec §6): the check was saved but the drawer stays open
   * (Save) or reopens fresh (Save and new) rather than navigating away like onSaved/Save and close. */
  onSavedKeepOpen?: (checkId: string) => void;
  /** R-172 step 1 -- entry points from a vendor/driver/customer profile pre-select the payee. */
  initialPayee?: { kind: CheckPayeeKind; id: string };
  /** R-172 step 8 -- More menu's "Copy": clone this check's payee/bank/memo/tags/lines. Never the
   * check number (a fresh one is always claimed) and never the payee's saved address override --
   * the copy re-resolves the payee's CURRENT address, same as any other new check. */
  copyFromCheckId?: string;
};

export function WriteCheckForm({ open, operatingCompanyId, onClose, onSaved, onSavedKeepOpen, initialPayee, copyFromCheckId }: WriteCheckFormProps) {
  const [payeeKind, setPayeeKind] = useState<CheckPayeeKind>(initialPayee?.kind ?? "vendor");
  const [payeeId, setPayeeId] = useState<string | null>(initialPayee?.id ?? null);
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [checkDate, setCheckDate] = useState<string>(() => todayCT());
  const [printLater, setPrintLater] = useState(false);
  const [checkNumber, setCheckNumber] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [tagsText, setTagsText] = useState<string>("");
  // R-172 step 2 -- auto-filled from the payee, then editable; the operator's edit wins on save
  // (edited flag tracked so a payee switch doesn't clobber a manual edit the operator just made).
  const [remitToAddress, setRemitToAddress] = useState<CheckRemitToAddress>(EMPTY_ADDRESS);
  const [addressEdited, setAddressEdited] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([newDraftLine()]);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // R-172 step 6 -- footer Attachments (docs.files). UploadZone needs an entity id before the check
  // exists; this random draft id is re-keyed onto the real expense id server-side on save (Option B,
  // the same mechanism RecordExpenseForm/VendorBillForm already use).
  const [draftAttachmentEntityId, setDraftAttachmentEntityId] = useState<string>(() => crypto.randomUUID());

  const bankAccountsQuery = useQuery({
    queryKey: ["checks", "bank-accounts", operatingCompanyId],
    queryFn: () => getCashGlMapping(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });
  // Only ledger-mapped accounts are legal check bank accounts (spec §B -- the server enforces this
  // too; filtering client-side just keeps an operator from picking a dead end).
  const bankAccounts: CashGlBankAccount[] = (bankAccountsQuery.data?.bank_accounts ?? []).filter((a) => a.ledger_account_id);

  const categoryMapQuery = useQuery({
    queryKey: ["checks", "expense-category-map", operatingCompanyId],
    queryFn: () => listExpenseCategoryMappings(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });
  const categoryRows: ExpenseCategoryMapRow[] = categoryMapQuery.data?.rows ?? [];

  // R-172 CHECK-PAYEE-UNREACHABLE fix -- these ReferenceSelects previously rendered options={[]}
  // hardcoded, so a real vendor/customer/item could never be found by typing (only "+ Add new ___"
  // ever showed). The engine underneath (payee resolve, Add-to-Check bill panel, item lines) was
  // already correct; the picker feeding it a payee id was simply never wired to fetch anything.
  const payeeVendorsQuery = useQuery({
    queryKey: ["vendors", "picker", operatingCompanyId],
    queryFn: () => listVendors({ operating_company_id: operatingCompanyId, limit: 1000 }),
    enabled: open && Boolean(operatingCompanyId) && payeeKind === "vendor",
  });
  const payeeCustomersQuery = useQuery({
    queryKey: ["customers", "picker", operatingCompanyId],
    queryFn: () => listCustomers({ operating_company_id: operatingCompanyId, limit: 1000 }),
    enabled: open && Boolean(operatingCompanyId) && payeeKind === "customer",
  });
  const payeeOptions = useMemo(
    () =>
      payeeKind === "vendor"
        ? (payeeVendorsQuery.data?.vendors ?? []).map((v) => ({ value: v.id, label: v.name ?? v.id }))
        : (payeeCustomersQuery.data?.customers ?? []).map((c) => ({ value: c.id, label: c.name ?? c.id })),
    [payeeKind, payeeVendorsQuery.data, payeeCustomersQuery.data]
  );

  // Billable-line "Customer" picker (renderCustomerCell) shares the same customer roster -- fetch it
  // whenever the drawer is open, not gated to payeeKind==="customer" (a Vendor-payee check can still
  // have billable lines against a customer).
  const lineCustomersQuery = useQuery({
    queryKey: ["customers", "picker", operatingCompanyId],
    queryFn: () => listCustomers({ operating_company_id: operatingCompanyId, limit: 1000 }),
    enabled: open && Boolean(operatingCompanyId) && payeeKind !== "customer",
  });
  const customerOptions = useMemo(
    () =>
      (payeeKind === "customer" ? payeeCustomersQuery.data?.customers : lineCustomersQuery.data?.customers)?.map((c) => ({
        value: c.id,
        label: c.name ?? c.id,
      })) ?? [],
    [payeeKind, payeeCustomersQuery.data, lineCustomersQuery.data]
  );

  const itemsQuery = useAccountingItemsQuery({ operatingCompanyId, kind: "service", enabled: open });
  const itemOptions = useMemo(
    () => (itemsQuery.data ?? []).map((i) => ({ value: i.id, label: i.name })),
    [itemsQuery.data]
  );

  // R-172 step 8 -- More menu's "Copy": clone the source check's payee/bank/memo/tags/lines once, the
  // moment both the source check and the category map (needed to re-derive categoryMapId) are loaded.
  // Never the check number (a fresh one is claimed at save) and never a stale saved address -- the
  // payee preview effect above already re-resolves the CURRENT address for whichever payee this copies.
  const copySourceQuery = useQuery({
    queryKey: ["checks", "copy-source", operatingCompanyId, copyFromCheckId],
    queryFn: () => getCheck(operatingCompanyId, copyFromCheckId as string),
    enabled: open && Boolean(operatingCompanyId) && Boolean(copyFromCheckId) && categoryRows.length > 0,
  });
  const [copyApplied, setCopyApplied] = useState(false);
  useEffect(() => {
    if (!copySourceQuery.data || copyApplied) return;
    const { check: src, lines: srcLines } = copySourceQuery.data;
    setCopyApplied(true);
    if (src.payee_kind === "vendor" && src.vendor_uuid) {
      setPayeeKind("vendor");
      setPayeeId(src.vendor_uuid);
    } else if (src.payee_kind === "driver" && src.driver_uuid) {
      setPayeeKind("driver");
      setPayeeId(src.driver_uuid);
    } else if (src.payee_kind === "customer" && src.payee_customer_uuid) {
      setPayeeKind("customer");
      setPayeeId(src.payee_customer_uuid);
    }
    setBankAccountId(src.bank_account_id);
    setMemo(src.memo ?? "");
    setTagsText((src.tags ?? []).join(", "));
    setLines(
      srcLines.map((l) => {
        const isItem = Boolean(l.item_id);
        const categoryMapId = !isItem ? categoryRows.find((r) => r.account_id === l.expense_account_uuid)?.id ?? null : null;
        return {
          key: newLineKey(),
          kind: isItem ? "item" : "category",
          categoryMapId,
          itemId: l.item_id,
          amountCents: isItem ? null : l.amount_cents,
          quantity: l.quantity != null ? Number(l.quantity) : null,
          rateDollars: l.rate_cents != null ? Number(l.rate_cents) / 100 : null,
          description: l.description ?? "",
          billable: Boolean(l.billable_customer_uuid),
          customerId: l.billable_customer_uuid,
          loadId: l.load_id,
          driverId: l.driver_id,
          unitId: l.unit_id,
          trailerId: l.trailer_id,
          workOrderId: l.linked_work_order_uuid,
        };
      })
    );
  }, [copySourceQuery.data, copyApplied, categoryRows]);

  const nextNumberQuery = useQuery({
    queryKey: ["checks", "next-number", operatingCompanyId, bankAccountId],
    queryFn: () => getCheckNextNumber(operatingCompanyId, bankAccountId as string),
    enabled: open && Boolean(operatingCompanyId) && Boolean(bankAccountId) && !printLater,
  });

  // R-172 step 6 -- "warn on a duplicate check number for the same bank account" (spec §6).
  const checkNumberStatusQuery = useQuery({
    queryKey: ["checks", "check-number-status", operatingCompanyId, bankAccountId, checkNumber.trim()],
    queryFn: () => getCheckNumberStatus(operatingCompanyId, bankAccountId as string, checkNumber.trim()),
    enabled: open && Boolean(operatingCompanyId) && Boolean(bankAccountId) && checkNumber.trim().length > 0 && !printLater,
  });
  const duplicateCheckNumber = checkNumberStatusQuery.data?.in_use === true;

  // R-172 step 2 -- live balance under the bank dropdown; account-tiles carries the same real-time
  // current_balance already shown on the Banking page, keyed by the same bank_accounts.id.
  const bankTilesQuery = useQuery({
    queryKey: ["checks", "bank-tiles", operatingCompanyId],
    queryFn: () => getBankingTiles(operatingCompanyId),
    enabled: open && Boolean(operatingCompanyId),
  });
  const selectedBankBalance = bankTilesQuery.data?.tiles?.find((t) => t.id === bankAccountId)?.current_balance ?? null;

  // R-172 step 2 -- payee mailing address auto-fill, read-only preview (never invented client-side).
  const payeePreviewQuery = useQuery({
    queryKey: ["checks", "resolve-payee", operatingCompanyId, payeeKind, payeeId],
    queryFn: () => resolveCheckPayeePreview(operatingCompanyId, payeeKind, payeeId as string),
    enabled: open && Boolean(operatingCompanyId) && Boolean(payeeId),
    retry: false,
  });
  useEffect(() => {
    // A payee switch always re-fills from the newly resolved address, even if the previous payee's
    // address had been hand-edited -- editing is "this payee's address is wrong," not "keep whatever
    // text is in the box no matter who I pick."
    if (payeePreviewQuery.data) {
      setRemitToAddress(payeePreviewQuery.data.remit_to_address ?? EMPTY_ADDRESS);
      setAddressEdited(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payeePreviewQuery.data]);
  useEffect(() => {
    if (!payeeId) {
      setRemitToAddress(EMPTY_ADDRESS);
      setAddressEdited(false);
    }
  }, [payeeId]);

  function updateAddress(patch: Partial<CheckRemitToAddress>) {
    setRemitToAddress((prev) => ({ ...prev, ...patch }));
    setAddressEdited(true);
  }

  // R-172 step 5 -- the payee's open bills (spec §5). "Add" moves a bill into billToPayAmounts,
  // which is what turns the check into a Bill Payment (Check) -- see handleSave below.
  const vendorIdForBills = payeePreviewQuery.data?.vendor_id_for_bills ?? null;
  const openBillsQuery = useQuery({
    queryKey: ["checks", "open-bills", operatingCompanyId, vendorIdForBills],
    queryFn: () => listVendorBills(operatingCompanyId, { vendor_id: vendorIdForBills as string, has_balance: true, include_balance: true }),
    enabled: open && Boolean(operatingCompanyId) && Boolean(vendorIdForBills),
  });
  const openBills: VendorBill[] = openBillsQuery.data?.rows ?? [];
  const [billToPayAmounts, setBillToPayAmounts] = useState<Record<string, number>>({});
  const billsToPay = openBills.filter((b) => b.id in billToPayAmounts);
  const isBillPayment = billsToPay.length > 0;
  const billPaymentTotalCents = useMemo(() => Object.values(billToPayAmounts).reduce((sum, c) => sum + c, 0), [billToPayAmounts]);

  function addBillToPay(bill: VendorBill) {
    const remaining = bill.balance_cents ?? bill.amount_cents - bill.paid_cents;
    setBillToPayAmounts((prev) => ({ ...prev, [bill.id]: Math.max(remaining, 0) }));
  }
  function removeBillToPay(billId: string) {
    setBillToPayAmounts((prev) => {
      const next = { ...prev };
      delete next[billId];
      return next;
    });
  }
  function setBillToPayAmount(billId: string, cents: number) {
    setBillToPayAmounts((prev) => ({ ...prev, [billId]: cents }));
  }
  const billsToPayColumns: Array<ParityColumn<VendorBill>> = [
    {
      key: "id",
      label: "Bill",
      sortable: false,
      render: (b) => <EntityLink kind="bill" id={b.id} label={b.display_id ?? b.bill_number ?? undefined} />,
    },
    { key: "bill_date", label: "Date", sortable: false, render: (b) => formatDateUS(b.bill_date) },
    {
      key: "balance_cents",
      label: "Remaining",
      sortable: false,
      className: "w-28",
      render: (b) => formatMoneyCents(b.balance_cents ?? b.amount_cents - b.paid_cents),
    },
    {
      key: "pay_amount",
      label: "Pay amount",
      sortable: false,
      className: "w-28",
      render: (b) => {
        const remaining = b.balance_cents ?? b.amount_cents - b.paid_cents;
        return (
          <MoneyInput
            valueCents={billToPayAmounts[b.id] ?? 0}
            onChangeCents={(cents) => setBillToPayAmount(b.id, Math.min(cents ?? 0, remaining))}
          />
        );
      },
    },
    {
      key: "remove",
      label: "",
      sortable: false,
      className: "w-8 text-center",
      cellClass: "text-center",
      render: (b) => (
        <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => removeBillToPay(b.id)} aria-label="Remove bill">
          ×
        </button>
      ),
    },
  ];
  // A payee switch clears any bills queued for the PREVIOUS payee -- they belong to a different vendor.
  useEffect(() => {
    setBillToPayAmounts({});
  }, [vendorIdForBills]);

  const totalCents = useMemo(() => lines.reduce((sum, l) => sum + (lineAmountCents(l) ?? 0), 0), [lines]);
  const categoryLines = useMemo(() => lines.filter((l) => l.kind === "category"), [lines]);
  const itemLines = useMemo(() => lines.filter((l) => l.kind === "item"), [lines]);

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }
  function addLine(kind: "category" | "item" = "category") {
    setLines((prev) => [...prev, newDraftLine(kind)]);
  }
  function removeLine(key: string) {
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev));
  }
  function clearAllLines() {
    setLines([newDraftLine()]);
  }
  // R-172 step 4 -- "collapse the grid when it is empty, as QBO does": removing the last item line
  // takes it out entirely rather than leaving one empty item row hanging around (unlike the category
  // grid, which always keeps at least one row -- a check needs at least one category or item line,
  // and the category grid is the default/always-present one).
  function removeItemLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const categoryColumns: Array<ParityColumn<DraftLine>> = [
    {
      key: "seq",
      label: "#",
      sortable: false,
      className: "w-10",
      cellClass: "text-gray-500",
      render: (line) => categoryLines.indexOf(line) + 1,
    },
    {
      key: "categoryMapId",
      label: "Category",
      sortable: false,
      // Account numbers stay hidden by default (verify-account-number-hidden-by-default.mjs) --
      // name/kind-code is enough to pick the right category.
      render: (line) => (
        <select
          className="h-8 w-full rounded border border-gray-300 px-1"
          value={line.categoryMapId ?? ""}
          onChange={(e) => updateLine(line.key, { categoryMapId: e.target.value || null })}
        >
          <option value="">Select category…</option>
          {categoryRows.map((row) => (
            <option key={row.id} value={row.id}>
              {row.account_name ?? `${row.category_kind}/${row.category_code}`}
            </option>
          ))}
        </select>
      ),
    },
    {
      key: "description",
      label: "Description",
      sortable: false,
      render: (line) => (
        <input
          className="h-8 w-full rounded border border-gray-300 px-1"
          value={line.description}
          onChange={(e) => updateLine(line.key, { description: e.target.value })}
        />
      ),
    },
    {
      key: "amountCents",
      label: "Amount",
      sortable: false,
      className: "w-28",
      render: (line) => <MoneyInput valueCents={line.amountCents} onChangeCents={(cents) => updateLine(line.key, { amountCents: cents })} />,
    },
    ...sharedLineColumns(operatingCompanyId, customerOptions, updateLine),
    {
      key: "remove",
      label: "",
      sortable: false,
      className: "w-8 text-center",
      cellClass: "text-center",
      render: (line) => (
        <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => removeLine(line.key)} aria-label="Remove line">
          ×
        </button>
      ),
    },
  ];

  const itemColumns: Array<ParityColumn<DraftLine>> = [
    {
      key: "seq",
      label: "#",
      sortable: false,
      className: "w-10",
      cellClass: "text-gray-500",
      render: (line) => itemLines.indexOf(line) + 1,
    },
    {
      key: "itemId",
      label: "Product/Service",
      sortable: false,
      render: (line) => (
        <ReferenceSelect
          id={`check-line-item-${line.key}`}
          value={line.itemId}
          onChange={(next) => updateLine(line.key, { itemId: next })}
          options={itemOptions}
          createKind="item"
          operatingCompanyId={operatingCompanyId}
          placeholder="Select item…"
          size="sm"
        />
      ),
    },
    {
      key: "description",
      label: "Description",
      sortable: false,
      render: (line) => (
        <input
          className="h-8 w-full rounded border border-gray-300 px-1"
          value={line.description}
          onChange={(e) => updateLine(line.key, { description: e.target.value })}
        />
      ),
    },
    {
      key: "quantity",
      label: "Qty",
      sortable: false,
      className: "w-20",
      render: (line) => (
        <input
          type="number"
          min="0"
          step="0.001"
          className="h-8 w-full rounded border border-gray-300 px-1"
          value={line.quantity ?? ""}
          onChange={(e) => updateLine(line.key, { quantity: e.target.value ? Number(e.target.value) : null })}
        />
      ),
    },
    {
      key: "rateDollars",
      label: "Rate",
      sortable: false,
      className: "w-24",
      render: (line) => (
        <input
          type="number"
          min="0"
          step="0.0001"
          className="h-8 w-full rounded border border-gray-300 px-1"
          value={line.rateDollars ?? ""}
          onChange={(e) => updateLine(line.key, { rateDollars: e.target.value ? Number(e.target.value) : null })}
        />
      ),
    },
    {
      key: "amount",
      label: "Amount",
      sortable: false,
      className: "w-28",
      cellClass: "text-gray-700",
      // R-83: computed, never typed -- read-only, mirrors quantity x rate.
      render: (line) => {
        const cents = lineAmountCents(line);
        return cents != null ? formatMoneyCents(cents) : <span className="text-gray-300">—</span>;
      },
    },
    ...sharedLineColumns(operatingCompanyId, customerOptions, updateLine),
    {
      key: "remove",
      label: "",
      sortable: false,
      className: "w-8 text-center",
      cellClass: "text-center",
      render: (line) => (
        <button type="button" className="text-gray-400 hover:text-red-600" onClick={() => removeItemLine(line.key)} aria-label="Remove line">
          ×
        </button>
      ),
    },
  ];

  // R-172 step 5 -- once a bill is added, this IS a Bill Payment (Check): a real check number is
  // required (the underlying engine has never supported print-later) and the category/item lines are
  // not sent at all -- the bills ARE the lines. amount_cents on every queued bill must be positive and
  // never exceed its own remaining balance (partial payment allowed, over-payment is not).
  const canSave = isBillPayment
    ? Boolean(payeeId) &&
      Boolean(bankAccountId) &&
      Boolean(checkDate) &&
      checkNumber.trim().length > 0 &&
      billsToPay.every((b) => {
        const amt = billToPayAmounts[b.id] ?? 0;
        const remaining = b.balance_cents ?? b.amount_cents - b.paid_cents;
        return amt > 0 && amt <= remaining;
      }) &&
      billPaymentTotalCents > 0 &&
      !saving
    : Boolean(payeeId) &&
      Boolean(bankAccountId) &&
      Boolean(checkDate) &&
      (printLater || checkNumber.trim().length > 0) &&
      lines.length > 0 &&
      lines.every((l) => (l.kind === "category" ? Boolean(l.categoryMapId) : Boolean(l.itemId)) && (lineAmountCents(l) ?? 0) > 0) &&
      totalCents > 0 &&
      !saving;

  function resetForm() {
    setPayeeKind("vendor");
    setPayeeId(null);
    setBankAccountId(null);
    setCheckDate(todayCT());
    setPrintLater(false);
    setCheckNumber("");
    setMemo("");
    setTagsText("");
    setRemitToAddress(EMPTY_ADDRESS);
    setAddressEdited(false);
    setLines([newDraftLine()]);
    setBillToPayAmounts({});
    setDraftAttachmentEntityId(crypto.randomUUID());
    setSaveError(null);
  }

  // R-172 step 6 -- footer buttons (spec §6): Save keeps the drawer open on the same check; Save and
  // new resets to a fresh check without closing; Save and close is today's original behavior
  // (navigate away via onSaved); Print check forces print_later before saving (PDF rendering/confirm-
  // printed is step 9's scope -- not invented here, this only routes the save the same way step 9's
  // print queue will eventually pick the check up from).
  async function handleSave(after: "keep_open" | "new" | "close" = "close", forcePrintLater = false) {
    if (!payeeId || !bankAccountId) return;
    setSaving(true);
    setSaveError(null);
    try {
      let savedId: string;
      if (isBillPayment) {
        if (payeeKind !== "vendor" && payeeKind !== "driver") return;
        const result = await payCheckBills({
          operating_company_id: operatingCompanyId,
          payee_kind: payeeKind,
          payee_id: payeeId,
          bank_account_id: bankAccountId,
          check_date: checkDate,
          check_number: checkNumber.trim(),
          memo: memo.trim() || null,
          applications: billsToPay.map((b) => ({ bill_id: b.id, amount_cents: billToPayAmounts[b.id] ?? 0 })),
        });
        savedId = result.payment_batch_id;
      } else {
        savedId = await saveExpenseCheck(forcePrintLater);
      }
      if (after === "new") {
        resetForm();
        onSavedKeepOpen?.(savedId);
      } else if (after === "keep_open") {
        onSavedKeepOpen?.(savedId);
      } else {
        onSaved(savedId);
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save the check.");
    } finally {
      setSaving(false);
    }
  }

  async function saveExpenseCheck(forcePrintLater: boolean): Promise<string> {
      if (!payeeId || !bankAccountId) throw new Error("Payee and bank account are required.");
      const effectivePrintLater = forcePrintLater || printLater;
      const lineInputs: CheckLineInput[] = lines.map((l) => {
        const linkage = {
          billable_customer_uuid: l.billable ? l.customerId : null,
          load_id: l.loadId,
          driver_id: l.driverId,
          unit_id: l.unitId,
          trailer_id: l.trailerId,
          linked_work_order_uuid: l.workOrderId,
        };
        if (l.kind === "item") {
          return {
            line_kind: "item",
            item_id: l.itemId,
            amount_cents: lineAmountCents(l) ?? 0,
            quantity: l.quantity,
            rate_cents: l.rateDollars != null ? Math.round(l.rateDollars * 100 * 10000) / 10000 : null,
            unit_of_measure: "each",
            description: l.description || null,
            ...linkage,
          };
        }
        const row = categoryRows.find((r) => r.id === l.categoryMapId);
        return {
          line_kind: "category",
          category_kind: row?.category_kind ?? null,
          category_code: row?.category_code ?? null,
          amount_cents: l.amountCents ?? 0,
          description: l.description || null,
          ...linkage,
        };
      });
      const tags = tagsText
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const result = await createCheck({
        operating_company_id: operatingCompanyId,
        bank_account_id: bankAccountId,
        payee_kind: payeeKind,
        payee_id: payeeId,
        check_date: checkDate,
        print_later: effectivePrintLater,
        check_number: effectivePrintLater ? null : checkNumber.trim(),
        memo: memo.trim() || null,
        tags,
        // Only send the address when the operator actually edited it -- otherwise the server saves
        // the payee's freshly-resolved address itself, avoiding a stale client copy overwriting it.
        remit_to_address: addressEdited ? remitToAddress : null,
        attachment_draft_id: draftAttachmentEntityId,
        lines: lineInputs,
      });
      return result.id;
  }

  return (
    <Modal open={open} onClose={onClose} title="Check" modalKind="check-write" sizePreset="xl">
      <div className="flex flex-col gap-4">
        {saveError ? <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{saveError}</div> : null}

        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs font-semibold text-gray-700">
            Operating company
            {/* R-172 step 2 -- USMCA is fixed, not a picker (spec §2, this branch is USMCA-only). */}
            <div className="mt-1 flex h-9 w-full items-center rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-600">
              USMCA
            </div>
          </label>

          <label className="text-xs font-semibold text-gray-700">
            Payee type
            <select
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-xs"
              value={payeeKind}
              onChange={(e) => {
                setPayeeKind(e.target.value as CheckPayeeKind);
                setPayeeId(null);
              }}
            >
              <option value="vendor">Vendor</option>
              <option value="driver">Driver</option>
              <option value="customer">Customer (refund)</option>
              <option value="employee">Employee</option>
            </select>
          </label>

          <label className="text-xs font-semibold text-gray-700">
            Payee
            <div className="mt-1">
              {payeeKind === "vendor" || payeeKind === "customer" ? (
                <ReferenceSelect
                  id="check-payee"
                  value={payeeId}
                  onChange={setPayeeId}
                  options={payeeOptions}
                  createKind={payeeKind}
                  operatingCompanyId={operatingCompanyId}
                  placeholder={payeeKind === "vendor" ? "Select vendor…" : "Select customer…"}
                />
              ) : payeeKind === "driver" ? (
                <DriverPickerWithCreate operatingCompanyId={operatingCompanyId} value={payeeId} onChange={setPayeeId} shell="drawer" placeholder="Select driver…" />
              ) : (
                <input
                  className="h-9 w-full rounded border border-gray-300 px-2 text-xs"
                  placeholder="Employee user id (no picker built yet)"
                  value={payeeId ?? ""}
                  onChange={(e) => setPayeeId(e.target.value || null)}
                />
              )}
            </div>
          </label>
        </div>

        {payeeId ? (
          <div className="rounded border border-gray-200 p-3">
            <div className="mb-2 flex items-center justify-between text-xs font-semibold text-gray-700">
              <span>Mailing address</span>
              {addressEdited ? <span className="font-normal text-gray-400">(edited)</span> : null}
            </div>
            {payeePreviewQuery.isLoading ? (
              <div className="text-xs text-gray-400">Loading…</div>
            ) : payeePreviewQuery.isError ? (
              <div className="text-xs text-red-600">Could not load this payee's address.</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="col-span-2 h-8 rounded border border-gray-300 px-2 text-xs"
                  placeholder="Address line 1"
                  value={remitToAddress.address_line1 ?? ""}
                  onChange={(e) => updateAddress({ address_line1: e.target.value || null })}
                />
                <input
                  className="col-span-2 h-8 rounded border border-gray-300 px-2 text-xs"
                  placeholder="Address line 2"
                  value={remitToAddress.address_line2 ?? ""}
                  onChange={(e) => updateAddress({ address_line2: e.target.value || null })}
                />
                <input
                  className="h-8 rounded border border-gray-300 px-2 text-xs"
                  placeholder="City"
                  value={remitToAddress.city ?? ""}
                  onChange={(e) => updateAddress({ city: e.target.value || null })}
                />
                <input
                  className="h-8 rounded border border-gray-300 px-2 text-xs"
                  placeholder="State"
                  value={remitToAddress.state ?? ""}
                  onChange={(e) => updateAddress({ state: e.target.value || null })}
                />
                <input
                  className="h-8 rounded border border-gray-300 px-2 text-xs"
                  placeholder="Postal code"
                  value={remitToAddress.postal_code ?? ""}
                  onChange={(e) => updateAddress({ postal_code: e.target.value || null })}
                />
                <input
                  className="h-8 rounded border border-gray-300 px-2 text-xs"
                  placeholder="Country"
                  value={remitToAddress.country ?? ""}
                  onChange={(e) => updateAddress({ country: e.target.value || null })}
                />
              </div>
            )}
          </div>
        ) : null}

        {/* R-172 step 5 -- the payee's open bills (spec §5). Adding one turns this check into a Bill
            Payment (Check): a genuinely different document (accounting.bill_payments), so the
            category/item grids below disappear the moment a bill is queued -- the bills ARE the
            lines, not something layered on top of them. */}
        {vendorIdForBills ? (
          <div className="rounded border border-gray-200 p-3">
            <div className="mb-2 text-xs font-semibold text-gray-700">Open bills for this payee</div>
            {isBillPayment ? (
              <div className="mb-2 rounded border border-blue-200 bg-blue-50 px-2 py-1.5 text-xs text-blue-800">
                This check will be saved as a Bill Payment (Check) -- the category/item lines below are not used.
              </div>
            ) : null}
            {billsToPay.length > 0 ? (
              <div className="mb-2 rounded border border-gray-200">
                <ParityTable<VendorBill>
                  columns={billsToPayColumns}
                  rows={billsToPay}
                  rowKey={(b) => b.id}
                  emptyText="No bills queued."
                  pageSize={billsToPay.length || 1}
                  hidePager
                  enableColumnResize={false}
                  enableColumnReorder={false}
                />
              </div>
            ) : null}
            {openBillsQuery.isLoading ? (
              <div className="text-xs text-gray-400">Loading open bills…</div>
            ) : openBills.filter((b) => !(b.id in billToPayAmounts)).length === 0 ? (
              <div className="text-xs text-gray-400">{billsToPay.length > 0 ? "No other open bills." : "No open bills for this payee."}</div>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded border border-gray-100">
                {openBills
                  .filter((b) => !(b.id in billToPayAmounts))
                  .map((b) => {
                    const remaining = b.balance_cents ?? b.amount_cents - b.paid_cents;
                    return (
                      <div key={b.id} className="flex items-center justify-between border-t border-gray-100 px-2 py-1 text-xs first:border-t-0">
                        <span>
                          <EntityLink kind="bill" id={b.id} label={b.display_id ?? b.bill_number ?? undefined} /> · {formatDateUS(b.bill_date)} · {formatMoneyCents(remaining)}
                        </span>
                        <button type="button" className="font-semibold text-blue-700 hover:underline" onClick={() => addBillToPay(b)}>
                          Add
                        </button>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-3">
          <label className="text-xs font-semibold text-gray-700">
            Bank account
            <select
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-xs"
              value={bankAccountId ?? ""}
              onChange={(e) => setBankAccountId(e.target.value || null)}
              disabled={bankAccountsQuery.isLoading}
            >
              <option value="">Select bank account…</option>
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.account_name}
                </option>
              ))}
            </select>
            {bankAccountId ? (
              <div className="mt-1 text-xs text-gray-500">
                {bankTilesQuery.isLoading ? "Balance: …" : selectedBankBalance != null ? `Balance: ${formatMoneyCents(selectedBankBalance)}` : "Balance: —"}
              </div>
            ) : null}
          </label>

          <label className="text-xs font-semibold text-gray-700">
            Payment date
            <div className="mt-1">
              <DatePicker value={checkDate} onChange={setCheckDate} />
            </div>
          </label>

          <label className="text-xs font-semibold text-gray-700">
            Check no.
            <div className="mt-1 flex items-center gap-2">
              {printLater && !isBillPayment ? (
                <div className="flex h-9 w-full items-center rounded border border-gray-200 bg-gray-50 px-2 text-xs text-gray-500">To print</div>
              ) : (
                <input
                  className="h-9 w-full rounded border border-gray-300 px-2 text-xs"
                  value={checkNumber}
                  onChange={(e) => setCheckNumber(e.target.value)}
                  placeholder={nextNumberQuery.data?.next_check_number ?? "—"}
                />
              )}
            </div>
            {/* R-172 step 6 -- "warn on a duplicate check number for the same bank account" (spec §6).
                Advisory only -- the check_number_registry UNIQUE constraint is still the hard stop at
                save. */}
            {duplicateCheckNumber ? (
              <div className="mt-1 rounded border border-slate-200 bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                Check number {checkNumber.trim()} has already been used on this bank account.
              </div>
            ) : null}
            {/* R-172 step 5 -- a Bill Payment (Check) always needs a real number now; the underlying
                engine (vendor-bill-payments.routes.ts) has never supported print-later. */}
            {!isBillPayment ? (
              <label className="mt-1 flex items-center gap-1 text-xs font-normal text-gray-600">
                <input type="checkbox" checked={printLater} onChange={(e) => setPrintLater(e.target.checked)} />
                Print later
              </label>
            ) : null}
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-gray-700">
            Memo
            <input className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-xs" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-gray-700">
            Tags
            <input
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-xs"
              placeholder="Comma-separated"
              value={tagsText}
              onChange={(e) => setTagsText(e.target.value)}
            />
          </label>
        </div>

        {/* R-172 step 6 -- footer Attachments (docs.files). Not offered for a Bill Payment (Check) --
            that document is accounting.bill_payments, not accounting.expenses, so this expense-scoped
            draft-attachment reconcile does not apply to it. */}
        {!isBillPayment ? (
          <div>
            <div className="mb-1 text-xs font-semibold text-gray-700">Attachments</div>
            <UploadZone operatingCompanyId={operatingCompanyId} entityType="expense" entityId={draftAttachmentEntityId} defaultCategory="vendor_invoice" title="Attachments" />
          </div>
        ) : null}

        {isBillPayment ? (
          <div className="flex items-center justify-end rounded border border-gray-200 px-3 py-2">
            <div className="text-xs font-semibold text-gray-800">Total: {formatMoneyCents(billPaymentTotalCents)}</div>
          </div>
        ) : (
          <>
        {/* Category details grid (spec step 3) -- always present; a check needs at least one line. */}
        <div className="rounded border border-gray-200">
          <ParityTable<DraftLine>
            columns={categoryColumns}
            rows={categoryLines}
            rowKey={(line) => line.key}
            pageSize={categoryLines.length || 1}
            hidePager
            enableColumnResize={false}
            enableColumnReorder={false}
          />
          <div className="flex items-center justify-between border-t border-gray-100 px-2 py-2">
            <div className="flex items-center gap-3">
              <button type="button" className="text-xs font-semibold text-blue-700 hover:underline" onClick={() => addLine("category")}>
                + Add lines
              </button>
              <button type="button" className="text-xs font-semibold text-gray-500 hover:underline" onClick={clearAllLines}>
                Clear all lines
              </button>
            </div>
            <div className="text-xs font-semibold text-gray-800">
              Total: ${(totalCents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Item details grid (spec step 4) -- QBO collapses this section entirely until it has a
            line; "+ Add item lines" is the only thing shown while it's empty. */}
        {itemLines.length === 0 ? (
          <button type="button" className="self-start text-xs font-semibold text-blue-700 hover:underline" onClick={() => addLine("item")}>
            + Add item lines
          </button>
        ) : (
          <div className="rounded border border-gray-200">
            <ParityTable<DraftLine>
              columns={itemColumns}
              rows={itemLines}
              rowKey={(line) => line.key}
              pageSize={itemLines.length || 1}
              hidePager
              enableColumnResize={false}
              enableColumnReorder={false}
            />
            <div className="border-t border-gray-100 px-2 py-2">
              <button type="button" className="text-xs font-semibold text-blue-700 hover:underline" onClick={() => addLine("item")}>
                + Add lines
              </button>
            </div>
          </div>
        )}
          </>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
          <Button variant="tertiary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="tertiary" onClick={resetForm} disabled={saving}>
            Clear
          </Button>
          {/* R-172 step 6 -- Print check: forces print_later (this check gets a number when it's
              actually printed, step 9's queue), then saves and closes like Save and close. Not
              offered for a Bill Payment (Check) -- print_later has no meaning there (step 5). Actual
              PDF rendering/confirm-printed is step 9's own scope, not invented here. */}
          {!isBillPayment ? (
            <Button variant="tertiary" onClick={() => void handleSave("close", true)} disabled={!canSave}>
              Print check
            </Button>
          ) : null}
          <Button variant="tertiary" onClick={() => void handleSave("keep_open")} disabled={!canSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button variant="tertiary" onClick={() => void handleSave("new")} disabled={!canSave}>
            Save and new
          </Button>
          <Button variant="primary" onClick={() => void handleSave("close")} disabled={!canSave}>
            Save and close
          </Button>
        </div>
      </div>
    </Modal>
  );
}
