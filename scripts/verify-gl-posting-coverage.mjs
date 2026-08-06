#!/usr/bin/env node
/**
 * RATCHET — verify-gl-posting-coverage (CLS-GL-DARK · ACCT-F122)
 *
 * THE ONE QUESTION: has every money event that IS SUPPOSED TO POST actually reached the ledger?
 *
 * WHY THE SCOPE IS THE WHOLE DESIGN. The naive version of this guard — "every bill/invoice/payment
 * must have a journal entry" — is not merely noisy, it is WRONG, and shipping it would have been an
 * expensive mistake. Verified on prod 2026-08-05 (lucia, completeness discriminator applied):
 *
 *     bills           16,250 total / 16,245 QBO-origin /  5 TMS-native
 *     bill_payments    6,544 total /  6,543 QBO-origin /  1 TMS-native
 *     payments        12,124 total / 12,123 QBO-origin /  1 TMS-native
 *     invoices        11,984 total / 11,976 QBO-origin /  8 TMS-native
 *
 * Under the locked parallel-books architecture QBO is the system of record for cloned history, and
 * the posting engine REFUSES those on purpose (QBO_BILL_PAYMENT_POST_GL_REFUSED,
 * QBO_CUSTOMER_PAYMENT_POST_GL_REFUSED, QBO_INVOICE_POST_GL_REFUSED). A TMS journal entry for a
 * transaction QuickBooks already booked is a DUPLICATE. A guard demanding coverage on all 40,887
 * QBO-origin rows would report a $65M "gap" that must never be closed — the exact trap that produced
 * the retracted "$107M unposted" claim (audit rows 665 / 670 / 672).
 *
 * So this ratchet asserts coverage over TMS-NATIVE rows ONLY, and only over those that are actually
 * POSTABLE:
 *   - bill / bill_payment / customer_payment : postable once it exists and is not voided.
 * Scoped to ACTIVE operating companies (org.companies.deactivated_at IS NULL). Integration fixtures
 * create an isolated company and deactivate it on teardown; their residue is not company money and
 * must not gate the ratchet. Verified this is a no-op for the real books: TRANSP, TRK and USMCA are
 * all active, so prod coverage is unchanged by this clause.
 *
 *   - invoice                                : postable only at status 'sent'. A draft is not yet a
 *     receivable, a proforma is not an AR event at all, and a void has nothing to recognise. Demanding
 *     a JE for those would redden the board on correct behaviour.
 *
 * BASELINE: ZERO real gaps. The one candidate — INV-2026-00004 (USMCA, 'sent') — turned out to be a
 * $0.00 manual invoice: total_cents 0, subtotal_cents 0, amount_open_cents 0, voided_at NULL
 * (prod, 2026-08-05). It carries no revenue and no receivable, so it is not a postable money event at
 * all and the poster's refusal (INVOICE_LINE_REVENUE_UNRESOLVED) was correct. It is reclassified
 * by-design in known-gl-posting-coverage-gaps.json rather than deleted, so the investigation survives.
 * With the total_cents > 0 condition applied, prod uncovered = 0. The ratchet therefore starts from a
 * genuinely clean baseline and goes RED on the FIRST real gap — no carried debt masking anything.
 *
 * DEGRADE-SAFE. With no reachable database this SKIPS and exits 0 (the established pattern, cf.
 * verify-balanced-ledger.mjs). Note honestly what that means: in CI the only database is a fresh
 * ephemeral one with zero money rows, so this guard is VACUOUS there. Its teeth are live — GUARD/CC-2
 * runs it against prod. A live-data assertion cannot be made meaningful against a database built from
 * the same migrations it is auditing.
 */
import process from "node:process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const LABEL = "verify-gl-posting-coverage";
const BASELINE_FILE = "scripts/known-gl-posting-coverage-gaps.json";

/**
 * TMS-native + postable, per source. `qbo_*_id IS NULL` is the origin test: a row carrying a QBO id is
 * cloned history and is refused by design.
 */
export const COVERAGE_SOURCES = [
  {
    kind: "bill",
    sql: `SELECT id::text AS id, COALESCE(bill_number,'') AS label, operating_company_id::text AS opco
            FROM accounting.bills
           WHERE qbo_bill_id IS NULL AND operating_company_id IN (SELECT id FROM org.companies WHERE deactivated_at IS NULL)`,
  },
  {
    kind: "bill_payment",
    sql: `SELECT id::text AS id, '' AS label, operating_company_id::text AS opco
            FROM accounting.bill_payments
           WHERE qbo_bill_payment_id IS NULL AND operating_company_id IN (SELECT id FROM org.companies WHERE deactivated_at IS NULL)`,
  },
  {
    kind: "customer_payment",
    sql: `SELECT id::text AS id, '' AS label, operating_company_id::text AS opco
            FROM accounting.payments
           WHERE qbo_payment_id IS NULL AND voided_at IS NULL AND operating_company_id IN (SELECT id FROM org.companies WHERE deactivated_at IS NULL)`,
  },
  {
    kind: "invoice",
    // TWO postability conditions, and both are substantive — see the header.
    //   status='sent'    — a draft/proforma/void invoice is not yet (or never) a receivable.
    //   total_cents > 0  — a ZERO-DOLLAR invoice has no revenue and no A/R, so there is nothing for
    //                      the ledger to recognise. Demanding a journal entry for $0.00 would mean
    //                      demanding a JE with no amount, which the poster rightly refuses.
    sql: `SELECT id::text AS id, COALESCE(display_id,'') AS label, operating_company_id::text AS opco
            FROM accounting.invoices
           WHERE qbo_invoice_id IS NULL AND status = 'sent' AND total_cents > 0 AND operating_company_id IN (SELECT id FROM org.companies WHERE deactivated_at IS NULL)`,
  },
];

/** A row is covered when the posting spine links a journal-entry posting back to it. */
export const COVERAGE_PREDICATE = `
  SELECT 1 FROM accounting.transaction_source_links t
   WHERE t.linked_object_id::text = $1`;

export function loadBaseline(file = BASELINE_FILE) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    return new Set((parsed.known_gaps ?? []).map((g) => `${g.kind}:${g.id}`));
  } catch {
    return null; // reported as an error — never silently treated as "nothing baselined"
  }
}

/** Split violations into NEW (fail) and baselined (report only). Pure, so the selftest can drive it. */
export function classify(violations, baseline) {
  const fresh = [];
  const known = [];
  for (const v of violations) {
    if (baseline.has(`${v.kind}:${v.id}`)) known.push(v);
    else fresh.push(v);
  }
  return { fresh, known };
}

if (process.argv.includes("--selftest")) {
  const baseline = loadBaseline();
  if (baseline === null) {
    console.error(`${LABEL} --selftest FAIL — ${BASELINE_FILE} unreadable; it is the only thing separating a known gap from a new one.`);
    process.exit(1);
  }
  // Mutation 1: an UNBASELINED violation must be reported as fresh — the ratchet's whole purpose.
  const m1 = classify([{ kind: "invoice", id: "brand-new-uuid", label: "INV-X", opco: "o" }], baseline);
  if (m1.fresh.length !== 1) {
    console.error(`${LABEL} --selftest FAIL — a new uncovered money event was NOT flagged.`);
    process.exit(1);
  }
  // Mutation 2: a carried entry must NOT be reported as fresh, or the guard can never go green and
  // gets disabled within a day. Driven from a SYNTHETIC baseline on purpose: the real one is empty
  // (prod has zero real gaps), and a test that only works while debt exists would silently stop
  // testing anything the moment the debt is paid off — which is exactly when it matters that the
  // carry mechanism still works.
  const synthetic = new Set(["invoice:carried-uuid"]);
  const m2 = classify([{ kind: "invoice", id: "carried-uuid", label: "", opco: "" }], synthetic);
  if (m2.fresh.length !== 0 || m2.known.length !== 1) {
    console.error(`${LABEL} --selftest FAIL — a carried gap was treated as new.`);
    process.exit(1);
  }
  // ...and the same entry against the REAL baseline must be fresh, proving the real file is empty
  // rather than quietly excusing something.
  if (classify([{ kind: "invoice", id: "carried-uuid", label: "", opco: "" }], baseline).fresh.length !== 1) {
    console.error(`${LABEL} --selftest FAIL — the real baseline is carrying an entry it should not.`);
    process.exit(1);
  }
  // Mutation 3: the invoice source must NOT demand coverage for draft/proforma/void. If this filter is
  // ever loosened the guard reddens on correct behaviour and someone will delete it.
  const invoice = COVERAGE_SOURCES.find((s) => s.kind === "invoice");
  if (!/status\s*=\s*'sent'/.test(invoice.sql)) {
    console.error(`${LABEL} --selftest FAIL — invoice coverage is not restricted to status='sent'.`);
    process.exit(1);
  }
  // Mutation 4: the invoice source must ALSO require total_cents > 0. Dropping it re-reddens the
  // guard on every zero-dollar invoice — money events that have nothing to post by definition — and a
  // ratchet that fires on $0.00 gets switched off.
  if (!/total_cents\s*>\s*0/.test(invoice.sql)) {
    console.error(`${LABEL} --selftest FAIL — invoice coverage does not require total_cents > 0.`);
    process.exit(1);
  }
  // Mutation 5: every source must carry the QBO-origin exclusion, or the guard demands duplicate JEs
  // for 40,887 cloned rows.
  for (const s of COVERAGE_SOURCES) {
    if (!/qbo_\w+_id IS NULL/.test(s.sql)) {
      console.error(`${LABEL} --selftest FAIL — source '${s.kind}' does not exclude QBO-origin rows.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — 5 mutations detected; baseline readable with ${baseline.size} carried gap(s).`);
  process.exit(0);
}

const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.log(`${LABEL} SKIP — no DATABASE_URL/DATABASE_DIRECT_URL; live coverage cannot be asserted here.`);
  process.exit(0);
}

// THE LIVE ASSERTION ONLY MEANS SOMETHING AGAINST THE REAL BOOKS.
//
// I first assumed CI's database would be empty and the query harmless. That was wrong, and CI proved
// it: the backend db.tests create bills, invoices and payments as fixtures, this guard ran after them
// and reported 15 "uncovered money events" that are simply test rows nobody intends to post. A
// ratchet that is RED on fixtures is the anti-pattern this class exists to avoid — it gets deleted,
// and then nothing watches the real books.
//
// So the live query is OPT-IN. In CI the guard still does real work: the --selftest above is the
// structural half and it runs unconditionally. The data half runs where the data is real — GUARD /
// CC-2 point it at prod with GL_POSTING_COVERAGE_LIVE=1.
const liveRequested = process.env.GL_POSTING_COVERAGE_LIVE === "1";
if (!liveRequested && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
  console.log(
    `${LABEL} SKIP (live half) — CI's database is a fixture playground, not the books; unposted test ` +
      `rows there are expected, not defects. Run with GL_POSTING_COVERAGE_LIVE=1 against prod.`
  );
  process.exit(0);
}

const baseline = loadBaseline();
if (baseline === null) {
  console.error(`${LABEL} FAIL — ${BASELINE_FILE} is unreadable. Refusing to run rather than reporting every known gap as new.`);
  process.exit(1);
}

const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
const pg = require("pg");
const client = new pg.Client(buildPgClientConfig(connectionString));

try {
  await client.connect();
} catch (error) {
  // DEGRADE-SAFE, and this is the whole reason it matters: verify-static deliberately points guards
  // at an UNREACHABLE sentinel (127.0.0.1:59999) to prove none of them can reach a real database.
  // Treating "cannot connect" as a failure would redden every static run and make this guard the
  // thing that blocks pushes — a live-data assertion must be silent where there is no live data.
  // A connection failure is NOT evidence of a defect; a query failure below still is.
  console.log(`${LABEL} SKIP — database unreachable (${error.code ?? error.message}); live assertion not possible here.`);
  await client.end().catch(() => {});
  process.exit(0);
}

try {
  await client.query("BEGIN");
  await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

  const violations = [];
  let scanned = 0;
  for (const source of COVERAGE_SOURCES) {
    const rows = (await client.query(source.sql)).rows;
    scanned += rows.length;
    for (const r of rows) {
      const covered = await client.query(COVERAGE_PREDICATE, [r.id]);
      if (covered.rowCount === 0) violations.push({ kind: source.kind, id: r.id, label: r.label, opco: r.opco });
    }
  }
  await client.query("COMMIT");

  const { fresh, known } = classify(violations, baseline);
  if (known.length > 0) {
    console.log(`${LABEL} — ${known.length} KNOWN gap(s) carried in ${BASELINE_FILE}:`);
    for (const k of known) console.log(`    · ${k.kind} ${k.label || k.id} (${k.id})`);
  }
  if (fresh.length > 0) {
    console.error(`${LABEL} FAIL — ${fresh.length} TMS-native money event(s) reached no ledger:`);
    for (const v of fresh) {
      console.error(
        `  - ${v.kind} ${v.label || v.id} (${v.id}, entity ${v.opco}) is postable and has no ` +
          `accounting.transaction_source_links row. Recognised money with no journal entry.`
      );
    }
    console.error(
      `  Do NOT silence this by writing a journal entry by hand — fix the posting path, then re-run. ` +
        `If it is genuinely expected, record it in ${BASELINE_FILE} with the reason.`
    );
    process.exit(1);
  }
  console.log(
    `${LABEL} PASS — ${scanned} TMS-native postable money event(s) scanned; 0 new coverage gaps ` +
      `(${known.length} baselined). QBO-origin rows are excluded by design — they are refused by the ` +
      `posting engine under parallel books.`
  );
} catch (error) {
  console.error(`${LABEL} FAIL — ${error.message}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
