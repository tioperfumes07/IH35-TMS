#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["customer","load","connectivity","reverse_link"],"leafRe":"^dispatch\\.queue$","task":"P04-dispatch-queue","pr":"pending"} */
/**
 * verify-dispatch-factoring-queue-deeplinks.mjs  (audit gap #9)
 *
 * Root cause (pre-#2537): Factoring Queue linked `/dispatch?view=loads&load=` while
 * Dispatch.tsx only read `load_id` → LoadDetailDrawer never opened. Subnav
 * "Reserve a Load" emitted `?book_load=1` which Dispatch never read → Book Load modal
 * never opened. Fixed on main (#2537): producer emits `load_id`, consumer also honors
 * legacy `load`, and `book_load=1` opens the modal.
 *
 * This guard locks the producer↔consumer contract so the dead deep-links cannot return.
 *
 * Usage:
 *   node scripts/verify-dispatch-factoring-queue-deeplinks.mjs            # scan
 *   node scripts/verify-dispatch-factoring-queue-deeplinks.mjs --selftest # planted-failure harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-factoring-queue-deeplinks";

const QUEUE = "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx";
const DISPATCH = "apps/frontend/src/pages/Dispatch.tsx";
const SUBNAV = "apps/frontend/src/components/dispatch/DispatchSubnav.tsx";
const ROUTES = "apps/backend/src/dispatch/factoring-queue.routes.ts";
const FACTORING_HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, src: "", err: `MISSING ${rel}` };
  return { ok: true, src: fs.readFileSync(p, "utf8"), err: null };
}

/**
 * Exported for --selftest planted fixtures.
 *
 * C5 (2026-07-25) TIGHTENED, NOT WEAKENED. This check used to REQUIRE the literal
 * `to={`/dispatch?view=loads&load_id=${row.load_id}`}` — i.e. it pinned the query-param form in
 * place and would have failed the canonical migration. The underlying INTENT was never "use a
 * query string"; it was "this link must actually open the load" (pre-#2537 it emitted `?load=`,
 * which Dispatch never read, so the drawer never opened). That intent is now satisfied by the
 * canonical route, so the requirement moves up to `EntityLink kind="load"` and BOTH dead-producer
 * regressions (`?load=` and `?load_id=`) stay forbidden. Strictly stronger: three assertions where
 * there were two, and the accepted shape is the one the whole app shares.
 */
export function checkFactoringQueueProducer(src) {
  const failures = [];
  // Canonical producer: EntityLink kind="load" → /dispatch/loads/:id.
  if (!/<EntityLink[^>]*kind=["']load["'][\s\S]{0,200}?row\.load_id/.test(src)) {
    failures.push(
      `${QUEUE}: Factoring Queue load link must use <EntityLink kind="load" id={row.load_id} …> ` +
        `(canonical /dispatch/loads/:id)`,
    );
  }
  // Regression: the original dead producer.
  if (/to=\{`\/dispatch\?view=loads&load=\$\{row\.load_id\}`\}/.test(src)) {
    failures.push(
      `${QUEUE}: must not emit legacy ?load= alone (drawer never opened) — use EntityLink kind="load"`,
    );
  }
  // Regression: the superseded query-param producer (C5).
  if (/to=\{`\/dispatch\?[^`]*\bload_id=/.test(src)) {
    failures.push(
      `${QUEUE}: must not emit /dispatch?…load_id= — the canonical load address is /dispatch/loads/:id`,
    );
  }
  return failures;
}

export function checkFactoringQueueApi(src) {
  const failures = [];
  if (!/AS customer_id/.test(src) || !/customer_id:\s*row\.customer_id/.test(src)) {
    failures.push(`${ROUTES}: factoring-queue API must return customer_id for customer EntityLink`);
  }
  if (!/FROM mdata\.load_stops[\s\S]{0,180}load_id = l\.id[\s\S]{0,120}stop_type = 'delivery'[\s\S]{0,120}soft_deleted_at IS NULL[\s\S]{0,120}ORDER BY sequence_number DESC/.test(src)) {
    failures.push(`${ROUTES}: factoring-queue destination must resolve only from active delivery stops`);
  }
  return failures;
}

export function checkFactoringQueueCustomerInvoiceLinks(src) {
  const failures = [];
  if (!/<EntityLink[^>]*kind=["']customer["'][\s\S]{0,200}?row\.customer_id/.test(src)) {
    failures.push(`${QUEUE}: customer column must use EntityLink kind="customer" id={row.customer_id}`);
  }
  if (!/<EntityLink[^>]*kind=["']invoice["'][\s\S]{0,200}?row\.invoice_id/.test(src)) {
    failures.push(`${QUEUE}: invoice column must use EntityLink kind="invoice" id={row.invoice_id}`);
  }
  if (/to=\{`\/accounting\/invoices\/\$\{row\.invoice_id\}`\}/.test(src)) {
    failures.push(`${QUEUE}: must not use raw Link to invoice — use EntityLink kind="invoice"`);
  }
  return failures;
}

export function checkFactoringHomeHubReverseLinks(src) {
  const failures = [];
  for (const [testId, path] of [
    ["factoring-hub-dispatch-queue-reverse-link", "/dispatch/factoring-queue"],
    ["factoring-hub-accounting-advances-reverse-link", "/accounting/factoring"],
    ["factoring-hub-banking-entry-reverse-link", "/banking/factoring"],
  ]) {
    if (!src.includes(`data-testid="${testId}"`) || !src.includes(`to="${path}"`)) {
      failures.push(`${FACTORING_HOME}: missing hub reverse link ${testId} → ${path}`);
    }
  }
  return failures;
}

export function checkDispatchConsumer(src) {
  const failures = [];
  // Canonical + legacy fallback so old bookmarks still open the drawer.
  if (!/searchParams\.get\(\s*["']load_id["']\s*\)\s*\?\?\s*searchParams\.get\(\s*["']load["']\s*\)/.test(src)) {
    failures.push(
      `${DISPATCH}: must honor load_id (canonical) with legacy ?load= fallback for the drawer`,
    );
  }
  // Reserve-a-Load deep link must open the Book Load modal.
  if (!/searchParams\.get\(\s*["']book_load["']\s*\)\s*!==\s*["']1["']/.test(src) &&
      !/searchParams\.get\(\s*["']book_load["']\s*\)\s*===\s*["']1["']/.test(src)) {
    failures.push(`${DISPATCH}: must read ?book_load=1 deep link`);
  }
  if (!/setNewLoadOpen\(\s*true\s*\)/.test(src)) {
    failures.push(`${DISPATCH}: ?book_load=1 path must call setNewLoadOpen(true)`);
  }
  // Ensure book_load handling is not a dead comment — the effect must mention book_load.
  if (!/book_load/.test(src) || !/useEffect/.test(src)) {
    failures.push(`${DISPATCH}: book_load deep-link must be handled in a useEffect`);
  }
  if (!/useState\(\s*initialSubTab === ["']book_load["']\s*\)/.test(src)) {
    failures.push(`${DISPATCH}: /dispatch/book-load must open the wizard on first paint (useState(initialSubTab === "book_load"))`);
  }
  return failures;
}

export function checkSubnavReserveHref(src) {
  const failures = [];
  if (!/label:\s*["']Reserve a Load["'][\s\S]{0,80}?href:\s*["'][^"']*book_load=1["']/.test(src)) {
    failures.push(
      `${SUBNAV}: "Reserve a Load" nav href must include book_load=1`,
    );
  }
  return failures;
}

export function run() {
  const failures = [];
  for (const rel of [QUEUE, DISPATCH, SUBNAV, ROUTES, FACTORING_HOME]) {
    const { ok, src, err } = read(rel);
    if (!ok) {
      failures.push(err);
      continue;
    }
    if (rel === QUEUE) {
      failures.push(...checkFactoringQueueProducer(src));
      failures.push(...checkFactoringQueueCustomerInvoiceLinks(src));
    }
    if (rel === ROUTES) failures.push(...checkFactoringQueueApi(src));
    if (rel === FACTORING_HOME) failures.push(...checkFactoringHomeHubReverseLinks(src));
    if (rel === DISPATCH) failures.push(...checkDispatchConsumer(src));
    if (rel === SUBNAV) failures.push(...checkSubnavReserveHref(src));
  }
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  const goodQueue =
    '<EntityLink kind="load" id={row.load_id} label={row.load_number} />';
  const badQueue =
    'to={`/dispatch?view=loads&load=${row.load_id}`}';
  // C5 — the shape this guard used to REQUIRE is now a planted failure.
  const badQueueQueryParam =
    'to={`/dispatch?view=loads&load_id=${row.load_id}`}';
  const goodDispatch = `
    const loadId = searchParams.get("load_id") ?? searchParams.get("load");
    const [newLoadOpen, setNewLoadOpen] = useState(initialSubTab === "book_load");
    useEffect(() => {
      if (searchParams.get("book_load") !== "1") return;
      setNewLoadOpen(true);
    }, [searchParams]);
  `;
  const badDispatchNoLoad = `const loadId = searchParams.get("load_id");`;
  const badDispatchNoBook = `
    const loadId = searchParams.get("load_id") ?? searchParams.get("load");
    // no book_load handling
  `;
  const goodSubnav = `{ label: "Reserve a Load", href: "/dispatch/book-load?book_load=1" }`;
  const badSubnav = `{ label: "Reserve a Load", href: "/dispatch/book-load" }`;
  const goodApi = `SELECT c.id AS customer_id FROM mdata.load_stops WHERE load_id = l.id AND stop_type = 'delivery' AND soft_deleted_at IS NULL ORDER BY sequence_number DESC; customer_id: row.customer_id`;
  const badApiRetiredStop = goodApi.replace("AND soft_deleted_at IS NULL", "");

  const checks = [
    ["good queue passes", checkFactoringQueueProducer(goodQueue).length === 0],
    ["bad queue fails", checkFactoringQueueProducer(badQueue).length > 0],
    ["superseded ?load_id= queue producer fails", checkFactoringQueueProducer(badQueueQueryParam).length > 0],
    ["good dispatch passes", checkDispatchConsumer(goodDispatch).length === 0],
    ["dispatch missing load fallback fails", checkDispatchConsumer(badDispatchNoLoad).length > 0],
    ["dispatch missing book_load fails", checkDispatchConsumer(badDispatchNoBook).length > 0],
    ["good subnav passes", checkSubnavReserveHref(goodSubnav).length === 0],
    ["bad subnav fails", checkSubnavReserveHref(badSubnav).length > 0],
    ["active delivery stop API passes", checkFactoringQueueApi(goodApi).length === 0],
    ["retired delivery stop API fails", checkFactoringQueueApi(badApiRetiredStop).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const { ok, failures } = run();
if (!ok) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `${LABEL}: OK — Factoring Queue load_id producer + Dispatch load/book_load consumers locked`,
);
process.exit(0);
