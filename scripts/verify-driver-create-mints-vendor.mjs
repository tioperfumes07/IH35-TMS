#!/usr/bin/env node
/**
 * GUARD: every operator surface that hires a driver must also mint that driver's A/P payee.
 *
 * Drivers are hired Mexican-B1 1099 CONTRACTORS, so A/P reaches them only through `mdata.vendors`.
 * A driver with no vendor row cannot be billed or paid — they are simply absent from the vendor
 * picker on bills and expenses.
 *
 * MEASURED ON PROD (br-fancy-credit-akjnd07a, 2026-08-09, bypass txn):
 *   USMCA active drivers            16
 *   ... with a same-entity vendor   13
 *   ... WITHOUT                      3 — and all three are the operator-created ones
 * The 13 came from seeders that DO mint a vendor; the only other minter was the on-demand
 * POST /mdata/vendors/ensure-drivers maintenance route. Nothing minted on HIRE, so the link existed
 * exactly as often as somebody remembered to press the button: 3 of 3 on the path a human uses.
 *
 * This is the same class as FAIL-INS-POLICY-ASSET-404 (units created with no `mdata.assets` row) —
 * a registry joined to its financial counterpart by nothing but goodwill. Same guard shape.
 *
 * IN SCOPE: a file that INSERTs into `mdata.drivers`.
 * ASSERTS:  that same file also mints the payee — either an INSERT INTO `mdata.vendors` or a call
 *           to the shared `ensureDriverVendor` helper.
 *
 * Run:  node scripts/verify-driver-create-mints-vendor.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(root, "apps/backend/src");
const LABEL = "verify-driver-create-mints-vendor";

/**
 * KNOWN GAPS — driver creators that do not mint a payee, each with the reason. Shrink only;
 * adding to this list is a visible, reviewable edit.
 */
const KNOWN_GAPS = new Map([
  [
    "apps/backend/src/integrations/qbo/qbo-vendor-linkage.service.ts",
    "QBO mirror projection: rows are clones of QBO records. Minting a payee from a mirror would fabricate an A/P counterparty the source system does not have.",
  ],
  [
    "apps/backend/src/integrations/samsara/samsara-master-sync.service.ts",
    "Samsara master sync: telematics-derived drivers. A device projection is not a hire, and it carries no pay relationship.",
  ],
]);

const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__") continue;
      walk(p, out);
    } else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) {
      out.push(p);
    }
  }
  return out;
}

export function insertsInto(code, relation) {
  return new RegExp(`INSERT\\s+INTO\\s+${relation.replace(".", "\\.")}\\b`, "i").test(code);
}

export function mintsPayee(code) {
  return insertsInto(code, "mdata.vendors") || /\bensureDriverVendor\s*\(/.test(code) || /\bcreateDriverCanonical\s*\(/.test(code);
}

export function collectProblems(files) {
  const problems = [];
  for (const { rel, src } of files) {
    const code = strip(src);
    if (!insertsInto(code, "mdata.drivers")) continue;

    const mints = mintsPayee(code);
    const listed = KNOWN_GAPS.has(rel);

    if (!mints && !listed) {
      problems.push(
        `${rel}: INSERTs into mdata.drivers but never mints the driver's A/P payee. Drivers are 1099 ` +
          `contractors — with no mdata.vendors row they cannot be billed or paid and do not appear in ` +
          `the vendor picker (measured: 3 of 3 operator-created USMCA drivers had none). Call ` +
          `ensureDriverVendor(), or add this file to KNOWN_GAPS with a reason.`
      );
    }
    if (mints && listed) {
      problems.push(`${rel}: now mints the payee — remove it from KNOWN_GAPS so the list cannot silently regrow.`);
    }
  }
  return problems;
}

function readTree() {
  return walk(DIR).map((f) => ({ rel: path.relative(root, f), src: fs.readFileSync(f, "utf8") }));
}

function selftest() {
  const mk = (rel, src) => ({ rel, src });
  const cases = [
    { name: "real tree passes", files: null, expect: 0 },
    {
      name: "a hire surface with no payee is caught",
      files: [mk("apps/backend/src/x/foo.ts", "INSERT INTO mdata.drivers (a) VALUES ($1)")],
      expectAtLeast: 1,
    },
    {
      name: "minting via the shared helper passes",
      files: [mk("apps/backend/src/x/foo.ts", "INSERT INTO mdata.drivers (a); await ensureDriverVendor(client, {});")],
      expect: 0,
    },
    {
      name: "minting via a direct INSERT passes",
      files: [mk("apps/backend/src/x/foo.ts", "INSERT INTO mdata.drivers (a); INSERT INTO mdata.vendors (b)")],
      expect: 0,
    },
    {
      name: "a file touching neither is ignored",
      files: [mk("apps/backend/src/x/bar.ts", "SELECT 1")],
      expect: 0,
    },
    {
      name: "commented-out insert does not count",
      files: [mk("apps/backend/src/x/baz.ts", "// INSERT INTO mdata.drivers (a)\nconst a = 1;")],
      expect: 0,
    },
    {
      name: "a stale KNOWN_GAPS entry is caught",
      files: [mk("apps/backend/src/integrations/qbo/qbo-vendor-linkage.service.ts", "INSERT INTO mdata.drivers (a); await ensureDriverVendor(c, {});")],
      expectAtLeast: 1,
    },
  ];
  let pass = 0;
  for (const c of cases) {
    const problems = collectProblems(c.files ?? readTree());
    const ok = c.expect === 0 ? problems.length === 0 : problems.length >= (c.expectAtLeast ?? 1);
    if (ok) pass += 1;
    else console.error(`  selftest FAIL: ${c.name} -> ${JSON.stringify(problems)}`);
  }
  console.log(`${LABEL} selftest ${pass}/${cases.length}`);
  return pass === cases.length ? 0 : 1;
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (!fs.existsSync(DIR)) {
    console.error(`${LABEL}: FAIL — ${DIR} not found`);
    return 1;
  }
  const problems = collectProblems(readTree());
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`${LABEL}: ok`);
  for (const [file, reason] of KNOWN_GAPS) console.log(`  KNOWN GAP (must shrink) — ${file}\n      ${reason}`);
  return 0;
}

process.exit(main());
