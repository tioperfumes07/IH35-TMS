#!/usr/bin/env node
/**
 * verify-driver-vendor-no-uuid-fallback.mjs — CLS-DRIVER-VENDOR-UUID-FALLBACK.
 *
 * A driver's A/P vendor must be RESOLVED, never SUBSTITUTED. No write path may fall back to a
 * driver id (or any other id) when a vendor does not resolve.
 *
 * WHY THIS EXISTS. ACCT-F158 made `resolveBillVendorWriteColumns` fail closed, and the first thing
 * that broke was the settlement posters — which had been handing `createBill` a DRIVER uuid in the
 * `vendorId` slot for as long as they had existed:
 *
 *     const driverVendorId = String(driverRes.rows[0]?.qbo_vendor_id ?? settlement.driver_id).trim();
 *     if (!driverVendorId) throw ... DRIVER_VENDOR_MISSING
 *
 * Two defects in two lines. The `??` fallback makes the DRIVER_VENDOR_MISSING check beneath it
 * DEAD CODE — a uuid is never the empty string, so the throw can never fire — and what flows on is
 * a driver id occupying a vendor field, which puts driver pay into A/P against a vendor that does
 * not exist.
 *
 * MEASURED ON PROD br-fancy-credit-akjnd07a 2026-08-07 (completeness discriminator on the same
 * table — mdata.drivers total = 181, so the zeros are real zeros and not an RLS mask):
 *     drivers ......................................................... 181
 *     ... with qbo_vendor_id set ......................................... 0
 *     mdata.vendors with driver_id set .................................. 37
 *     drivers with a same-entity vendor via mdata.vendors.driver_id ..... 37
 *     driver_finance.driver_settlement_gl_runs .......................... 0
 * The fallback was therefore not an edge case — it was the ONLY branch reachable, for every driver.
 * Zero settlements have posted, so nothing needs repair; the first one ever posted is the one this
 * protects. That is the whole reason to close it now rather than after the first settlement run.
 *
 * THE FIX IS ONE SHARED RESOLVER, NOT TWO PATCHED CALL SITES.
 * `apps/backend/src/accounting/driver-vendor-link.service.ts` resolves the driver's ACTIVE vendor
 * inside the driver's own entity (`mdata.vendors.driver_id`, backed on prod by
 * `uq_vendors_driver_active_per_company UNIQUE (operating_company_id, driver_id) WHERE driver_id IS
 * NOT NULL AND deactivated_at IS NULL`) and THROWS when there is none. Every driver-pay bill path
 * goes through it, so a future path gets the correct behaviour by construction.
 *
 * WHAT IT ASSERTS
 *   A. the shared resolver exists, is entity-scoped, and throws instead of returning a fallback id;
 *   B. NO file under apps/backend/src reintroduces an id-substituting vendor fallback
 *      (`?? …driver_id` / `|| …driver_id` feeding a vendor identifier) — this is the universal half:
 *      it binds files that do not exist yet, not just the two that had the bug;
 *   C. both known driver-pay bill posters actually call the shared resolver.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-vendor-no-uuid-fallback";

const RESOLVER = path.join("apps", "backend", "src", "accounting", "driver-vendor-link.service.ts");
const SCAN_ROOT = path.join("apps", "backend", "src");
const CALLERS = [
  path.join("apps", "backend", "src", "accounting", "settlement-posting", "settlement-bill-payment-posting.service.ts"),
  path.join("apps", "backend", "src", "payroll", "driver-settlement.service.deprecated.ts"),
];
const RESOLVER_FN = "resolveDriverVendorLink";

/** Strip comments so prose describing the defect never reads as the defect itself. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      walk(p, out);
    } else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
}

/**
 * The class signature: a VENDOR identifier taking a fallback from something named *driver_id /
 * driverId. Anchored on the vendor side (the declared name or the qbo_vendor_id read) so an
 * unrelated `?? driver_id` elsewhere is not swept in.
 */
const VENDOR_FALLBACK_RES = [
  // const <...vendor...> = ... ?? <...driver_id...>
  /\b(?:const|let|var)\s+\w*[Vv]endor\w*\s*=[^;\n]{0,200}(?:\?\?|\|\|)[^;\n]{0,120}\b(?:driver_id|driverId)\b/,
  // qbo_vendor_id ?? <...driver_id...>  (the exact shape both posters carried)
  /\bqbo_vendor_id\b[^;\n]{0,120}(?:\?\?|\|\|)[^;\n]{0,120}\b(?:driver_id|driverId)\b/,
  // vendorId: <...driver_id...>  — passing a driver id straight into a vendor argument slot
  /\bvendor_?[Ii]d\s*:\s*[\w.?]*\b(?:driver_id|driverId)\b/,
];

export function findViolations(root = ROOT) {
  const problems = [];

  // ── A. the shared resolver must exist and must fail closed ─────────────────────────────────────
  const resolverPath = path.join(root, RESOLVER);
  if (!fs.existsSync(resolverPath)) {
    problems.push({ where: RESOLVER, why: "shared driver->vendor resolver missing — every caller is free to invent a vendor id again" });
  } else {
    const src = stripComments(fs.readFileSync(resolverPath, "utf8"));
    if (!new RegExp(`export\\s+async\\s+function\\s+${RESOLVER_FN}\\b`).test(src)) {
      problems.push({ where: RESOLVER, why: `${RESOLVER_FN} is not exported — renamed or removed` });
    }
    if (!/\bfrom\s+mdata\.vendors\b/i.test(src)) {
      problems.push({ where: RESOLVER, why: "resolver does not read mdata.vendors — the canonical driver<->vendor bridge" });
    }
    // Scoped on the VENDOR row itself (`v.`), not merely somewhere in the statement — the driver
    // sub-probe also carries an operating_company_id predicate, and matching that one would let an
    // unscoped vendor SELECT read as scoped.
    if (!/\bv\.operating_company_id\s*=\s*\$1/.test(src)) {
      problems.push({ where: RESOLVER, why: "the vendor row is not entity-scoped — it could return another entity's vendor" });
    }
    if (!/\bdriver_id\s*=\s*\$2/.test(src)) {
      problems.push({ where: RESOLVER, why: "resolver does not match on mdata.vendors.driver_id — the canonical link" });
    }
    if (!/throw\s+new\s+DriverVendorMissingError/.test(src)) {
      problems.push({ where: RESOLVER, why: "resolver does not throw when no vendor resolves — a miss must stop the posting, not continue" });
    }
  }

  // ── B. universal: no id-substituting vendor fallback anywhere in the backend ───────────────────
  for (const abs of walk(path.join(root, SCAN_ROOT))) {
    const rel = path.relative(root, abs);
    if (rel === RESOLVER) continue; // the resolver documents the defect it replaces
    const src = stripComments(fs.readFileSync(abs, "utf8"));
    for (const re of VENDOR_FALLBACK_RES) {
      if (re.test(src)) {
        problems.push({
          where: rel,
          why: "a vendor identifier falls back to a driver id — resolve the vendor via resolveDriverVendorLink() and let a miss throw",
        });
        break;
      }
    }
  }

  // ── C. the known driver-pay bill posters must use the shared resolver ──────────────────────────
  for (const rel of CALLERS) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue; // deletion is a different class; absence is not this defect
    if (!stripComments(fs.readFileSync(abs, "utf8")).includes(`${RESOLVER_FN}(`)) {
      problems.push({ where: rel, why: `driver-pay bill poster does not call ${RESOLVER_FN}() — it resolves the vendor some other way` });
    }
  }

  return problems;
}

function report(problems) {
  if (problems.length === 0) {
    console.log(`${LABEL} — OK (driver A/P vendor is resolved, never substituted)`);
    return 0;
  }
  console.error(`${LABEL} FAIL — ${problems.length} violation(s):`);
  for (const p of problems) console.error(`  ${p.where}: ${p.why}`);
  return 1;
}

/** Mutation-proven: plant the defect => RED, restore => GREEN. */
async function selftest() {
  const failures = [];
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "drv-vendor-guard-"));

  const GOOD_RESOLVER = fs.readFileSync(path.join(ROOT, RESOLVER), "utf8");
  const callerSrc = CALLERS.map((rel) => fs.readFileSync(path.join(ROOT, rel), "utf8"));

  const writeAll = (resolverSrc, callers) => {
    fs.rmSync(path.join(tmp, "apps"), { recursive: true, force: true });
    const write = (rel, src) => {
      const abs = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, src);
    };
    if (resolverSrc !== null) write(RESOLVER, resolverSrc);
    CALLERS.forEach((rel, i) => write(rel, callers[i]));
  };

  // Baseline — the fixed tree must be GREEN.
  writeAll(GOOD_RESOLVER, callerSrc);
  const base = findViolations(tmp);
  if (base.length !== 0) failures.push(`case1 FAIL — fixed tree must be GREEN, got: ${base.map((p) => p.why).join("; ")}`);

  // Mutation 1 — the original defect, verbatim, back in the live poster.
  writeAll(GOOD_RESOLVER, [
    callerSrc[0].replace(
      /let driverVendorId: string;/,
      'const driverVendorId = String(driverRes.rows[0]?.qbo_vendor_id ?? settlement.driver_id).trim();\n    let _unusedDriverVendorId: string;'
    ),
    callerSrc[1],
  ]);
  if (findViolations(tmp).length === 0) failures.push("case2 FAIL — the original `qbo_vendor_id ?? driver_id` fallback must go RED.");

  // Mutation 2 — a driver id passed directly into a vendor argument slot.
  writeAll(GOOD_RESOLVER, [callerSrc[0].replace(/vendorId: driverVendorId,/, "vendorId: settlement.driver_id,"), callerSrc[1]]);
  if (findViolations(tmp).length === 0) failures.push("case3 FAIL — a driver id in a vendorId slot must go RED.");

  // Mutation 3 — resolver deleted; callers keep calling a resolver that is not there.
  writeAll(null, callerSrc);
  if (findViolations(tmp).length === 0) failures.push("case4 FAIL — a missing shared resolver must go RED.");

  // Mutation 4 — resolver returns a fallback instead of throwing.
  writeAll(
    GOOD_RESOLVER.replace(/throw new DriverVendorMissingError\([^;]*\);/, "return { vendorId: driverId, qboVendorId: null, vendorName: null };"),
    callerSrc
  );
  if (findViolations(tmp).length === 0) failures.push("case5 FAIL — a resolver that falls back instead of throwing must go RED.");

  // Mutation 5 — resolver loses its entity scope.
  writeAll(GOOD_RESOLVER.replace(/v\.operating_company_id = \$1::uuid/, "v.operating_company_id IS NOT NULL"), callerSrc);
  if (findViolations(tmp).length === 0) failures.push("case6 FAIL — an unscoped resolver must go RED.");

  // Mutation 6 — a caller stops using the shared resolver.
  writeAll(GOOD_RESOLVER, [callerSrc[0].replaceAll(`${RESOLVER_FN}(`, "resolveSomethingElse("), callerSrc[1]]);
  if (findViolations(tmp).length === 0) failures.push("case7 FAIL — a poster bypassing the shared resolver must go RED.");

  // Mutation 7 — the fix written only in a COMMENT must not read as the fix.
  writeAll(
    `// ${RESOLVER_FN} reads FROM mdata.vendors WHERE operating_company_id = $1::uuid AND driver_id = $2::uuid\n` +
      `// and does throw new DriverVendorMissingError(...) on a miss\nexport const noop = 1;\n`,
    callerSrc
  );
  if (findViolations(tmp).length === 0) failures.push("case8 FAIL — a fix written only in a comment must go RED.");

  // Restore.
  writeAll(GOOD_RESOLVER, callerSrc);
  if (findViolations(tmp).length !== 0) failures.push("case9 FAIL — restore must return GREEN.");

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const x of failures) console.error(`${LABEL} ${x}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST PASS — fixed GREEN; the original ?? fallback, a driver id in a vendor slot, ` +
      `a missing resolver, a returning-instead-of-throwing resolver, an unscoped resolver, a bypassing ` +
      `caller and a comment-only "fix" each RED; restore GREEN`
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : report(findViolations()));
}
