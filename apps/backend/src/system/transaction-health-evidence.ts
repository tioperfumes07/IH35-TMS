/**
 * TXH-03 — computed-at-read-time GL lines + wiring-map links for Transaction Health.
 * SELECT only. No INSERT/UPDATE/DELETE. No stored health column.
 */
import type {
  TxHealthClient,
  TxHealthDocType,
  TxHealthGl,
  TxHealthGlLine,
  TxHealthLink,
  TxHealthLinkGroup,
  TxHealthLinkState,
  TxHealthRow,
} from "./transaction-health.types.js";

/** Document types that must never carry journal_entry_postings. Empty by design today. */
const TYPES_WITHOUT_GL = new Set<TxHealthDocType>();

type GlRaw = {
  doc_id: string;
  journal_entry_id: string | null;
  account_id: string | null;
  account_code: string | null;
  account_name: string | null;
  amount_cents: string | number | null;
  debit_or_credit: string | null;
  line_sequence: number | null;
};

function cents(v: string | number | null | undefined): number {
  if (v == null || v === "") return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isDebit(flag: string | null | undefined): boolean {
  const v = String(flag ?? "").trim().toLowerCase();
  return v === "debit" || v === "dr";
}

function isCredit(flag: string | null | undefined): boolean {
  const v = String(flag ?? "").trim().toLowerCase();
  return v === "credit" || v === "cr";
}

function idsOf(rows: TxHealthRow[], type: TxHealthDocType): string[] {
  return rows.filter((r) => r.doc_type === type).map((r) => r.id);
}

function mkLink(opts: {
  group: TxHealthLinkGroup;
  label: string;
  target_type: string;
  target_id: string | null;
  target_label: string | null;
  required: boolean;
  state?: TxHealthLinkState;
}): TxHealthLink {
  let state: TxHealthLinkState = opts.state ?? "missing";
  if (!opts.state) {
    if (opts.target_id) state = "wired";
    else if (!opts.required) state = "not_applicable";
    else state = "missing";
  }
  return {
    group: opts.group,
    label: opts.label,
    target_type: opts.target_type,
    target_id: opts.target_id,
    target_label: opts.target_label,
    state,
  };
}

function linesToGl(raw: GlRaw[]): { gl: TxHealthGl; jeIds: string[]; accountLinks: TxHealthLink[] } {
  const lines: TxHealthGlLine[] = raw
    .slice()
    .sort((a, b) => (a.line_sequence ?? 0) - (b.line_sequence ?? 0))
    .map((r) => {
      const amt = cents(r.amount_cents);
      const dr = isDebit(r.debit_or_credit) ? amt : 0;
      const cr = isCredit(r.debit_or_credit) ? amt : 0;
      return {
        account_code: r.account_code ?? "",
        account_name: r.account_name ?? "",
        account_id: r.account_id,
        dr,
        cr,
      };
    });
  const dr_total = lines.reduce((s, l) => s + l.dr, 0);
  const cr_total = lines.reduce((s, l) => s + l.cr, 0);
  const gl: TxHealthGl = { lines, dr_total, cr_total, balanced: dr_total === cr_total };
  const jeIds = [...new Set(raw.map((r) => r.journal_entry_id).filter((x): x is string => Boolean(x)))];
  const seen = new Set<string>();
  const accountLinks: TxHealthLink[] = [];
  for (const r of raw) {
    if (!r.account_id || seen.has(r.account_id)) continue;
    seen.add(r.account_id);
    accountLinks.push(
      mkLink({
        group: "GENERAL LEDGER",
        label: r.account_code || r.account_name || "Account",
        target_type: "catalogs.accounts",
        target_id: r.account_id,
        target_label: r.account_name,
        required: true,
        state: "wired",
      })
    );
  }
  return { gl, jeIds, accountLinks };
}

const GL_LINE_SELECT = `
  p.journal_entry_uuid::text AS journal_entry_id,
  a.id::text AS account_id,
  a.account_number AS account_code,
  a.account_name,
  p.amount_cents,
  p.debit_or_credit,
  p.line_sequence
`;

async function loadSourceTypeGl(
  client: TxHealthClient,
  types: TxHealthDocType[],
  ids: string[]
): Promise<Map<string, GlRaw[]>> {
  const out = new Map<string, GlRaw[]>();
  if (ids.length === 0) return out;
  const res = await client.query<GlRaw & { doc_id: string }>(
    `
      SELECT p.source_transaction_id AS doc_id, ${GL_LINE_SELECT}
      FROM accounting.journal_entry_postings p
      LEFT JOIN catalogs.accounts a ON a.id = p.account_id
      WHERE p.source_transaction_type = ANY($1::text[])
        AND p.source_transaction_id = ANY($2::text[])
      ORDER BY p.line_sequence
    `,
    [types, ids]
  );
  for (const row of res.rows) {
    const list = out.get(row.doc_id) ?? [];
    list.push(row);
    out.set(row.doc_id, list);
  }
  return out;
}

async function loadJeGl(client: TxHealthClient, ids: string[]): Promise<Map<string, GlRaw[]>> {
  const out = new Map<string, GlRaw[]>();
  if (ids.length === 0) return out;
  const res = await client.query<GlRaw & { doc_id: string }>(
    `
      SELECT p.journal_entry_uuid::text AS doc_id, ${GL_LINE_SELECT}
      FROM accounting.journal_entry_postings p
      LEFT JOIN catalogs.accounts a ON a.id = p.account_id
      WHERE p.journal_entry_uuid = ANY($1::uuid[])
      ORDER BY p.line_sequence
    `,
    [ids]
  );
  for (const row of res.rows) {
    const list = out.get(row.doc_id) ?? [];
    list.push(row);
    out.set(row.doc_id, list);
  }
  return out;
}

async function loadExpenseGl(client: TxHealthClient, ids: string[]): Promise<Map<string, GlRaw[]>> {
  const out = new Map<string, GlRaw[]>();
  if (ids.length === 0) return out;
  const res = await client.query<GlRaw & { doc_id: string }>(
    `
      SELECT e.id::text AS doc_id, ${GL_LINE_SELECT}
      FROM accounting.expenses e
      JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = e.journal_entry_id
      LEFT JOIN catalogs.accounts a ON a.id = p.account_id
      WHERE e.id = ANY($1::uuid[])
      ORDER BY p.line_sequence
    `,
    [ids]
  );
  for (const row of res.rows) {
    const list = out.get(row.doc_id) ?? [];
    list.push(row);
    out.set(row.doc_id, list);
  }
  return out;
}

async function loadSettlementGl(client: TxHealthClient, ids: string[]): Promise<Map<string, GlRaw[]>> {
  const out = new Map<string, GlRaw[]>();
  if (ids.length === 0) return out;
  const res = await client.query<GlRaw & { doc_id: string }>(
    `
      SELECT s.id::text AS doc_id, ${GL_LINE_SELECT}
      FROM driver_finance.driver_settlements s
      JOIN accounting.journal_entry_postings p
        ON p.source_transaction_type = 'bill' AND p.source_transaction_id = s.accounting_bill_id::text
      LEFT JOIN catalogs.accounts a ON a.id = p.account_id
      WHERE s.id = ANY($1::uuid[])
      ORDER BY p.line_sequence
    `,
    [ids]
  );
  for (const row of res.rows) {
    const list = out.get(row.doc_id) ?? [];
    list.push(row);
    out.set(row.doc_id, list);
  }
  return out;
}

async function loadFactoringGl(client: TxHealthClient, ids: string[]): Promise<Map<string, GlRaw[]>> {
  const out = new Map<string, GlRaw[]>();
  if (ids.length === 0) return out;
  const res = await client.query<GlRaw & { doc_id: string }>(
    `
      SELECT fb.id::text AS doc_id, ${GL_LINE_SELECT}
      FROM factoring.batch fb
      JOIN accounting.invoices fi
        ON fi.id = ANY (fb.invoice_ids) AND fi.operating_company_id = fb.operating_company_id
      JOIN accounting.factoring_advances fa ON fa.id = fi.factoring_advance_id
      JOIN accounting.journal_entry_postings p
        ON p.source_transaction_type = 'factoring_advance' AND p.source_transaction_id = fa.id::text
      LEFT JOIN catalogs.accounts a ON a.id = p.account_id
      WHERE fb.id = ANY($1::uuid[])
      ORDER BY p.line_sequence
    `,
    [ids]
  );
  for (const row of res.rows) {
    const list = out.get(row.doc_id) ?? [];
    list.push(row);
    out.set(row.doc_id, list);
  }
  return out;
}

function byId<T extends { doc_id: string }>(rows: T[]): Map<string, T> {
  const m = new Map<string, T>();
  for (const r of rows) m.set(r.doc_id, r);
  return m;
}

export async function enrichTxHealthEvidence(client: TxHealthClient, rows: TxHealthRow[]): Promise<TxHealthRow[]> {
  if (rows.length === 0) return rows;

  const sourceTypes: TxHealthDocType[] = ["invoice", "bill", "bill_payment", "customer_payment"];
  const sourceIds = rows.filter((r) => sourceTypes.includes(r.doc_type)).map((r) => r.id);

  const [sourceGl, jeGl, expenseGl, settlementGl, factoringGl] = await Promise.all([
    loadSourceTypeGl(client, sourceTypes, sourceIds),
    loadJeGl(client, idsOf(rows, "journal_entry")),
    loadExpenseGl(client, idsOf(rows, "expense")),
    loadSettlementGl(client, idsOf(rows, "settlement")),
    loadFactoringGl(client, idsOf(rows, "factoring_batch")),
  ]);

  const glByDoc = new Map<string, GlRaw[]>();
  const merge = (m: Map<string, GlRaw[]>) => {
    for (const [k, v] of m) glByDoc.set(k, v);
  };
  merge(sourceGl);
  merge(jeGl);
  merge(expenseGl);
  merge(settlementGl);
  merge(factoringGl);

  const invoiceIds = idsOf(rows, "invoice");
  const billIds = idsOf(rows, "bill");
  const billPaymentIds = idsOf(rows, "bill_payment");
  const paymentIds = idsOf(rows, "customer_payment");
  const expenseIds = idsOf(rows, "expense");
  const factoringIds = idsOf(rows, "factoring_batch");
  const settlementIds = idsOf(rows, "settlement");

  const [invoiceCustomers, billVendors, billPays, custPays, expenses, factoringVendors, settlements] = await Promise.all([
    invoiceIds.length
      ? client.query<{ doc_id: string; customer_id: string | null; customer_name: string | null }>(
          `
            SELECT i.id::text AS doc_id, i.customer_id::text AS customer_id, c.customer_name
            FROM accounting.invoices i
            LEFT JOIN mdata.customers c ON c.id = i.customer_id
            WHERE i.id = ANY($1::uuid[])
          `,
          [invoiceIds]
        )
      : Promise.resolve({ rows: [] }),
    billIds.length
      ? client.query<{ doc_id: string; vendor_id: string | null; vendor_name: string | null }>(
          `
            SELECT b.id::text AS doc_id,
                   COALESCE(b.mdata_vendor_id::text, b.vendor_uuid::text) AS vendor_id,
                   v.vendor_name
            FROM accounting.bills b
            LEFT JOIN mdata.vendors v
              ON v.id::text = COALESCE(b.mdata_vendor_id::text, b.vendor_uuid::text)
            WHERE b.id = ANY($1::uuid[])
          `,
          [billIds]
        )
      : Promise.resolve({ rows: [] }),
    billPaymentIds.length
      ? client.query<{ doc_id: string; bill_id: string | null; bill_label: string | null }>(
          `
            SELECT bp.id::text AS doc_id, bp.bill_id::text AS bill_id,
                   COALESCE(b.display_id, b.id::text) AS bill_label
            FROM accounting.bill_payments bp
            LEFT JOIN accounting.bills b ON b.id = bp.bill_id
            WHERE bp.id = ANY($1::uuid[])
          `,
          [billPaymentIds]
        )
      : Promise.resolve({ rows: [] }),
    paymentIds.length
      ? client.query<{ doc_id: string; customer_id: string | null; customer_name: string | null }>(
          `
            SELECT py.id::text AS doc_id, py.customer_id::text AS customer_id, c.customer_name
            FROM accounting.payments py
            LEFT JOIN mdata.customers c ON c.id = py.customer_id
            WHERE py.id = ANY($1::uuid[])
          `,
          [paymentIds]
        )
      : Promise.resolve({ rows: [] }),
    expenseIds.length
      ? client.query<{
          doc_id: string;
          vendor_id: string | null;
          vendor_name: string | null;
          driver_id: string | null;
          driver_name: string | null;
          load_id: string | null;
          load_number: string | null;
        }>(
          `
            SELECT e.id::text AS doc_id,
                   e.vendor_uuid::text AS vendor_id,
                   v.vendor_name,
                   e.driver_uuid::text AS driver_id,
                   NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS driver_name,
                   e.load_id::text AS load_id,
                   l.load_number
            FROM accounting.expenses e
            LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid
            LEFT JOIN mdata.drivers d ON d.id = e.driver_uuid
            LEFT JOIN mdata.loads l ON l.id = e.load_id
            WHERE e.id = ANY($1::uuid[])
          `,
          [expenseIds]
        )
      : Promise.resolve({ rows: [] }),
    factoringIds.length
      ? client.query<{ doc_id: string; vendor_id: string | null; vendor_name: string | null }>(
          `
            SELECT fb.id::text AS doc_id, fb.factor_id::text AS vendor_id, v.vendor_name
            FROM factoring.batch fb
            LEFT JOIN mdata.vendors v ON v.id = fb.factor_id
            WHERE fb.id = ANY($1::uuid[])
          `,
          [factoringIds]
        )
      : Promise.resolve({ rows: [] }),
    settlementIds.length
      ? client.query<{
          doc_id: string;
          driver_id: string | null;
          driver_name: string | null;
          bill_id: string | null;
          bill_label: string | null;
        }>(
          `
            SELECT s.id::text AS doc_id,
                   s.driver_id::text AS driver_id,
                   NULLIF(TRIM(CONCAT_WS(' ', d.first_name, d.last_name)), '') AS driver_name,
                   s.accounting_bill_id::text AS bill_id,
                   COALESCE(b.display_id, b.id::text) AS bill_label
            FROM driver_finance.driver_settlements s
            LEFT JOIN mdata.drivers d ON d.id = s.driver_id
            LEFT JOIN accounting.bills b ON b.id = s.accounting_bill_id
            WHERE s.id = ANY($1::uuid[])
          `,
          [settlementIds]
        )
      : Promise.resolve({ rows: [] }),
  ]);

  const invCust = byId(invoiceCustomers.rows);
  const billVend = byId(billVendors.rows);
  const bpMap = byId(billPays.rows);
  const payMap = byId(custPays.rows);
  const expMap = byId(expenses.rows);
  const facMap = byId(factoringVendors.rows);
  const setMap = byId(settlements.rows);

  return rows.map((row) => {
    const rawLines = glByDoc.get(row.id) ?? [];
    const withoutGl = TYPES_WITHOUT_GL.has(row.doc_type);
    const findings = [...row.findings];
    if (withoutGl && rawLines.length > 0) {
      findings.push({
        id: `unexpected_gl_posting:${row.doc_type}:${row.id}`,
        finding_type: "unexpected_gl_posting",
        severity: "critical",
      });
    }

    let gl: TxHealthGl;
    let accountLinks: TxHealthLink[] = [];
    let jeIds: string[] = [];
    if (withoutGl && rawLines.length === 0) {
      gl = null;
    } else {
      const packed = linesToGl(rawLines);
      gl = packed.gl;
      accountLinks = packed.accountLinks;
      jeIds = packed.jeIds;
    }

    const links: TxHealthLink[] = [...accountLinks];

    if (row.doc_type === "journal_entry") {
      links.push(
        mkLink({
          group: "GENERAL LEDGER",
          label: "Journal entry",
          target_type: "accounting.journal_entries",
          target_id: row.id,
          target_label: row.display_label,
          required: true,
          state: "wired",
        })
      );
      links.push(
        mkLink({
          group: "MASTER DATA",
          label: "Vendor",
          target_type: "mdata.vendors",
          target_id: null,
          target_label: null,
          required: false,
          state: "not_applicable",
        })
      );
    } else if (!withoutGl) {
      const jeId = jeIds[0] ?? null;
      if (jeId) {
        links.push(
          mkLink({
            group: "GENERAL LEDGER",
            label: "Journal entry",
            target_type: "accounting.journal_entries",
            target_id: jeId,
            target_label: jeId,
            required: true,
            state: "wired",
          })
        );
      } else if (row.checks.posted === false && rawLines.length === 0) {
        links.push(
          mkLink({
            group: "GENERAL LEDGER",
            label: "Journal entry",
            target_type: "accounting.journal_entries",
            target_id: null,
            target_label: null,
            required: true,
            state: "missing",
          })
        );
      }
    }

    if (row.doc_type === "invoice") {
      const rec = invCust.get(row.id);
      links.push(
        mkLink({
          group: "MASTER DATA",
          label: "Customer",
          target_type: "mdata.customers",
          target_id: rec?.customer_id ?? null,
          target_label: rec?.customer_name ?? null,
          required: true,
        })
      );
      links.push(
        mkLink({
          group: "OPERATIONS",
          label: "Load",
          target_type: "mdata.loads",
          target_id: null,
          target_label: null,
          required: false,
          state: "not_applicable",
        })
      );
    }

    if (row.doc_type === "bill") {
      const rec = billVend.get(row.id);
      links.push(
        mkLink({
          group: "MASTER DATA",
          label: "Vendor",
          target_type: "mdata.vendors",
          target_id: rec?.vendor_id ?? null,
          target_label: rec?.vendor_name ?? null,
          required: true,
        })
      );
    }

    if (row.doc_type === "bill_payment") {
      const rec = bpMap.get(row.id);
      links.push(
        mkLink({
          group: "OPERATIONS",
          label: "Bill",
          target_type: "accounting.bills",
          target_id: rec?.bill_id ?? null,
          target_label: rec?.bill_label ?? null,
          required: true,
        })
      );
    }

    if (row.doc_type === "customer_payment") {
      const rec = payMap.get(row.id);
      links.push(
        mkLink({
          group: "MASTER DATA",
          label: "Customer",
          target_type: "mdata.customers",
          target_id: rec?.customer_id ?? null,
          target_label: rec?.customer_name ?? null,
          required: true,
        })
      );
    }

    if (row.doc_type === "expense") {
      const rec = expMap.get(row.id);
      const anyPresent = Boolean(rec?.vendor_id || rec?.driver_id || rec?.load_id);
      const required = !anyPresent;
      links.push(
        mkLink({
          group: "MASTER DATA",
          label: "Vendor",
          target_type: "mdata.vendors",
          target_id: rec?.vendor_id ?? null,
          target_label: rec?.vendor_name ?? null,
          required,
        })
      );
      links.push(
        mkLink({
          group: "MASTER DATA",
          label: "Driver",
          target_type: "mdata.drivers",
          target_id: rec?.driver_id ?? null,
          target_label: rec?.driver_name ?? null,
          required,
        })
      );
      links.push(
        mkLink({
          group: "OPERATIONS",
          label: "Load",
          target_type: "mdata.loads",
          target_id: rec?.load_id ?? null,
          target_label: rec?.load_number ?? null,
          required,
        })
      );
    }

    if (row.doc_type === "factoring_batch") {
      const rec = facMap.get(row.id);
      links.push(
        mkLink({
          group: "MASTER DATA",
          label: "Vendor",
          target_type: "mdata.vendors",
          target_id: rec?.vendor_id ?? null,
          target_label: rec?.vendor_name ?? null,
          required: true,
        })
      );
    }

    if (row.doc_type === "settlement") {
      const rec = setMap.get(row.id);
      links.push(
        mkLink({
          group: "MASTER DATA",
          label: "Driver",
          target_type: "mdata.drivers",
          target_id: rec?.driver_id ?? null,
          target_label: rec?.driver_name ?? null,
          required: true,
        })
      );
      links.push(
        mkLink({
          group: "OPERATIONS",
          label: "Bill",
          target_type: "accounting.bills",
          target_id: rec?.bill_id ?? null,
          target_label: rec?.bill_label ?? null,
          required: true,
        })
      );
    }

    const coreFail = !row.checks.posted || !row.checks.balanced || !row.checks.linked;
    const status: TxHealthRow["status"] = coreFail
      ? "FAIL"
      : row.checks.sample_consistent === false || findings.length > 0
        ? "WARN"
        : "OK";

    return { ...row, gl, links, findings, status };
  });
}
