#!/usr/bin/env node
// verify-financial-entity-scope.mjs — cross-entity-leak regression guard (USMCA-launch blocker fixes).
//
// After AF-1/AF-2/AF-3 made catalogs.accounts / catalogs.items / catalogs.classes PER-ENTITY, four financial
// code paths were leaking across TRANSP / TRK / USMCA because they read/wrote without an operating_company_id
// predicate (fail-closed-to-empty under RLS, or blend/mis-post under a bypass role). This STATIC guard pins
// each fixed query so a future edit can't silently drop the entity scope again. No DB, no network.
//
// Asserts:
//   1. posting-engine.service.ts  — the invoice→A/R `catalogs.items` join carries an operating_company_id predicate.
//   2. catalogs/classes.routes.ts — the INSERT INTO catalogs.classes lists operating_company_id.
//   3. driver-subaccount-provision.service.ts — BOTH INSERT INTO catalogs.accounts list operating_company_id,
//      and both parent-lookup SELECTs carry an operating_company_id predicate.
//   4. period-close-retained-earnings.service.ts — the final "any Equity account" fallback carries an
//      operating_company_id predicate (never posts one entity's RE plug to another entity's Equity).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");
const errs = [];

function read(rel) {
  const p = path.join(SRC, rel);
  if (!fs.existsSync(p)) {
    errs.push(`${rel}: file not found (guard target moved — update verify-financial-entity-scope.mjs)`);
    return null;
  }
  return fs.readFileSync(p, "utf8");
}

// Collapse whitespace so multi-line SQL can be matched with simple substring/regex checks.
const flat = (s) => s.replace(/\s+/g, " ");

// 1) posting-engine: catalogs.items join must be entity-scoped.
{
  const f = read("accounting/posting-engine.service.ts");
  if (f) {
    const joinRe = /LEFT JOIN catalogs\.items it\b([\s\S]{0,200}?)(?:LEFT JOIN|WHERE)/i;
    const m = joinRe.exec(f);
    if (!m) {
      errs.push("posting-engine.service.ts: could not locate the `LEFT JOIN catalogs.items it` block");
    } else if (!/it\.operating_company_id/.test(m[1])) {
      errs.push("posting-engine.service.ts: catalogs.items join lost its operating_company_id predicate (cross-entity revenue-account leak)");
    }
  }
}

// 2) classes.routes: INSERT INTO catalogs.classes must store operating_company_id.
{
  const f = read("catalogs/classes.routes.ts");
  if (f) {
    const insRe = /INSERT INTO catalogs\.classes\s*\(([\s\S]*?)\)\s*VALUES/i;
    const m = insRe.exec(f);
    if (!m) {
      errs.push("classes.routes.ts: could not locate INSERT INTO catalogs.classes");
    } else if (!/operating_company_id/.test(m[1])) {
      errs.push("classes.routes.ts: INSERT INTO catalogs.classes omits operating_company_id (unscoped class create)");
    }
  }
}

// 3) driver-subaccount: both catalogs.accounts INSERTs + both parent lookups must be entity-scoped.
{
  const f = read("accounting/driver-subaccount-provision.service.ts");
  if (f) {
    const inserts = [...f.matchAll(/INSERT INTO catalogs\.accounts\s*\(([\s\S]*?)\)\s*VALUES/gi)];
    if (inserts.length < 2) {
      errs.push(`driver-subaccount-provision.service.ts: expected 2 INSERT INTO catalogs.accounts, found ${inserts.length}`);
    }
    inserts.forEach((m, i) => {
      if (!/operating_company_id/.test(m[1])) {
        errs.push(`driver-subaccount-provision.service.ts: INSERT INTO catalogs.accounts #${i + 1} omits operating_company_id (driver sub-account nests under wrong entity)`);
      }
    });
    // Parent + idempotency lookups must predicate operating_company_id.
    const lookups = [...f.matchAll(/FROM catalogs\.accounts\s+WHERE([\s\S]*?)(?:ORDER BY|LIMIT)/gi)];
    if (lookups.length < 2) {
      errs.push(`driver-subaccount-provision.service.ts: expected >=2 catalogs.accounts SELECT lookups, found ${lookups.length}`);
    }
    lookups.forEach((m, i) => {
      if (!/operating_company_id/.test(m[1])) {
        errs.push(`driver-subaccount-provision.service.ts: catalogs.accounts lookup #${i + 1} omits operating_company_id predicate (cross-entity parent resolution)`);
      }
    });
  }
}

// 4) period-close: the "any Equity account" fallback must be entity-scoped.
{
  const f = read("accounting/period-close-retained-earnings.service.ts");
  if (f) {
    const fl = flat(f);
    // The bare fallback selects catalogs.accounts WHERE account_type = 'Equity' ... LIMIT 1.
    const fbRe = /FROM catalogs\.accounts WHERE account_type = 'Equity'([\s\S]{0,140}?)LIMIT 1/i;
    const m = fbRe.exec(fl);
    if (!m) {
      errs.push("period-close-retained-earnings.service.ts: could not locate the Equity fallback SELECT");
    } else if (!/operating_company_id/.test(m[1])) {
      errs.push("period-close-retained-earnings.service.ts: Equity fallback omits operating_company_id predicate (RE plug can post to another entity's Equity)");
    }
  }
}

if (errs.length === 0) {
  console.log("[financial-entity-scope] PASS — invoice-item join, classes INSERT, driver sub-account INSERTs/lookups, and RE Equity fallback are all entity-scoped.");
  process.exit(0);
}
console.error("\nFINANCIAL-ENTITY-SCOPE GUARD FAILED (cross-entity leak reintroduced)");
console.error("=".repeat(72));
for (const e of errs) console.error("  " + e);
console.error("=".repeat(72));
process.exit(1);
