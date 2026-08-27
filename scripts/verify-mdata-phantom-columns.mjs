#!/usr/bin/env node
/**
 * §4 phantom-column guard for mdata backend SQL. Two recurring 42703 / cross-entity-leak bugs:
 *
 *  A) mdata.equipment has NO `operating_company_id` column — it carries `owner_company_id`
 *     (TRK owns) + `currently_leased_to_company_id` (TRANSP/USMCA lease), per migration 0015.
 *     Any SQL that filters mdata.equipment by operating_company_id 42703s → runtime 500
 *     (dispatch/equipment-transfer/request.service.ts). Scope by the owner/leased pair instead.
 *
 *  B) mdata.drivers has NO `full_name` column — only certain VIEWS expose a
 *     CONCAT_WS(first_name,last_name) AS full_name. Selecting a bare `full_name` (or `d.full_name`)
 *     from mdata.drivers 42703s. This one silently broke the driver-active safety gate inside a
 *     Promise.allSettled (dispatch/validation/pre-dispatch-validator.service.ts). The FIX form
 *     `CONCAT_WS(' ', first_name, last_name) AS full_name` is allowed (the token is preceded by `AS`).
 *
 * The guard scans backtick SQL string literals in apps/backend/src (skipping tests) so it never
 * flags a JS property access like `row.full_name` outside a query. It complements the sibling
 * verify-units-no-operating-company-id.mjs (mdata.units) and the real-DB
 * drivers/__tests__/driver-full-name-phantom.db.test.ts.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const BACKEND = path.join(ROOT, "apps/backend/src");

/** Recursively collect .ts files (skip tests + node_modules). */
function tsFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      out.push(...tsFiles(full));
    } else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

/** Strip SQL comments (block + line) so tokens that live only in a comment don't false-positive. */
function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

/** Extract the contents of every backtick template literal in a source file. */
function backtickLiterals(src) {
  const literals = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === "`") {
      let j = i + 1;
      let buf = "";
      while (j < src.length && src[j] !== "`") {
        if (src[j] === "\\") {
          buf += src[j] + (src[j + 1] ?? "");
          j += 2;
          continue;
        }
        buf += src[j];
        j += 1;
      }
      literals.push(buf);
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return literals;
}

// Word-boundary: `mdata.equipment` NOT followed by `_` (excludes equipment_log / equipment_types / …).
const EQUIPMENT_RE = /mdata\.equipment(?![_a-zA-Z0-9])/;
const DRIVERS_RE = /mdata\.drivers(?![_a-zA-Z0-9])/;

function hasPhantomDriverFullName(sql) {
  const driverAliases = new Set();
  for (const aliasMatch of sql.matchAll(/mdata\.drivers(?![_a-zA-Z0-9])\s+(?:AS\s+)?([a-z_]\w*)/gi)) {
    const alias = aliasMatch[1];
    if (!["ON", "WHERE", "USING", "LEFT", "RIGHT", "INNER", "JOIN", "AS", "LIMIT", "ORDER", "GROUP"].includes(alias.toUpperCase())) {
      driverAliases.add(alias.toLowerCase());
    }
  }
  const otherTable = /\b(?:FROM|JOIN)\s+(?!mdata\.drivers(?![_a-zA-Z0-9]))[a-z_]+\.[a-z_]+/i.test(sql);
  for (const m of sql.matchAll(/(?<![A-Za-z0-9_])full_name(?![A-Za-z0-9_])/gi)) {
    const before = sql.slice(Math.max(0, m.index - 6), m.index);
    if (/\bas\s+$/i.test(before)) continue;
    const qualifier = sql.slice(0, m.index).match(/([a-z_]\w*)\.\s*$/i)?.[1]?.toLowerCase();
    if ((qualifier != null && driverAliases.has(qualifier)) || (qualifier == null && !otherTable)) return true;
  }
  return false;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["SELECT d.full_name FROM mdata.drivers d", true, "driver-qualified phantom"],
    ["SELECT full_name FROM mdata.drivers", true, "bare single-table phantom"],
    ["SELECT CONCAT_WS(' ', d.first_name, d.last_name) AS full_name FROM mdata.drivers d", false, "derived alias"],
    ["SELECT hos.full_name FROM views.drivers_with_hos_status hos JOIN mdata.drivers d ON d.id = hos.id", false, "view-qualified field"],
  ];
  for (const [sql, expected, label] of cases) {
    if (hasPhantomDriverFullName(sql) !== expected) {
      console.error(`✘ verify-mdata-phantom-columns selftest: ${label}`);
      process.exit(1);
    }
  }
  console.log(`✅ verify-mdata-phantom-columns selftest: ${cases.length}/${cases.length} fixtures classified`);
  process.exit(0);
}

const violations = [];

for (const file of tsFiles(BACKEND)) {
  const src = fs.readFileSync(file, "utf8");
  const relPath = path.relative(ROOT, file);

  for (const rawSql of backtickLiterals(src)) {
    const sql = stripSqlComments(rawSql);
    // Queries that (also) reference the correct owner/leased columns are either already-correct or a
    // defensive columnExists() ternary fallback — not the phantom-column bug. Exempt them.
    const usesOwnerLeased = /\b(?:owner_company_id|currently_leased_to_company_id)\b/.test(sql);

    // --- Rule A: mdata.equipment.operating_company_id (phantom) ---
    if (EQUIPMENT_RE.test(sql) && /\boperating_company_id\b/.test(sql) && !usesOwnerLeased) {
      // Collect aliases bound to mdata.equipment (word-boundary), e.g. "mdata.equipment e" / "AS eq".
      const aliases = new Set();
      for (const m of sql.matchAll(/mdata\.equipment(?![_a-zA-Z0-9])\s+(?:AS\s+)?([a-z_]\w*)/gi)) {
        const a = m[1];
        if (!["ON", "WHERE", "USING", "LEFT", "RIGHT", "INNER", "JOIN", "AS", "LIMIT", "ORDER", "GROUP"].includes(a.toUpperCase())) {
          aliases.add(a);
        }
      }
      // Is mdata.equipment the ONLY real table in this SQL string? (single-table → bare col is equipment's)
      const otherTable = /\b(?:FROM|JOIN)\s+(?!mdata\.equipment(?![_a-zA-Z0-9]))[a-z_]+\.[a-z_]+/i.test(sql);
      let flagged = false;
      for (const a of aliases) {
        if (new RegExp(`\\b${a}\\.operating_company_id\\b`).test(sql)) {
          violations.push(
            `${relPath}: alias '${a}' (mdata.equipment) references ${a}.operating_company_id — equipment has no such column (use owner_company_id / currently_leased_to_company_id) [§4/42703]`
          );
          flagged = true;
        }
      }
      // Un-aliased single-table equipment query with a bare operating_company_id predicate.
      if (!flagged && aliases.size === 0 && !otherTable) {
        violations.push(
          `${relPath}: single-table mdata.equipment query filters bare operating_company_id — equipment has no such column (use owner_company_id / currently_leased_to_company_id) [§4/42703]`
        );
      }
    }

    // --- Rule B: mdata.drivers bare full_name (phantom); `AS full_name` alias is allowed ---
    if (DRIVERS_RE.test(sql) && hasPhantomDriverFullName(sql)) {
      violations.push(
        `${relPath}: SQL against mdata.drivers references bare 'full_name' — drivers has no full_name column (use CONCAT_WS(' ', first_name, last_name) AS full_name) [§4/42703]`
      );
    }
  }
}

if (violations.length > 0) {
  console.error("✘ verify-mdata-phantom-columns: phantom mdata column reference(s) found:");
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log("✅ verify-mdata-phantom-columns: no phantom mdata.equipment.operating_company_id / mdata.drivers.full_name references");
