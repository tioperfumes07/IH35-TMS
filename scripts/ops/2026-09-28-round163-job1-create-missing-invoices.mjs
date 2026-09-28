// AUTH-099 — ROUND 163 JOB 1: create the missing invoices proven against the QBO control file
// (USMCA Freight Solutions, Inc._Invoice List by Date.csv, Aug 7 - Sep 27 2026), through the real
// sanctioned engine (buildInvoiceFromLoad -> sendDraftInvoice, mode="historical_backfill" since
// these are real, already-happened transactions, not a live feed).
//
// SCOPE, after full row-by-row reconciliation (both embedded CSV tables parsed, every row's
// amount cross-checked): of 128 total CSV invoice rows, only 5 are BOTH (a) tied to a real,
// populated LOAD number our DB also has, (b) not already issued in our DB, and (c) in full
// customer-name + amount agreement between QBO and our own load record -- the only condition
// under which minting through buildInvoiceFromLoad (which derives customer_id and amount from the
// load itself, never from caller-supplied values) reproduces the QBO row exactly:
//   13503 Semares Forwarding Services   $4,900.00
//   13504 Semares Forwarding Services   $4,900.00
//   13509 ES Logistics International LLC $4,400.00
//   13533 Refrigerx Transportation LLC  $3,450.00
//   13539 Refrigerx Transportation LLC  $4,860.00
// Three more (13505, 13506, 13507) have a REAL, unexplained customer/amount mismatch between QBO
// and our own load record (looks like a 13506/13507 customer+rate swap) -- NOT created here;
// reported separately, never guessed at.
// 72 more CSV rows have LOAD blank (or a text placeholder like "NOT PURCHASED") -- per the order's
// own instruction, never assumed from the Num suffix; reported separately as unmatched.
// 1 row (BBA Logistics LLC / load 13530) carries "TRANSPORTATION" in Location full name -- QBO's
// own record of a different billing entity; excluded, not USMCA's.
import { register } from "tsx/esm/api";
register();
const { withCurrentUser } = await import("../../apps/backend/src/auth/db.ts");
const { setScopedCompanyContext } = await import("../../apps/backend/src/_helpers/scoped-company-context.ts");
const { buildInvoiceFromLoad } = await import("../../apps/backend/src/accounting/from-load.ts");
const { sendDraftInvoice } = await import("../../apps/backend/src/accounting/invoice-send.service.ts");

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";

const TARGETS = [
  { loadNumber: "13503", qboAmount: 490000, qboCustomer: "Semares Forwarding Services" },
  { loadNumber: "13504", qboAmount: 490000, qboCustomer: "Semares Forwarding Services" },
  { loadNumber: "13509", qboAmount: 440000, qboCustomer: "ES Logistics International LLC" },
  { loadNumber: "13533", qboAmount: 345000, qboCustomer: "Refrigerx Transportation LLC" },
  { loadNumber: "13539", qboAmount: 486000, qboCustomer: "Refrigerx Transportation LLC" },
];

async function main() {
  const results = [];
  for (const t of TARGETS) {
    const result = await withCurrentUser(OWNER, async (client) => {
      await setScopedCompanyContext(client, OWNER, USMCA);
      const loadRes = await client.query(
        `SELECT id::text, rate_total_cents FROM mdata.loads WHERE load_number = $1 AND operating_company_id = $2::uuid`,
        [t.loadNumber, USMCA]
      );
      const load = loadRes.rows[0];
      if (!load) return { skipped: "load not found" };
      if (Number(load.rate_total_cents) !== t.qboAmount) {
        return { skipped: `rate mismatch: DB=${load.rate_total_cents} QBO=${t.qboAmount} -- refusing, not guessing` };
      }

      const built = await buildInvoiceFromLoad(client, {
        userId: OWNER,
        operatingCompanyId: USMCA,
        loadId: load.id,
        asProforma: false,
      });
      if (built.idempotent) {
        return { already_existed: true, invoice_id: built.invoice.id, status: built.invoice.status };
      }

      const sent = await sendDraftInvoice(client, {
        invoiceId: String(built.invoice.id),
        operatingCompanyId: USMCA,
        userId: OWNER,
        mode: "historical_backfill",
      });

      return {
        created: true,
        invoice_id: built.invoice.id,
        display_id: built.invoice.display_id,
        total_cents: built.line?.line_total_cents ?? null,
        send_result: sent,
      };
    });
    console.log(`${t.loadNumber}: ${JSON.stringify(result)}`);
    results.push({ loadNumber: t.loadNumber, result });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
