#!/usr/bin/env node
// ACCT-F11108 — the Faro PURCHASE REPORT is seeded as ONE file, through the ONE factoring purchase engine.
//
// Root cause: the Faro CSV commit is retired (it wrote fundings outside the purchase engine), so the owner's purchase
// report had no way in except Factoring -> Submit to Factor, one wire at a time. Owner order 2026-11-09: "not one by one".
//
// RULE 1 — the route exists, is registered in index.ts, and is Owner-only.
// RULE 2 — the service writes ONLY through the engine: runPurchaseFeedGate -> createPurchaseDraft -> postPurchase; no raw
//          INSERT/UPDATE of its own, and it never calls the retired commitFaroCsvImport / postFactoringAdvanceEvent.
// RULE 3 — no owner override is ever supplied on the owner's behalf (docsOverrideCode null, feed gate override null).
// RULE 4 — delta only: Faro Inv # already on a live purchase line is already_present, checked before any draft.
// RULE 5 — match by PO only: the invoice-number path is blanked before enrichFaroPreviewLines.
// RULE 6 — a date posts whole and only when the engine's net equals Faro's Net Adv for the date (faro_wire_tie_out).
// RULE 7 (part 3, measured 2026-11-09: preview "would_post" 10-15, commit held it feed_gate_blocked) — the preview runs the
//          SAME feed gate inside a rolled-back scope (GatePreviewRollback); it is never skipped in preview.
import fs from "node:fs";

const SERVICE = "apps/backend/src/factoring/faro-purchase-report-seed.service.ts";
const ROUTES = "apps/backend/src/factoring/faro-purchase-report-seed.routes.ts";
const INDEX = "apps/backend/src/index.ts";
const FILES = [SERVICE, ROUTES, INDEX];

export function audit(files) {
  const out = [];
  for (const f of FILES) if (files[f] == null) out.push(`${f} is missing`);
  if (out.length) return out;
  const svc = files[SERVICE];
  const routes = files[ROUTES];
  if (!/registerFaroPurchaseReportSeedRoutes\(app\)/.test(files[INDEX])) out.push("RULE 1: the seed route is not registered in index.ts");
  if (!/\/api\/v1\/factoring\/import\/faro-purchase-report/.test(routes)) out.push("RULE 1: the seed route path is gone");
  if (!/role \?\? ""\) !== "Owner"\) return reply\.code\(403\)/.test(routes)) out.push("RULE 1: the seed route is not Owner-only");

  for (const call of ["runPurchaseFeedGate(", "createPurchaseDraft(", "postPurchase("]) {
    if (!svc.includes(call)) out.push(`RULE 2: the service no longer calls ${call.slice(0, -1)}`);
  }
  if (/INSERT\s+INTO|UPDATE\s+(accounting|mdata|factoring)\./i.test(svc)) out.push("RULE 2: the service writes SQL of its own");
  if (/commitFaroCsvImport\(|postFactoringAdvanceEvent/.test(svc)) out.push("RULE 2: the service calls a retired factoring writer");

  if (!/docsOverrideCode: null,/.test(svc)) out.push("RULE 3: a docs override is supplied on the owner's behalf");
  if (!/runPurchaseFeedGate\(client as never, oci, invoiceIds, input\.actorUserId, null,/.test(svc)) out.push("RULE 3: the feed gate is given an override");

  const presentAt = svc.indexOf('if (present.has(l.invoice_number)) return { ...base, outcome: "already_present"');
  const draftAt = svc.indexOf("await createPurchaseDraft(");
  if (presentAt < 0 || !/pl\.faro_invoice_number = ANY\(\$2::text\[\]\)/.test(svc)) out.push("RULE 4: the delta check on Faro Inv # is gone");
  else if (draftAt >= 0 && presentAt > draftAt) out.push("RULE 4: the delta check runs after a draft is made");

  if (!/enrichFaroPreviewLines\(client as never, oci, parsed\.lines\.map\(\(l\) => \(\{ \.\.\.l, invoice_number: "" \}\)\)\)/.test(svc)) {
    out.push("RULE 5: Faro's Inv # reaches the invoice-number match path");
  }
  if (!/if \(engineNet !== faroNet\)/.test(svc) || !/faro_wire_tie_out/.test(svc)) out.push("RULE 6: the wire tie-out to Faro's Net Adv is gone");
  if (!/faro_date_incomplete/.test(svc)) out.push("RULE 6: a date with an unpostable line is no longer held whole");
  if (!/throw new GatePreviewRollback\(await feedGate\(client\)\);/.test(svc) || /: null;\s*\n\s*const red = gate/.test(svc)) {
    out.push("RULE 7: the preview no longer runs the feed gate (inside a rolled-back scope)");
  }
  return out;
}

function load(root) {
  const files = {};
  for (const f of FILES) {
    try {
      files[f] = fs.readFileSync(`${root}/${f}`, "utf8");
    } catch {
      files[f] = null;
    }
  }
  return files;
}

if (process.argv.includes("--selftest")) {
  const good = load(process.cwd());
  const clean = audit(good);
  if (clean.length) throw new Error("SELFTEST FAIL (live tree should be clean): " + JSON.stringify(clean));
  const plant = (file, from, to) => {
    const f = { ...good };
    if (!f[file] || !f[file].includes(from)) throw new Error(`SELFTEST setup broken: '${from}' not in ${file}`);
    f[file] = f[file].replace(from, to);
    return f;
  };
  const cases = [
    ["route unregistered", plant(INDEX, "await registerFaroPurchaseReportSeedRoutes(app);", "")],
    ["route not owner-only", plant(ROUTES, 'role ?? "") !== "Owner") return reply.code(403)', 'role ?? "") === "Nobody") return reply.code(403)')],
    ["engine skipped", plant(SERVICE, "const posted = await postPurchase(", "const posted = await (async (..._a) => ({ factoringAdvanceId: '' }))(")],
    ["raw insert", plant(SERVICE, "const draft = (await createPurchaseDraft(", "await client.query(`INSERT INTO accounting.factoring_purchases (id) VALUES (gen_random_uuid())`);\n        const draft = (await createPurchaseDraft(")],
    ["retired writer", plant(SERVICE, "const posted = await postPurchase(", "await commitFaroCsvImport({} as never);\n        const posted = await postPurchase(")],
    ["override supplied", plant(SERVICE, "docsOverrideCode: null,", 'docsOverrideCode: "owner_override",')],
    ["gate override", plant(SERVICE, "runPurchaseFeedGate(client as never, oci, invoiceIds, input.actorUserId, null,", 'runPurchaseFeedGate(client as never, oci, invoiceIds, input.actorUserId, "owner_override",')],
    ["delta removed", plant(SERVICE, 'if (present.has(l.invoice_number)) return { ...base, outcome: "already_present"', 'if (false) return { ...base, outcome: "held"')],
    ["inv # matched", plant(SERVICE, '({ ...l, invoice_number: "" })', "({ ...l })")],
    ["no wire tie-out", plant(SERVICE, "if (engineNet !== faroNet) {", "if (false) {")],
    ["date split", plant(SERVICE, "faro_date_incomplete", "faro_date_partial_ok")],
    ["preview skips the feed gate", plant(SERVICE, "throw new GatePreviewRollback(await feedGate(client));", "throw new GatePreviewRollback([]);")],
  ];
  let caught = 0;
  for (const [name, files] of cases) {
    if (audit(files).length === 0) throw new Error(`SELFTEST FAIL: planted defect '${name}' went undetected`);
    caught += 1;
  }
  console.log(`verify-faro-purchase-report-seed: SELFTEST PASS (${caught}/${cases.length} planted defects caught)`);
  process.exit(0);
}

const failures = audit(load(process.cwd()));
if (failures.length) {
  console.error("verify-faro-purchase-report-seed FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-faro-purchase-report-seed: PASS — Owner-only, one purchase engine, no override, delta by Faro Inv #, PO match, whole-date wire tie-out");
