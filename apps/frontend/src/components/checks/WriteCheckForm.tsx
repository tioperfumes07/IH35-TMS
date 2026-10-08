// R-154 §5 (PR 4/7) — Write Check form. QBO layout inside the shared centered Modal (ROUND 155.11-B,
// PR #22949): payee, bank account, check date, check number / print-later, memo, then a category/item
// line table.
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
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Modal } from "../Modal";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { DriverPickerWithCreate } from "../drivers/DriverPickerWithCreate";
import { EntityPicker } from "../EntityPicker";
import { EntityLink } from "../shared/EntityLink";
import { MoreActionsMenu } from "../shared/MoreActionsMenu";
import { VoidReasonModal } from "../accounting/VoidReasonModal";
import { DatePicker } from "../forms/DatePicker";
import { MoneyInput } from "../forms/MoneyInput";
import { Button } from "../Button";
import { listExpenseCategoryMappings, listVendorBills, type ExpenseCategoryMapRow, type VendorBill } from "../../api/accounting";
import { classesCatalogClient } from "../../api/catalogs-accounting";
import { FuelStopLocationPicker } from "../locations/FuelStopLocationPicker";
import { formatDateUS } from "../../lib/formatDate";
import { getCashGlMapping, getBankingTiles, type CashGlBankAccount } from "../../api/banking";
import { listVendors, listCustomers } from "../../api/mdata";
import { useAccountingItemsQuery } from "../../hooks/useAccountingItemsQuery";
import { UploadZone } from "../UploadZone";
import { useToast } from "../Toast";
import {
  createCheck,
  getCheck,
  getCheckNextNumber,
  getCheckNumberStatus,
  payCheckBills,
  resolveCheckPayeePreview,
  voidCheckApi,
  type CheckLineInput,
  type CheckPayeeKind,
  type CheckRemitToAddress,
} from "../../api/checks";
import { createAccountingRecurringExpenseTemplate } from "../../api/accountingRecurringTemplate";
import { formatUsdCents } from "../../lib/money";

const EMPTY_ADDRESS: CheckRemitToAddress = {
  address_line1: null,
  address_line2: null,
  city: null,
  state: null,
  postal_code: null,
  country: null,
};

function formatMoneyCents(cents: number): string {
  return formatUsdCents(cents);
}

// Payment date defaults to today in Central Time (spec §2) -- the operator's wall-clock browser
// timezone is not authoritative here; the fleet's operating timezone is.
function todayCT(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "America/Chicago" }); // en-CA => YYYY-MM-DD
}

/** B-4 §15 — auto-draft key per company (never sample/fixtures). */
function checkDraftStorageKey(operatingCompanyId: string) {
  return `ih35.check-draft.v1.${operatingCompanyId}`;
}

type PersistedCheckDraft = {
  payeeKind: CheckPayeeKind;
  payeeId: string | null;
  bankAccountId: string | null;
  checkDate: string;
  checkNumber: string;
  printLater: boolean;
  memo: string;
  tagsText: string;
  /** BANK-F91035 — QBO Class (accounting.expenses.class_id), optional. */
  classId: string | null;
  /** BANK-F91037 — QBO Settlement No (accounting.expenses.settlement_no). */
  settlementNo: string;
  /** BANK-F91037 — QBO Location (accounting.expenses.location_id). */
  locationId: string | null;
  savedAt: string;
};

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
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const [payeeKind, setPayeeKind] = useState<CheckPayeeKind>(initialPayee?.kind ?? "vendor");
  const [payeeId, setPayeeId] = useState<string | null>(initialPayee?.id ?? null);
  const [bankAccountId, setBankAccountId] = useState<string | null>(null);
  const [checkDate, setCheckDate] = useState<string>(() => todayCT());
  const [printLater, setPrintLater] = useState(false);
  const [checkNumber, setCheckNumber] = useState<string>("");
  const [memo, setMemo] = useState<string>("");
  const [tagsText, setTagsText] = useState<string>("");
  /** BANK-F91035 — QBO Class header (class_id already on createCheck / expenses). */
  const [classId, setClassId] = useState<string | null>(null);
  /** BANK-F91037 — Settlement No + Location (CLAIM 202615221300). */
  const [settlementNo, setSettlementNo] = useState("");
  const [locationId, setLocationId] = useState<string | null>(null);
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
  // B-4 §15 — auto-draft / Restore draft (local only; never a money write).
  const [restoreDraftOffer, setRestoreDraftOffer] = useState<PersistedCheckDraft | null>(null);
  const [draftHydrated, setDraftHydrated] = useState(false);
  /** BANK-F91041 — ORDERS §B-4 More(Void / Transaction journal / Audit history) after Save. */
  const [lastSavedCheckId, setLastSavedCheckId] = useState<string | null>(null);
  const [lastSavedJournalEntryId, setLastSavedJournalEntryId] = useState<string | null>(null);
  const [voidOpen, setVoidOpen] = useState(false);
  /** BANK-F91055 — ORDERS §B-4 Make recurring → expense template (kind=expense). */
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [recurringCadence, setRecurringCadence] = useState<"weekly" | "biweekly" | "monthly" | "quarterly" | "annually">("monthly");
  const [recurringSaving, setRecurringSaving] = useState(false);

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

  // R-190 — QBO parity: Check no. auto-fills from stock next_check_number and stays editable.
  // Only fills when the field is empty so an operator edit is never overwritten.
  useEffect(() => {
    if (printLater) return;
    const next = nextNumberQuery.data?.next_check_number;
    if (!next) return;
    setCheckNumber((prev) => (prev.trim() === "" ? next : prev));
  }, [nextNumberQuery.data?.next_check_number, printLater, bankAccountId]);

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

  // BANK-F91035 — Class options (same catalog path as VendorBillForm / RecordExpenseForm).
  const classesQuery = useQuery({
    queryKey: ["checks", "classes", operatingCompanyId],
    queryFn: () => classesCatalogClient.list({ operating_company_id: operatingCompanyId, is_active: "true", limit: 200 }),
    enabled: open && Boolean(operatingCompanyId),
    staleTime: 60_000,
  });
  const classOptions = useMemo(
    () =>
      (classesQuery.data?.rows ?? []).map((row) => ({
        value: row.id,
        label: row.display_name || row.code,
        type: row.code,
      })),
    [classesQuery.data?.rows]
  );

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
  // BANK-F91032 — QBO §10 Find Bill No. on Outstanding Transactions / Add to Check (client filter).
  const [billFindQuery, setBillFindQuery] = useState("");
  const billsToPay = openBills.filter((b) => b.id in billToPayAmounts);
  const isBillPayment = billsToPay.length > 0;
  /** ORDERS §B-4 / QBO §10 — Amount to Apply = payments capped to each bill's open balance. */
  const billPaymentApplyCents = useMemo(
    () =>
      billsToPay.reduce((sum, b) => {
        const remaining = Math.max(b.balance_cents ?? b.amount_cents - b.paid_cents, 0);
        const payment = billToPayAmounts[b.id] ?? 0;
        return sum + Math.min(Math.max(payment, 0), remaining);
      }, 0),
    [billsToPay, billToPayAmounts]
  );
  /**
   * BANK-F91033 — Amount to Credit = typed Payment above open balance (QBO overpayment → vendor credit).
   * Live chrome only until pay-bills posts the credit; Save stays disabled while credit > 0.
   */
  const billPaymentCreditCents = useMemo(
    () =>
      billsToPay.reduce((sum, b) => {
        const remaining = Math.max(b.balance_cents ?? b.amount_cents - b.paid_cents, 0);
        const payment = billToPayAmounts[b.id] ?? 0;
        return sum + Math.max(0, payment - remaining);
      }, 0),
    [billsToPay, billToPayAmounts]
  );
  /** Header / Total = Apply + Credit (full check amount the operator typed). */
  const billPaymentTotalCents = billPaymentApplyCents + billPaymentCreditCents;

  function billMatchesFind(bill: VendorBill, query: string): boolean {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    const hay = [bill.display_id, bill.bill_number].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q);
  }

  const filteredBillsToPay = useMemo(
    () => billsToPay.filter((b) => billMatchesFind(b, billFindQuery)),
    [billsToPay, billFindQuery]
  );
  const openBillsNotQueued = useMemo(
    () => openBills.filter((b) => !(b.id in billToPayAmounts) && billMatchesFind(b, billFindQuery)),
    [openBills, billToPayAmounts, billFindQuery]
  );

  function addBillToPay(bill: VendorBill) {
    const remaining = bill.balance_cents ?? bill.amount_cents - bill.paid_cents;
    setBillToPayAmounts((prev) => ({ ...prev, [bill.id]: Math.max(remaining, 0) }));
    // BANK-F91039 — driver-bill / settlement: seed Settlement No from AlwaysTrack source_document_ref when empty.
    if (payeeKind === "driver") {
      const settlementRef = (bill.linked_settlement_display_id ?? "").trim();
      if (settlementRef) {
        setSettlementNo((prev) => (prev.trim() ? prev : settlementRef));
      }
    }
  }
  /** B-4 §9 — Add all open bills for this payee into Outstanding Transactions (respects Find Bill No.). */
  function addAllOpenBillsToPay() {
    setBillToPayAmounts((prev) => {
      const next = { ...prev };
      for (const bill of openBillsNotQueued) {
        if (bill.id in next) continue;
        const remaining = bill.balance_cents ?? bill.amount_cents - bill.paid_cents;
        next[bill.id] = Math.max(remaining, 0);
      }
      return next;
    });
  }
  function removeBillToPay(billId: string) {
    setBillToPayAmounts((prev) => {
      const next = { ...prev };
      delete next[billId];
      return next;
    });
  }
  function clearBillPayments() {
    setBillToPayAmounts({});
  }
  function setBillToPayAmount(billId: string, cents: number) {
    setBillToPayAmounts((prev) => ({ ...prev, [billId]: cents }));
  }
  const billsToPayColumns: Array<ParityColumn<VendorBill>> = [
    {
      key: "id",
      label: "Description",
      sortable: false,
      render: (b) => (
        <span>
          <EntityLink kind="bill" id={b.id} label={b.display_id ?? b.bill_number ?? undefined} />
          {" · "}
          {formatDateUS(b.bill_date)}
        </span>
      ),
    },
    {
      key: "due_date",
      label: "Due date",
      sortable: false,
      render: (b) => formatDateUS((b as { due_date?: string | null }).due_date ?? b.bill_date),
    },
    {
      key: "amount_cents",
      label: "Original amount",
      sortable: false,
      className: "w-28",
      render: (b) => formatMoneyCents(b.amount_cents),
    },
    {
      key: "balance_cents",
      label: "Open balance",
      sortable: false,
      className: "w-28",
      render: (b) => formatMoneyCents(b.balance_cents ?? b.amount_cents - b.paid_cents),
    },
    {
      key: "pay_amount",
      label: "Payment",
      sortable: false,
      className: "w-28",
      render: (b) => {
        return (
          <MoneyInput
            valueCents={billToPayAmounts[b.id] ?? 0}
            onChangeCents={(cents) => setBillToPayAmount(b.id, Math.max(cents ?? 0, 0))}
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
    setBillFindQuery("");
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
  // not sent at all -- the bills ARE the lines. amount_cents on every queued bill must be positive.
  // BANK-F91038 — Payment may exceed open balance (Amount to Credit). Save is enabled; the engine
  // creates a vendor credit for the excess and posts Dr A/P / Cr cash (same accounts as bill_payment).
  const checkLinesReady =
    Boolean(payeeId) &&
    Boolean(bankAccountId) &&
    Boolean(checkDate) &&
    lines.length > 0 &&
    lines.every((l) => (l.kind === "category" ? Boolean(l.categoryMapId) : Boolean(l.itemId)) && (lineAmountCents(l) ?? 0) > 0) &&
    totalCents > 0 &&
    !saving;
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
      billPaymentApplyCents > 0 &&
      billPaymentTotalCents > 0 &&
      !saving
    : checkLinesReady && (printLater || checkNumber.trim().length > 0);
  // ROUND 326 queue item 15: "Print check" forces print_later (the number is assigned when the check is printed), so it
  // must not wait for a typed check number the way Save does.
  const canPrintCheck = !isBillPayment && checkLinesReady;
  // BANK-F91055 — Make recurring for direct expense checks (not bill-payment apps). Needs payee + bank + amount.
  const canMakeRecurring =
    !isBillPayment &&
    Boolean(payeeId) &&
    Boolean(bankAccountId) &&
    totalCents > 0 &&
    (payeeKind === "vendor" || (payeeKind === "driver" && Boolean(vendorIdForBills)));

  const handleMakeRecurring = async () => {
    if (!canMakeRecurring || !payeeId || !bankAccountId) return;
    const ledgerId = bankAccounts.find((a) => a.id === bankAccountId)?.ledger_account_id ?? null;
    if (!ledgerId) {
      pushToast("Bank account has no cash GL mapping — set Cash GL before Make recurring.", "error");
      return;
    }
    const vendorUuid = payeeKind === "vendor" ? payeeId : vendorIdForBills;
    setRecurringSaving(true);
    try {
      const nextRun = new Date();
      nextRun.setUTCDate(nextRun.getUTCDate() + 1);
      const created = await createAccountingRecurringExpenseTemplate({
        operating_company_id: operatingCompanyId,
        template_name: memo.trim() || `Recurring check ${formatMoneyCents(totalCents)}`,
        cadence: recurringCadence,
        next_run_at: nextRun.toISOString(),
        vendor_uuid: vendorUuid,
        amount_cents: totalCents,
        payment_account_uuid: ledgerId,
        memo: memo.trim() || null,
        expense_date: checkDate || null,
      });
      setRecurringOpen(false);
      pushToast("Recurring expense template created", "success");
      navigate(`/accounting/recurring-templates/${created.id}`);
      onClose();
    } catch (err) {
      pushToast(err instanceof Error ? err.message : "Could not create recurring template", "error");
    } finally {
      setRecurringSaving(false);
    }
  };

  function clearPersistedDraft() {
    try {
      localStorage.removeItem(checkDraftStorageKey(operatingCompanyId));
    } catch {
      /* ignore quota / private mode */
    }
    setRestoreDraftOffer(null);
  }

  function resetForm() {
    setPayeeKind("vendor");
    setPayeeId(null);
    setBankAccountId(null);
    setCheckDate(todayCT());
    setPrintLater(false);
    setCheckNumber("");
    setMemo("");
    setTagsText("");
    setClassId(null);
    setSettlementNo("");
    setLocationId(null);
    setRemitToAddress(EMPTY_ADDRESS);
    setAddressEdited(false);
    setLines([newDraftLine()]);
    setBillToPayAmounts({});
    setDraftAttachmentEntityId(crypto.randomUUID());
    setSaveError(null);
    setLastSavedCheckId(null);
    setLastSavedJournalEntryId(null);
    clearPersistedDraft();
  }

  // B-4 §15 — offer Restore draft when opening a blank check (not copy / initial payee).
  useEffect(() => {
    if (!open || !operatingCompanyId || copyFromCheckId || initialPayee) {
      setRestoreDraftOffer(null);
      setDraftHydrated(false);
      return;
    }
    try {
      const raw = localStorage.getItem(checkDraftStorageKey(operatingCompanyId));
      if (!raw) {
        setRestoreDraftOffer(null);
        setDraftHydrated(true);
        return;
      }
      const parsed = JSON.parse(raw) as PersistedCheckDraft;
      if (parsed?.payeeId || parsed?.bankAccountId || parsed?.memo || parsed?.checkNumber) {
        setRestoreDraftOffer(parsed);
      } else {
        setRestoreDraftOffer(null);
      }
    } catch {
      setRestoreDraftOffer(null);
    }
    setDraftHydrated(true);
  }, [open, operatingCompanyId, copyFromCheckId, initialPayee]);

  // Persist a lightweight header draft while the form is open (never lines — avoid stale GL maps).
  useEffect(() => {
    if (!open || !operatingCompanyId || !draftHydrated || restoreDraftOffer) return;
    if (!payeeId && !bankAccountId && !memo.trim() && !checkNumber.trim() && !classId && !settlementNo.trim() && !locationId) return;
    const payload: PersistedCheckDraft = {
      payeeKind,
      payeeId,
      bankAccountId,
      checkDate,
      checkNumber,
      printLater,
      memo,
      tagsText,
      classId,
      settlementNo,
      locationId,
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(checkDraftStorageKey(operatingCompanyId), JSON.stringify(payload));
    } catch {
      /* ignore */
    }
  }, [
    open,
    operatingCompanyId,
    draftHydrated,
    restoreDraftOffer,
    payeeKind,
    payeeId,
    bankAccountId,
    checkDate,
    checkNumber,
    printLater,
    memo,
    tagsText,
    classId,
    settlementNo,
    locationId,
  ]);

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
          amount_cents: billPaymentTotalCents,
          applications: billsToPay.map((b) => ({ bill_id: b.id, amount_cents: billToPayAmounts[b.id] ?? 0 })),
        });
        savedId = result.payment_batch_id;
      } else {
        const created = await saveExpenseCheck(forcePrintLater);
        savedId = created.id;
        setLastSavedCheckId(created.id);
        setLastSavedJournalEntryId(created.journal_entry_id);
      }
      clearPersistedDraft();
      if (after === "new") {
        resetForm();
        setLastSavedCheckId(null);
        setLastSavedJournalEntryId(null);
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

  async function saveExpenseCheck(forcePrintLater: boolean): Promise<{ id: string; journal_entry_id: string | null }> {
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
        class_id: classId,
        settlement_no: settlementNo.trim() || null,
        location_id: locationId,
        // Only send the address when the operator actually edited it -- otherwise the server saves
        // the payee's freshly-resolved address itself, avoiding a stale client copy overwriting it.
        remit_to_address: addressEdited ? remitToAddress : null,
        attachment_draft_id: draftAttachmentEntityId,
        lines: lineInputs,
      });
      return { id: result.id, journal_entry_id: result.journal_entry_id };
  }

  return (
    <>
    <Modal open={open} onClose={onClose} title="Check" modalKind="check-write" sizePreset="xl">
      <div className="flex flex-col gap-4" data-b4-check-creator="1">
        {saveError ? <div className="rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">{saveError}</div> : null}

        {restoreDraftOffer ? (
          <div
            className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-[#E5E7EB] bg-[#F7F8FA] px-2.5 py-2 text-xs text-[#0F1219]"
            data-b4-restore-draft="1"
            data-testid="check-restore-draft-banner"
          >
            <p>You have a draft saved. Restore draft?</p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="primary"
                onClick={() => {
                  const d = restoreDraftOffer;
                  setPayeeKind(d.payeeKind);
                  setPayeeId(d.payeeId);
                  setBankAccountId(d.bankAccountId);
                  setCheckDate(d.checkDate || todayCT());
                  setCheckNumber(d.checkNumber ?? "");
                  setPrintLater(Boolean(d.printLater));
                  setMemo(d.memo ?? "");
                  setTagsText(d.tagsText ?? "");
                  setClassId(d.classId ?? null);
                  setSettlementNo(d.settlementNo ?? "");
                  setLocationId(d.locationId ?? null);
                  setRestoreDraftOffer(null);
                }}
              >
                Restore draft
              </Button>
              <Button type="button" variant="tertiary" onClick={() => clearPersistedDraft()}>
                Discard
              </Button>
            </div>
          </div>
        ) : null}

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

          <label className="text-xs font-semibold text-gray-700" data-b4-who-did-you-pay="1">
            Who did you pay?
            <div className="mt-1">
              {payeeKind === "vendor" || payeeKind === "customer" ? (
                <ReferenceSelect
                  id="check-payee"
                  value={payeeId}
                  onChange={setPayeeId}
                  options={payeeOptions}
                  createKind={payeeKind}
                  operatingCompanyId={operatingCompanyId}
                  placeholder="Who did you pay?"
                />
              ) : payeeKind === "driver" ? (
                <DriverPickerWithCreate operatingCompanyId={operatingCompanyId} value={payeeId} onChange={setPayeeId} shell="drawer" placeholder="Who did you pay?" />
              ) : (
                <input
                  className="h-9 w-full rounded border border-gray-300 px-2 text-xs"
                  placeholder="Who did you pay?"
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
          <div className="rounded border border-gray-200 p-3" data-b4-add-to-check="1">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-gray-700">
                {isBillPayment ? "Outstanding Transactions" : "Add to Check"}
              </div>
              <label className="flex items-center gap-1 text-xs font-semibold text-gray-600" data-b4-find-bill-no="1">
                Find Bill No.
                <input
                  type="search"
                  className="h-7 w-36 rounded border border-gray-300 px-2 text-xs font-normal"
                  value={billFindQuery}
                  onChange={(e) => setBillFindQuery(e.target.value)}
                  placeholder="Bill #"
                  data-testid="b4-find-bill-no"
                  aria-label="Find Bill No."
                />
              </label>
            </div>
            {isBillPayment ? (
              <div className="mb-2 border border-[var(--border-default)] bg-[var(--accent-green-soft)] px-2 py-1.5 text-xs text-[var(--text-primary)]">
                This check will be saved as a Bill Payment (Check) — the category/item lines below are not used.
              </div>
            ) : null}
            {billsToPay.length > 0 ? (
              <div className="mb-2 border border-gray-200">
                <ParityTable<VendorBill>
                  columns={billsToPayColumns}
                  rows={filteredBillsToPay}
                  rowKey={(b) => b.id}
                  emptyText={billFindQuery.trim() ? "No queued bills match this Bill No." : "No bills queued."}
                  pageSize={filteredBillsToPay.length || 1}
                  hidePager
                  enableColumnResize={false}
                  enableColumnReorder={false}
                />
                {/* BANK-F91039 — ORDERS §B-4 §14 driver bill = settlement chrome (read-only linkage from bill → load). */}
                {payeeKind === "driver"
                  ? billsToPay.map((b) => {
                      const openBal = Math.max(b.balance_cents ?? b.amount_cents - b.paid_cents, 0);
                      const truckTrailer = [b.linked_unit_number, b.linked_trailer_number].filter(Boolean).join(" / ") || "—";
                      const emptyMiles =
                        b.linked_empty_miles != null && Number.isFinite(Number(b.linked_empty_miles))
                          ? String(Number(b.linked_empty_miles))
                          : "—";
                      const loadedMiles =
                        b.linked_loaded_miles != null && Number.isFinite(Number(b.linked_loaded_miles))
                          ? String(Number(b.linked_loaded_miles))
                          : "—";
                      return (
                        <div
                          key={`driver-settlement-${b.id}`}
                          className="border-t border-gray-100 px-2 py-2 text-xs text-gray-700"
                          data-b4-driver-settlement-chrome="1"
                          data-testid="b4-driver-settlement-chrome"
                        >
                          <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                            <span className="font-semibold text-gray-800">Driver bill / settlement</span>
                            <span className="flex flex-wrap items-center gap-2">
                              {b.paid_cents > 0 ? (
                                <span
                                  className="rounded-sm border border-gray-300 bg-gray-50 px-1.5 py-0.5 text-xs font-semibold uppercase text-gray-600"
                                  data-b4-driver-payments-made="1"
                                >
                                  Paid to date ({formatMoneyCents(b.paid_cents)})
                                </span>
                              ) : null}
                              <span data-b4-driver-open-balance="1">Open balance: {formatMoneyCents(openBal)}</span>
                            </span>
                          </div>
                          <div className="grid grid-cols-2 gap-x-3 gap-y-1 sm:grid-cols-3 md:grid-cols-4">
                            <div>
                              <div className="text-xs font-semibold uppercase text-gray-600">NB-Load Number</div>
                              <div>{b.linked_load_number ?? "—"}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase text-gray-600">Settlement No</div>
                              <div>{b.linked_settlement_display_id ?? "—"}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase text-gray-600">Truck / Trailer</div>
                              <div>{truckTrailer}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase text-gray-600">Work Order</div>
                              <div>{b.linked_work_order_display_id ?? "—"}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase text-gray-600">Pick Up</div>
                              <div>{b.linked_pickup_date ? formatDateUS(b.linked_pickup_date) : "—"}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase text-gray-600">Delivery</div>
                              <div>{b.linked_delivery_date ? formatDateUS(b.linked_delivery_date) : "—"}</div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase text-gray-600">Empty / Loaded miles</div>
                              <div>
                                {emptyMiles} / {loadedMiles}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs font-semibold uppercase text-gray-600">Origin → Destination</div>
                              <div>
                                {b.linked_origin ?? "—"} → {b.linked_destination ?? "—"}
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  : null}
                <div
                  className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 px-2 py-1.5 text-xs text-gray-700"
                  data-b4-amount-to-apply="1"
                >
                  <span>
                    Amount to Apply: <strong>{formatMoneyCents(billPaymentApplyCents)}</strong>
                  </span>
                  <span data-b4-amount-to-credit="1" data-testid="b4-amount-to-credit">
                    Amount to Credit: <strong>{formatMoneyCents(billPaymentCreditCents)}</strong>
                  </span>
                  <button
                    type="button"
                    className="font-semibold text-[var(--accent-green)] hover:underline"
                    data-b4-clear-payment="1"
                    data-testid="b4-clear-payment"
                    onClick={clearBillPayments}
                  >
                    Clear Payment
                  </button>
                </div>
                {billPaymentCreditCents > 0 ? (
                  <div className="border-t border-slate-200 bg-slate-100 px-2 py-1.5 text-xs text-slate-700" data-b4-credit-hint="1">
                    Payment exceeds open balance by {formatMoneyCents(billPaymentCreditCents)}. On Save the excess becomes a
                    vendor credit (Dr A/P / Cr bank — same accounts as the bill payment).
                  </div>
                ) : null}
              </div>
            ) : null}
            {/* U8 (owner): "Create Check offers no open bills". "No open bills for this payee" also showed when the
                bills were never READ — the payee lookup failed, or the payee has no payable vendor — so a check that
                should have paid a bill was written as an expense and the cost would count twice. Say which. */}
            {openBillsQuery.isError ? (
              <div className="text-xs font-semibold text-red-700" data-testid="check-open-bills-unread">
                Could not read open bills — do not record a bill payment as an expense.
              </div>
            ) : openBillsQuery.isLoading ? (
              <div className="text-xs text-gray-400">Loading open bills…</div>
            ) : openBills.filter((b) => !(b.id in billToPayAmounts)).length === 0 ? (
              <div className="text-xs text-gray-400">{billsToPay.length > 0 ? "No other open bills." : "No open bills for this payee."}</div>
            ) : openBillsNotQueued.length === 0 ? (
              <div className="text-xs text-gray-400">No open bills match this Bill No.</div>
            ) : (
              <div className="max-h-40 overflow-y-auto border border-gray-100">
                {openBillsNotQueued.length > 0 ? (
                  <div className="flex justify-end border-b border-gray-100 px-2 py-1">
                    <button
                      type="button"
                      className="text-xs font-semibold text-[var(--accent-green)] hover:underline"
                      data-b4-add-all="1"
                      data-testid="b4-add-all"
                      onClick={addAllOpenBillsToPay}
                    >
                      Add all
                    </button>
                  </div>
                ) : null}
                {openBillsNotQueued.map((b) => {
                    const remaining = b.balance_cents ?? b.amount_cents - b.paid_cents;
                    return (
                      <div key={b.id} className="flex items-center justify-between border-t border-gray-100 px-2 py-1 text-xs first:border-t-0">
                        <span>
                          <EntityLink kind="bill" id={b.id} label={b.display_id ?? b.bill_number ?? undefined} /> · {formatDateUS(b.bill_date)} · {formatMoneyCents(remaining)}
                        </span>
                        <span className="flex items-center gap-2">
                          <button type="button" className="font-semibold text-[var(--accent-green)] hover:underline" onClick={() => addBillToPay(b)}>
                            Add
                          </button>
                          <Link
                            to={`/accounting/bills/${b.id}`}
                            className="font-semibold text-gray-600 hover:underline"
                            data-b4-open-bill="1"
                            data-testid="b4-open-bill"
                          >
                            Open
                          </Link>
                        </span>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        ) : payeeId ? (
          // U8 (owner): this whole panel used to vanish when the payee had no resolvable vendor or the lookup failed, so
          // Create Check simply "offered no open bills". Say why there is nothing to pay here.
          <div className="rounded border border-gray-200 p-3" data-b4-add-to-check="1">
            {payeePreviewQuery.isError ? (
              <div className="text-xs font-semibold text-red-700" data-testid="check-open-bills-unread">
                Could not read this payee, so its open bills are not listed — do not record a bill payment as an expense.
              </div>
            ) : payeePreviewQuery.isLoading ? (
              <div className="text-xs text-gray-400">Loading open bills…</div>
            ) : (
              <div className="text-xs text-slate-600" data-testid="check-open-bills-no-vendor">
                {payeeKind === "driver"
                  ? "This driver has no linked payable vendor, so their bills cannot be listed here. Link the driver's vendor to pay a bill by check."
                  : "This payee has no bills to pay (only vendors and drivers carry bills)."}
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
                <option key={a.id} value={a.id} disabled={Boolean(a.account_class) && a.account_class !== "depository"}>
                  {a.account_name}
                  {a.account_class && a.account_class !== "depository" ? " — not a checking account" : ""}
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

        {/* BANK-F91037 — Settlement No + Location (CLAIM 202615221300 / ORDERS §B-4). */}
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-semibold text-gray-700" data-b4-check-settlement-no="1">
            Settlement No.
            <input
              className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-xs"
              value={settlementNo}
              onChange={(e) => setSettlementNo(e.target.value)}
              placeholder="AlwaysTrack / settlement #"
              maxLength={40}
              data-testid="b4-check-settlement-no"
            />
          </label>
          <label className="text-xs font-semibold text-gray-700" data-b4-check-location="1">
            Location
            <div className="mt-1" data-testid="b4-check-location">
              <FuelStopLocationPicker
                operatingCompanyId={operatingCompanyId}
                value={locationId}
                fuelStopOnly={false}
                placeholder="Search location…"
                dataTestId="b4-check-location-picker"
                onChange={(id) => setLocationId(id)}
              />
            </div>
          </label>
        </div>

        {/* BANK-F91035 — Class (ORDERS §B-4 / QBO check header; class_id already on createCheck). */}
        <label className="text-xs font-semibold text-gray-700" data-b4-check-class="1">
          Class
          <div className="mt-1" data-testid="b4-check-class">
            <ReferenceSelect
              value={classId}
              onChange={(next) => setClassId(next)}
              options={classOptions}
              createKind="class"
              operatingCompanyId={operatingCompanyId}
              placeholder="Select class…"
              disabled={!operatingCompanyId}
            />
          </div>
        </label>

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
              <button type="button" className="text-xs font-semibold text-[var(--accent-green)] hover:underline" onClick={() => addLine("category")}>
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
          <button type="button" className="self-start text-xs font-semibold text-[var(--accent-green)] hover:underline" onClick={() => addLine("item")}>
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
              <button type="button" className="text-xs font-semibold text-[var(--accent-green)] hover:underline" onClick={() => addLine("item")}>
                + Add lines
              </button>
            </div>
          </div>
        )}
          </>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-gray-200 pt-3">
          {/* BANK-F91041 — ORDERS §B-4 More(Void · Delete=void · Transaction journal · Audit history). Enabled after expense-check Save. */}
          <div data-b4-check-more="1" data-testid="b4-check-more">
            <MoreActionsMenu
              data-testid="check-write-more-menu"
              trigger={({ toggle, triggerTestId }) => (
                <button
                  type="button"
                  className="inline-flex h-7 items-center rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs font-semibold text-[#1F2A44] hover:bg-[#F7F8FA] disabled:opacity-50"
                  onClick={toggle}
                  data-testid={triggerTestId}
                  disabled={!lastSavedCheckId}
                  title={lastSavedCheckId ? "More actions" : "Save the check first to unlock More"}
                >
                  More
                </button>
              )}
              items={[
                {
                  key: "journal",
                  label: "Transaction journal",
                  disabled: !lastSavedJournalEntryId,
                  onSelect: () => {
                    if (lastSavedJournalEntryId) navigate(`/accounting/journal-entries/${lastSavedJournalEntryId}`);
                  },
                },
                {
                  key: "audit",
                  label: "Audit history",
                  disabled: !lastSavedCheckId,
                  onSelect: () => {
                    if (lastSavedCheckId) navigate(`/accounting/audit-trail?source_type=expense&source_id=${lastSavedCheckId}`);
                  },
                },
                {
                  key: "copy",
                  label: "Copy",
                  disabled: !lastSavedCheckId,
                  onSelect: () => {
                    if (lastSavedCheckId) navigate(`/accounting/checks/new?copy_from=${lastSavedCheckId}`);
                  },
                },
                {
                  key: "void",
                  label: "Void",
                  disabled: !lastSavedCheckId,
                  destructive: true,
                  onSelect: () => setVoidOpen(true),
                },
                {
                  key: "delete",
                  label: "Delete",
                  disabled: !lastSavedCheckId,
                  destructive: true,
                  onSelect: () => setVoidOpen(true),
                },
              ]}
            />
          </div>
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
            <Button variant="tertiary" onClick={() => void handleSave("close", true)} disabled={!canPrintCheck}>
              Print check
            </Button>
          ) : null}
          {/* BANK-F91063 — ORDERS §B-4 Order checks ≠ Print check. Opens check-stock settings
              (starting number / style) on the print page, not the bare print queue. */}
          <a
            href="/accounting/checks/print?focus=stock"
            className="inline-flex h-7 items-center rounded-sm border border-[#E5E7EB] bg-white px-2 text-xs text-[#1F2A44] hover:bg-[#F7F8FA]"
            data-b4-order-checks="1"
            data-testid="b4-order-checks"
            title="Set check stock starting number and style for this bank"
            onClick={onClose}
          >
            Order checks
          </a>
          <Button
            type="button"
            variant="tertiary"
            disabled={!canMakeRecurring || recurringSaving}
            title={
              canMakeRecurring
                ? "Create a recurring expense template from this check"
                : "Add a vendor (or driver with vendor), bank account, and amount first"
            }
            data-b4-make-recurring="1"
            data-testid="b4-make-recurring"
            onClick={() => setRecurringOpen(true)}
          >
            Make recurring
          </Button>
          <Button variant="tertiary" onClick={() => void handleSave("keep_open")} disabled={!canSave}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {/* BANK-F91045 — ORDERS §B-4 / QBO §9–§13: [Save] [Save and close ▾] with Save and new / Save and print. */}
          <div className="inline-flex items-stretch" data-b4-save-and-close="1" data-testid="b4-save-and-close">
            <Button
              variant="primary"
              className="rounded-r-none"
              onClick={() => void handleSave("close")}
              disabled={!canSave}
              data-testid="b4-save-and-close-primary"
            >
              Save and close
            </Button>
            <MoreActionsMenu
              data-testid="b4-save-and-close-menu"
              trigger={({ toggle, triggerTestId, open }) => (
                <button
                  type="button"
                  className="inline-flex h-7 items-center rounded-l-none rounded-r-sm border border-l-0 border-[#14314F] bg-[#14314F] px-2 text-xs font-semibold text-white hover:bg-[#1a3d63] disabled:opacity-50"
                  onClick={toggle}
                  disabled={!canSave}
                  aria-expanded={open}
                  aria-label="Save and close options"
                  data-testid={triggerTestId}
                  title="Save and new · Save and print"
                >
                  ▾
                </button>
              )}
              items={[
                {
                  key: "save-and-new",
                  label: "Save and new",
                  disabled: !canSave,
                  onSelect: () => void handleSave("new"),
                },
                {
                  key: "save-and-print",
                  label: "Save and print",
                  disabled: !canPrintCheck,
                  onSelect: () => void handleSave("close", true),
                },
              ]}
            />
          </div>
        </div>
      </div>
    </Modal>
      {/* Sibling overlays — never nest a second Modal shell inside <Modal> (verify-no-nested-modal-frames). */}
      <VoidReasonModal
        open={voidOpen}
        title="Void Check"
        onClose={() => setVoidOpen(false)}
        onSubmit={async (reason) => {
          if (!lastSavedCheckId) return;
          await voidCheckApi(operatingCompanyId, lastSavedCheckId, reason);
          pushToast("Check voided (reversing entry — never deleted).", "success");
          setVoidOpen(false);
          setLastSavedCheckId(null);
          setLastSavedJournalEntryId(null);
          onClose();
        }}
      />
      {/* BANK-F91055 — ORDERS §B-4 Make recurring cadence picker before creating the expense template. */}
      {recurringOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30"
          role="dialog"
          aria-modal="true"
          data-testid="b4-make-recurring-modal"
          data-b4-make-recurring-modal="1"
        >
          <div className="w-full max-w-sm rounded-sm border border-[#E5E7EB] bg-white p-4 shadow-lg">
            <h2 className="text-xs font-bold uppercase tracking-wide text-[#4B5563]">Make recurring</h2>
            <p className="mt-1 text-xs text-[#6B7280]">
              Creates an expense template ({formatMoneyCents(totalCents)}) the recurring worker will mint on cadence.
            </p>
            <label className="mt-3 flex flex-col gap-1 text-xs font-semibold text-[#1F2A44]">
              Cadence
              <select
                className="h-7 rounded-sm border border-[#E5E7EB] px-2 text-xs"
                value={recurringCadence}
                onChange={(e) => setRecurringCadence(e.target.value as typeof recurringCadence)}
                data-testid="b4-make-recurring-cadence"
              >
                <option value="weekly">Weekly</option>
                <option value="biweekly">Every two weeks</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annually">Annually</option>
              </select>
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="tertiary" size="sm" onClick={() => setRecurringOpen(false)} disabled={recurringSaving}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => void handleMakeRecurring()}
                disabled={recurringSaving}
                data-testid="b4-make-recurring-confirm"
              >
                {recurringSaving ? "Saving…" : "Create template"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
