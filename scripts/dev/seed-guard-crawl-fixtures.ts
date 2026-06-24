/**
 * seed-guard-crawl-fixtures.ts — minimal TEST-RECORD seed so GUARD can live-crawl money inputs
 * that are unreachable in an empty TRANSP env (they need a parent record: an open invoice, an
 * unpaid bill, a customer with open AR, etc).
 *
 * APPROVED by Jorge (GUARD doc 2026-06-24, PART 2). HARD RULES enforced here:
 *  - TRANSP ONLY (operating_company_id 91e0bf0a-133f-4ce8-a734-2586cfa66d96). Never TRK/USMCA.
 *  - Every name/number prefixed "ZZ-GUARD-TEST" (greppable + archivable). Amount = $350.00 = 35000 cents.
 *  - ADDITIVE + REVERSIBLE: teardown() ARCHIVES/VOIDS every seeded row (never hard-DELETE).
 *  - NO GL POSTING: records seeded in DRAFT/open state only. No JE post, no settlement post, no
 *    BILL_GL_POSTING_ENABLED. If a fixture path would post GL, it is left as a HOLD stub (S5/S6).
 *  - Goes through the app's OWN create endpoints (same Zod/RLS the UI uses) — NOT raw SQL.
 *  - Idempotent: re-run = no dupes (keyed on the ZZ-GUARD-TEST name/number).
 *
 * EXECUTION IS GATED (§1.5/§1.6): this writes to a live DB. Run target is Jorge's call —
 * prod-TRANSP for pure draft parents, or a Neon BRANCH if any posting/financial side-effect risk.
 * The coder does NOT execute this. Run it yourself:
 *     SEED_BASE_URL=https://ih35-tms.onrender.com SEED_AUTH="Bearer <token>" \
 *       npm run seed:guard-crawl        # create S1..S7
 *       npm run teardown:guard-crawl    # archive/void all ZZ-GUARD-TEST rows
 *
 * Env:
 *   SEED_BASE_URL   backend base (default http://localhost:8080)
 *   SEED_AUTH       Authorization header value (e.g. "Bearer ey..." ) for an Owner/Admin session
 *   SEED_COMPANY    operating_company_id (default TRANSP)
 */

const BASE_URL = process.env.SEED_BASE_URL ?? "http://localhost:8080";
const AUTH = process.env.SEED_AUTH ?? "";
const TRANSP = process.env.SEED_COMPANY ?? "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
const PREFIX = "ZZ-GUARD-TEST";
const AMOUNT_CENTS = 35000; // $350.00
const today = () => new Date().toISOString().slice(0, 10);

if (!AUTH) {
  console.error("SEED_AUTH is required (Authorization header for an Owner/Admin session). Aborting.");
  process.exit(2);
}

type Json = Record<string, unknown>;
async function api(method: string, path: string, body?: Json): Promise<{ status: number; json: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: AUTH },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* empty body */ }
  if (res.status >= 400) console.error(`  ! ${method} ${path} -> ${res.status} ${JSON.stringify(json)}`);
  return { status: res.status, json };
}

const created: { ids: Record<string, string>; urls: string[] } = { ids: {}, urls: [] };

// ── S1: Customer ────────────────────────────────────────────────────────────────────────────
async function seedCustomer(): Promise<string | null> {
  const name = `${PREFIX} CUSTOMER`;
  const list = await api("GET", `/api/v1/mdata/customers?operating_company_id=${TRANSP}&search=${encodeURIComponent(PREFIX)}`);
  const existing = (list.json?.customers ?? []).find((c: any) => c.customer_name === name || c.name === name);
  if (existing) { console.log(`S1 customer exists: ${existing.id}`); return existing.id; }
  const res = await api("POST", `/api/v1/mdata/customers`, { name, operating_company_id: TRANSP, notes: `${PREFIX} crawl fixture` });
  const id = res.json?.customer?.id ?? res.json?.id ?? null;
  if (id) { created.ids.customer = id; created.urls.push(`${BASE_URL.replace(/:8080$/, "")}/customers/${id}  (payment + lane-rate inputs #1405)`); console.log(`S1 customer created: ${id}`); }
  return id;
}

// ── S2: Open invoice for S1 (shell; $350 line is added if the line endpoint is confirmed) ─────
async function seedInvoice(customerId: string): Promise<string | null> {
  // Idempotency: list open invoices for the customer, match the test memo.
  const list = await api("GET", `/api/v1/accounting/invoices?operating_company_id=${TRANSP}`);
  const existing = (list.json?.invoices ?? []).find((i: any) => String(i.internal_notes ?? "").includes(`${PREFIX}-INV-001`));
  if (existing) { console.log(`S2 invoice exists: ${existing.id}`); return existing.id; }
  const res = await api("POST", `/api/v1/accounting/invoices?operating_company_id=${TRANSP}`, {
    customer_id: customerId,
    issue_date: today(),
    internal_notes: `${PREFIX}-INV-001`,
  });
  const id = res.json?.invoice?.id ?? res.json?.id ?? null;
  if (id) {
    created.ids.invoice = id;
    created.urls.push(`${BASE_URL.replace(/:8080$/, "")}/accounting/invoices/${id}  (Invoices inline #1388 + PaymentApply #1400)`);
    console.log(`S2 invoice shell created: ${id}`);
    // TODO(confirm): add a $350 line. The POST /invoices body takes no lines; the line-add path
    // (PATCH invoice / invoice_lines) must be confirmed before the invoice shows a $350 open balance.
    // Left as a shell so PaymentApply renders; GUARD: confirm the line endpoint or add via UI once.
    console.log(`  NOTE: invoice has no $350 line yet — confirm the invoice-line endpoint to set the open balance.`);
  }
  return id;
}

// ── S3: Vendor + unpaid Bill $350 (single-call amount_cents — unlocks AP Bill Payment #1402) ──
async function seedVendorAndBill(): Promise<void> {
  const vname = `${PREFIX} VENDOR`;
  const vlist = await api("GET", `/api/v1/mdata/vendors?operating_company_id=${TRANSP}&search=${encodeURIComponent(PREFIX)}`);
  let vendorId = (vlist.json?.vendors ?? []).find((v: any) => v.vendor_name === vname || v.name === vname)?.id ?? null;
  if (!vendorId) {
    const vres = await api("POST", `/api/v1/mdata/vendors`, { name: vname, vendor_type: "Other", operating_company_id: TRANSP, notes: `${PREFIX} crawl fixture` });
    vendorId = vres.json?.vendor?.id ?? vres.json?.id ?? null;
    if (vendorId) console.log(`S3 vendor created: ${vendorId}`);
  } else console.log(`S3 vendor exists: ${vendorId}`);
  if (!vendorId) return;
  created.ids.vendor = vendorId;
  created.urls.push(`${BASE_URL.replace(/:8080$/, "")}/vendors/${vendorId}?tab=ap  (AP Bill Payment + CC payment)`);

  const billNumber = `${PREFIX}-BILL-001`;
  const blist = await api("GET", `/api/v1/accounting/bills?operating_company_id=${TRANSP}&vendor_id=${vendorId}`);
  const existingBill = (blist.json?.bills ?? blist.json?.rows ?? []).find((b: any) => b.bill_number === billNumber);
  if (existingBill) { console.log(`S3 bill exists: ${existingBill.id}`); created.ids.bill = existingBill.id; return; }
  const bres = await api("POST", `/api/v1/accounting/bills?operating_company_id=${TRANSP}`, {
    vendor_id: vendorId,
    bill_number: billNumber,
    bill_date: today(),
    amount_cents: AMOUNT_CENTS,
    memo: `${PREFIX} crawl fixture (unpaid)`,
  });
  const billId = bres.json?.bill?.id ?? bres.json?.id ?? null;
  if (billId) { created.ids.bill = billId; console.log(`S3 unpaid bill created: ${billId} ($350.00)`); }
}

// ── S4–S7: HOLD stubs (need multi-step/posting paths confirmed before wiring; see GUARD doc) ───
async function seedHoldStubs(): Promise<void> {
  console.log("S4 fuel receipt / S5 settlement draft / S6 factoring shell / S7 work order:");
  console.log("  NOT auto-seeded — these need create paths confirmed (fuel ingest, settlement DRAFT-only,");
  console.log("  factoring shell tied to S2, saved WO). S5/S6 risk GL/settlement posting → keep DRAFT-only or");
  console.log("  Neon branch. Wire each here once its non-posting create payload is confirmed with Jorge.");
}

// ── Teardown: archive/void all ZZ-GUARD-TEST rows (additive-only) ─────────────────────────────
async function teardown(): Promise<void> {
  console.log("Teardown — archiving/voiding ZZ-GUARD-TEST rows (never hard delete):");
  const blist = await api("GET", `/api/v1/accounting/bills?operating_company_id=${TRANSP}`);
  for (const b of (blist.json?.bills ?? blist.json?.rows ?? []).filter((x: any) => String(x.bill_number ?? "").startsWith(PREFIX))) {
    await api("POST", `/api/v1/accounting/bills/${b.id}/void?operating_company_id=${TRANSP}`, { void_reason: `${PREFIX} teardown` });
    console.log(`  voided bill ${b.id}`);
  }
  const ilist = await api("GET", `/api/v1/accounting/invoices?operating_company_id=${TRANSP}`);
  for (const i of (ilist.json?.invoices ?? []).filter((x: any) => String(x.internal_notes ?? "").includes(PREFIX))) {
    await api("POST", `/api/v1/accounting/invoices/${i.id}/void?operating_company_id=${TRANSP}`, { void_reason: `${PREFIX} teardown` });
    console.log(`  voided invoice ${i.id}`);
  }
  const vlist = await api("GET", `/api/v1/mdata/vendors?operating_company_id=${TRANSP}&search=${encodeURIComponent(PREFIX)}`);
  for (const v of (vlist.json?.vendors ?? []).filter((x: any) => String(x.vendor_name ?? x.name ?? "").startsWith(PREFIX))) {
    await api("POST", `/api/v1/mdata/vendors/${v.id}/deactivate`, { operating_company_id: TRANSP });
    console.log(`  deactivated vendor ${v.id}`);
  }
  // Customers: deactivate via PATCH status=archived (confirm the customer-archive route on your side).
  console.log("  NOTE: customer archive — confirm the customer deactivate/archive route, then add here.");
  console.log("Teardown complete (confirm any NOTE rows manually).");
}

async function seed(): Promise<void> {
  console.log(`Seeding GUARD crawl fixtures into TRANSP (${TRANSP}) at ${BASE_URL} …`);
  const customerId = await seedCustomer();
  if (customerId) await seedInvoice(customerId);
  await seedVendorAndBill();
  await seedHoldStubs();
  console.log("\nCreated record IDs:", JSON.stringify(created.ids, null, 2));
  console.log("\nCrawl URLs:");
  for (const u of created.urls) console.log(`  ${u}`);
}

const mode = process.argv[2];
(async () => {
  if (mode === "teardown") await teardown();
  else await seed();
})().catch((e) => { console.error(e); process.exit(1); });
