/**
 * BATCH TRANSACTIONS — pure row logic (Lead 2026-10-01, owner QBO spec §23 "Batch transactions":
 * "One spreadsheet-style grid to enter MANY documents of one type at once … paste from a spreadsheet;
 * duplicate a row; fill-down; validation per cell before Save; Save posts every row as its own
 * document in one batch; errors keep the row unsaved with the reason.")
 * No DOM, no network — unit-tested on its own.
 */
export type BatchExpenseRow = {
  key: string;
  date: string; // YYYY-MM-DD
  payee: string; // vendor id ("" = none)
  payeeText: string; // pasted name, resolved to payee by the page
  paymentAccount: string; // catalogs.accounts id (bank / credit card / cash)
  paymentMethod: "ach" | "card" | "check" | "wire" | "cash" | "";
  refNo: string; // vendor document / check number
  amount: string; // dollars as typed
  category: string; // catalogs.accounts id (expense account)
  categoryText: string;
  classId: string; // unit / class
  classText: string;
  loadNumber: string;
  memo: string;
  status: "draft" | "saving" | "saved" | "error";
  error: string | null;
  expenseId: string | null;
  /** FEED GATE result handed back by the create endpoint (intake id, status, red count) — shown per saved row. */
  feedGate: { intake_id: string; status: string; checks_failed: number; checks_total: number } | null;
};

export type BatchExpenseField = keyof Pick<BatchExpenseRow, "date" | "payee" | "paymentAccount" | "paymentMethod" | "refNo" | "amount" | "category" | "classId" | "loadNumber" | "memo">;

let seq = 0;
export function newRow(partial: Partial<BatchExpenseRow> = {}): BatchExpenseRow {
  seq += 1;
  return {
    key: `r${Date.now().toString(36)}${seq}`,
    date: "", payee: "", payeeText: "", paymentAccount: "", paymentMethod: "", refNo: "", amount: "",
    category: "", categoryText: "", classId: "", classText: "", loadNumber: "", memo: "",
    status: "draft", error: null, expenseId: null, feedGate: null, ...partial,
  };
}

export function dollarsToCents(v: string): number {
  const n = Number(String(v).replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

/** Normalize many spreadsheet date spellings to YYYY-MM-DD; "" when unparseable. */
export function normalizeDate(v: string): string {
  const s = v.trim();
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(s);
  if (m) {
    const y = m[3]!.length === 2 ? `20${m[3]}` : m[3]!;
    return `${y}-${m[1]!.padStart(2, "0")}-${m[2]!.padStart(2, "0")}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** Per-cell validation. Returns {} when the row is ready to post. */
export function validateRow(r: BatchExpenseRow): Partial<Record<BatchExpenseField, string>> {
  const e: Partial<Record<BatchExpenseField, string>> = {};
  if (!r.date) e.date = "Date required";
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date)) e.date = "Use YYYY-MM-DD";
  if (!r.paymentAccount) e.paymentAccount = "Paid from (bank / card / cash) required";
  if (!r.paymentMethod) e.paymentMethod = "Payment method required";
  const cents = dollarsToCents(r.amount);
  if (!r.amount) e.amount = "Amount required";
  else if (!Number.isFinite(cents)) e.amount = "Not a number";
  else if (cents <= 0) e.amount = "Must be > 0";
  if (!r.category) e.category = r.categoryText ? `No account named "${r.categoryText}"` : "Category (expense account) required";
  if (r.payeeText && !r.payee) e.payee = `No vendor named "${r.payeeText}"`;
  if (r.classText && !r.classId) e.classId = `No class/unit named "${r.classText}"`;
  if (r.paymentMethod === "check" && !r.refNo.trim()) e.refNo = "Check number required for a check";
  return e;
}

export function isRowEmpty(r: BatchExpenseRow): boolean {
  return !r.date && !r.payee && !r.payeeText && !r.amount && !r.category && !r.categoryText && !r.memo && !r.refNo;
}

/** Column order for paste-from-sheet (QBO batch grid order): Date | Payee | Paid from | Method | Ref no. | Amount | Category | Class | Load | Memo */
export const PASTE_COLUMNS: BatchExpenseField[] = ["date", "payee", "paymentAccount", "paymentMethod", "refNo", "amount", "category", "classId", "loadNumber", "memo"];

type Resolvers = {
  vendorByName: (name: string) => string | null;
  accountByName: (name: string) => string | null;
  paymentAccountByName: (name: string) => string | null;
  classByName: (name: string) => string | null;
};

/** Parse TSV/CSV clipboard text into rows. Names are resolved to ids when they match; unresolved names are kept as text for the cell error. */
export function parsePastedRows(text: string, resolve: Resolvers): BatchExpenseRow[] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim().length > 0);
  const rows: BatchExpenseRow[] = [];
  for (const line of lines) {
    const cells = line.includes("\t") ? line.split("\t") : line.split(",");
    const get = (i: number) => (cells[i] ?? "").trim();
    if (/^date$/i.test(get(0))) continue; // header row
    const payeeText = get(1);
    const payAcctText = get(2);
    const method = get(3).toLowerCase();
    const categoryText = get(6);
    const classText = get(7);
    rows.push(newRow({
      date: normalizeDate(get(0)),
      payeeText, payee: payeeText ? resolve.vendorByName(payeeText) ?? "" : "",
      paymentAccount: payAcctText ? resolve.paymentAccountByName(payAcctText) ?? "" : "",
      paymentMethod: (["ach", "card", "check", "wire", "cash"] as const).find((m) => m === method) ?? "",
      refNo: get(4),
      amount: get(5),
      categoryText, category: categoryText ? resolve.accountByName(categoryText) ?? "" : "",
      classText, classId: classText ? resolve.classByName(classText) ?? "" : "",
      loadNumber: get(8),
      memo: get(9),
    }));
  }
  return rows;
}

/** Fill-down: copy a field from one row into every row below that has it blank. */
export function fillDown(rows: BatchExpenseRow[], field: BatchExpenseField, fromIndex: number): BatchExpenseRow[] {
  const src = rows[fromIndex];
  if (!src) return rows;
  const value = src[field];
  return rows.map((r, i) =>
    i > fromIndex && !r[field] && r.status !== "saved"
      ? { ...r, [field]: value, ...(field === "payee" ? { payeeText: src.payeeText } : {}), ...(field === "category" ? { categoryText: src.categoryText } : {}), ...(field === "classId" ? { classText: src.classText } : {}) }
      : r,
  );
}

export function duplicateRow(rows: BatchExpenseRow[], index: number): BatchExpenseRow[] {
  const src = rows[index];
  if (!src) return rows;
  const { key: _key, ...rest } = src;
  const copy = newRow({ ...rest, status: "draft", error: null, expenseId: null, feedGate: null, refNo: "" });
  return [...rows.slice(0, index + 1), copy, ...rows.slice(index + 1)];
}

export function batchTotals(rows: BatchExpenseRow[]) {
  const live = rows.filter((r) => !isRowEmpty(r));
  const cents = live.reduce((s, r) => { const c = dollarsToCents(r.amount); return s + (Number.isFinite(c) && c > 0 ? c : 0); }, 0);
  const ready = live.filter((r) => r.status !== "saved" && Object.keys(validateRow(r)).length === 0).length;
  const saved = live.filter((r) => r.status === "saved").length;
  const errors = live.filter((r) => r.status !== "saved" && Object.keys(validateRow(r)).length > 0).length;
  return { rows: live.length, cents, ready, saved, errors };
}
