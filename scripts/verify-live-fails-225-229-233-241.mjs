#!/usr/bin/env node
/**
 * LEAD live check 11-03 (Owner, USMCA, app.ih35dispatch.com 4:47–4:58 PM CT) — FAIL rows 225 229 233 241 + defects
 * 223 219 247 205. Root causes and the invariant held here:
 *   225/229/223  apps/frontend/src/lib/formatCompanyName.ts kept any mixed-case word as typed ("Roar loGISTICS INC")
 *                and lower-cased every all-caps token ("FLS" → "Fls"), against owner org-casing rule 443.266-A
 *                ("org acronym stays ACME"); a suffix glued after a comma ("Logistics,Llc") was never seen as LLC.
 *                BEHAVIOUR: the formatter is bundled (esbuild) and run against the live-fail table below.
 *   219          cash-flow payees had no casing path at all → pages/cash-flow/ledgerPartyLabel.ts routes them through
 *                the ONE org casing function (formatCompanyName).
 *   233          apps/backend/src/identity/users.routes.ts fabricated name "User" (14 rows) / an email local-part;
 *                fallback is now full name → email → "Invited user (<role>)", frontend userDisplayLabel the same.
 *   241          Combobox's default <input> had no min-w-0 (flex item min-width:auto ≈ 142px) so the Manual JE
 *                Account picker overlapped Debit in a 68px cell; ReferenceSelect root + MoneyInput likewise.
 *   247          ParityTable fell back to the column's HEADER className for data cells → uppercase on bank data.
 * --selftest plants each old defect back in memory; every plant must be caught.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-live-fails-225-229-233-241";
const FE = (p) => `apps/frontend/src/${p}`;
const require = createRequire(import.meta.url);

/** [input, expected] — every live-fail example (11-03) plus the owner's named cases. */
export const NAME_TABLE = [
  ["Roar loGISTICS INC", "Roar Logistics INC"],
  ["FLS Transport LLC", "FLS Transport LLC"],
  ["2EMS LOGISTICS LLC", "2EMS Logistics LLC"],
  ["IM TRUCKING INC", "IM Trucking INC"],
  ["AB Freight Lines", "AB Freight Lines"],
  ["ES TRANSPORT LLC", "ES Transport LLC"],
  ["RLS Logistics", "RLS Logistics"],
  ["PLS LOGISTICS SERVICES", "PLS Logistics Services"],
  ["IND FREIGHT SA DE CV", "IND Freight SA DE CV"],
  ["TTS Transport", "TTS Transport"],
  ["GLT LOGISTICS LLC", "GLT Logistics LLC"],
  ["GTM Freight", "GTM Freight"],
  ["DLS EXPRESS INC", "DLS Express INC"],
  ["XPR LOGISTICS", "XPR Logistics"],
  ["MPH Transport", "MPH Transport"],
  ["CTS LOGISTICS LLC", "CTS Logistics LLC"],
  ["ACME", "ACME"],
  ["Ac Trade & Logistics,Llc", "Ac Trade & Logistics, LLC"],
  ["Refrigerx Transportation Llc", "Refrigerx Transportation LLC"],
  ["Trident Transport, Llc", "Trident Transport, LLC"],
  ["Refrigerx Transportation LLC", "Refrigerx Transportation LLC"],
  ["Armstrong Transport Gr", "Armstrong Transport Gr"],
  ["Aak Mexico SA DE CV", "Aak Mexico SA DE CV"],
  ["(4wrdfreight&Logistics Groupinc", "(4wrdfreight&Logistics Groupinc"],
  ["ACME FREIGHT LLC", "Acme Freight LLC"],
  ["DE LA CRUZ TRUCKING INC", "De La Cruz Trucking INC"],
];

/** [what, file, needle that must be present, plant (old defect put back)] */
export const STATIC = [
  ["233 backend never fabricates 'User'", "apps/backend/src/identity/user-list-name.ts", "return `Invited user (${String(role ?? \"\").trim() || \"no role\"})`;", "return \"User\";"],
  ["233 users list maps through userListName", "apps/backend/src/identity/users.routes.ts", "    name: userListName(fullName, row.email, row.role),\n    first_name: firstName || null,\n    last_name: lastName || null,\n    email: row.email,\n    role: String(row.role),\n    auth_method", "    name: fullName || (row.email ? row.email.split(\"@\")[0] : \"User\"),\n    first_name: firstName || null,\n    last_name: lastName || null,\n    email: row.email,\n    role: String(row.role),\n    auth_method"],
  ["233 frontend label never bare User", FE("lib/entity-label.ts"), "  return `Invited user (${role || \"no role\"})`;", "  return entityLabel(null, user.id, \"User\");"],
  ["233 frontend ignores fabricated 'User'", FE("lib/entity-label.ts"), "if (!s || /^user$/i.test(s) || /^invited user \\(/i.test(s)) return \"\";", "if (!s) return \"\";"],
  ["241 combobox default input shrinks", FE("components/Combobox.tsx"), ": \"h-full min-h-0 w-full min-w-0 bg-transparent", ": \"h-full min-h-0 w-full bg-transparent"],
  ["241 combobox form input shrinks", FE("components/Combobox.tsx"), "? `h-10 w-full min-w-0 rounded-sm border px-2", "? `h-10 w-full rounded-sm border px-2"],
  ["241 ReferenceSelect root fills its cell", FE("components/parity/ReferenceSelect.tsx"), "<div className=\"flex w-full min-w-0 items-center gap-2\" data-testid=\"reference-select-root\">", "<div className=\"flex items-center gap-2\" data-testid=\"reference-select-root\">"],
  ["241 MoneyInput shrinks", FE("components/forms/MoneyInput.tsx"), "text-left text-xs tabular-nums min-w-0\"", "text-left text-xs tabular-nums\""],
  ["241 Manual JE grid items min-w-0", FE("components/accounting/ManualJEModal.tsx"), "gap-1 [&>*]:min-w-0`;", "gap-1`;"],
  ["247 header class never styles data", FE("components/parity/ParityTable.tsx"), "const base = column.cellClass ?? cellClassFromHeaderClass(column.className);", "const base = column.cellClass ?? column.className ?? \"\";"],
  ["247 uppercase is header-only", FE("components/parity/ParityTable.tsx"), "const HEADER_ONLY_CELL_TOKEN = /^(?:uppercase|normal-case|text-section-header|tracking-\\S+)$/;", "const HEADER_ONLY_CELL_TOKEN = /^(?:text-section-header)$/;"],
  ["219 cash-flow payee uses the one org casing", FE("pages/cash-flow/ledgerPartyLabel.ts"), "return tail ? `${formatCompanyName(raw.slice(0, tail.index))}${tail[0]}` : formatCompanyName(raw);", "return raw;"],
];

/** Formatter plants — old defects put back into formatCompanyName.ts (caught by the behaviour table). */
export const FORMATTER = FE("lib/formatCompanyName.ts");
export const FORMATTER_PLANTS = [
  ["hybrid kept as typed (Roar loGISTICS)", "  if (isDeliberateCamel(word)) return word;", "  if (word !== word.toUpperCase() && word !== word.toLowerCase()) return word;"],
  ["acronyms title-cased (Fls / Xpr)", "    if (l.length >= 2 && l.length <= limit) return word;", "    if (false) return word;"],
  ["comma-glued suffix missed (Logistics,Llc)", "    .replace(/,(?=\\S)/g, \", \")\n", ""],
  ["legal suffix not upper", "  if (KEEP_UPPER.has(b)) return word.toUpperCase();", "  if (KEEP_UPPER.has(b)) return titleCase(word);"],
];

const read = (rel) => {
  try {
    return readFileSync(path.join(ROOT, rel), "utf8");
  } catch {
    return null;
  }
};

async function loadFormatter(source) {
  const esbuild = require(path.join(ROOT, "node_modules/esbuild"));
  const out = esbuild.buildSync({
    stdin: { contents: source, resolveDir: path.join(ROOT, "apps/frontend/src/lib"), loader: "ts", sourcefile: "formatCompanyName.ts" },
    bundle: true,
    write: false,
    format: "esm",
    platform: "neutral",
    logLevel: "silent",
  });
  const code = out.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}

export async function formatterDefects(source) {
  const out = [];
  let mod;
  try {
    mod = await loadFormatter(source);
  } catch (e) {
    return [`${FORMATTER}: does not build (${String(e?.message ?? e).split("\n")[0]})`];
  }
  for (const [input, expected] of NAME_TABLE) {
    const got = mod.formatCompanyName(input);
    if (got !== expected) out.push(`${FORMATTER}: "${input}" → "${got}" (expected "${expected}")`);
    for (const w of got.split(" ")) if (/^[a-z]+[A-Z]{2,}/.test(w)) out.push(`${FORMATTER}: "${input}" emits a lower-then-caps hybrid "${w}"`);
  }
  return out;
}

export function staticDefects(files) {
  const out = [];
  for (const [what, file, needle] of STATIC) {
    const src = files[file];
    if (src == null) out.push(`${what}: ${file} missing`);
    else if (!src.includes(needle)) out.push(`${what}: ${file} lost the fix (${needle.split("\n")[0].slice(0, 80)})`);
  }
  return out;
}

const files = Object.fromEntries([...new Set(STATIC.map((s) => s[1]))].map((f) => [f, read(f)]));
const formatterSrc = read(FORMATTER) ?? "";

if (process.argv.includes("--selftest")) {
  let caught = 0;
  let total = 0;
  const clean = staticDefects(files).length === 0 && (await formatterDefects(formatterSrc)).length === 0;
  console.log(`${clean ? "ok  " : "MISS"}  clean tree passes`);
  for (const [what, file, needle, plant] of STATIC) {
    total++;
    const src = files[file] ?? "";
    const planted = src.split(needle).join(plant);
    const hit = planted !== src && staticDefects({ ...files, [file]: planted }).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${what}`);
    if (hit) caught++;
  }
  for (const [what, from, to] of FORMATTER_PLANTS) {
    total++;
    const planted = formatterSrc.replace(from, to);
    const hit = planted !== formatterSrc && (await formatterDefects(planted)).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: formatCompanyName — ${what}`);
    if (hit) caught++;
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${total} planted defects caught${clean ? "" : " (clean tree FAILS)"}`);
  process.exit(clean && caught === total ? 0 : 1);
}

const defects = [...staticDefects(files), ...(await formatterDefects(formatterSrc))];
if (defects.length) {
  console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${NAME_TABLE.length} live-fail names format correctly; ${STATIC.length} fixes held (rows 219 233 241 247)`);

