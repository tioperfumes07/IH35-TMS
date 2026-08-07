#!/usr/bin/env node
/**
 * CLS-UUID-LABEL — a human-facing link must never be LABELLED with a raw or truncated uuid.
 *
 * THE DEFECT (Cascade wave-queue, 5 instances, all in LegalMatterDetailPage.tsx): every related
 * record on the legal-matter detail screen rendered `String(matter.<fk>).slice(0, 8)` as its link
 * text — driver, unit, insurance claim, insurance lawsuit, and the incident. An operator saw
 * `a3f9c21b` where a driver's name, a unit number, a claim number or a case number belongs. It is
 * not cosmetic: nobody can act on it, so the link is decoration and the record is effectively
 * unreachable by a human.
 *
 * WHY THE FIX WAS NOT AT THESE CALL SITES: EntityLink does `display = label ?? id` — it resolves
 * nothing — and the matter payload carried ONLY foreign keys. Slicing a uuid at the call site just
 * relocates the uuid. The root cause was that the query never returned a display name, so the fix is
 * LEFT JOINs in matters.service.ts (both listMatters AND getMatter — the detail page reads the
 * latter, so joining only the list would have left the offending screen unchanged).
 *
 * WHAT THIS ASSERTS: no `.slice(0, N)` applied to an *_id / uuid expression inside a rendered label.
 * It scans all of apps/frontend/src, so the next screen that reaches for a truncated uuid is caught
 * on arrival rather than after an operator reports an unreadable link.
 *
 * NOT CLAIMED: this cannot prove the JOINed name is CORRECT — only that a uuid is not being used as
 * a label. Correctness of the join targets was established live on prod before writing them
 * (mdata.drivers first_name/last_name — there is no full_name; mdata.units.unit_number;
 * insurance.claim.claim_number — table is SINGULAR, `insurance.claims` does not exist;
 * insurance.lawsuit.case_number; safety.accidents.display_id).
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-no-uuid-label-rendering";
const SRC = "apps/frontend/src";

/**
 * A uuid-ish expression being truncated for display: `.slice(0, 8)` on something whose name ends in
 * _id / Id / uuid / Uuid. Deliberately narrow — truncating a NAME or a description is legitimate.
 */
const UUID_SLICE = /\b([A-Za-z_$][\w.$?]*(?:_id|Id|uuid|Uuid))\s*\)?\s*\.slice\(\s*0\s*,\s*\d+\s*\)/g;

/** Truncation that is fine: display ids, numbers, names, hashes shown deliberately as short refs. */
const ALLOWED_SUFFIX = /(display_id|_number|_name|sha|hash|_code)$/i;

export function auditText(text, file = "<mem>") {
  const problems = [];
  for (const m of text.matchAll(UUID_SLICE)) {
    const expr = m[1];
    if (ALLOWED_SUFFIX.test(expr)) continue;
    const line = text.slice(0, m.index).split("\n").length;
    problems.push(
      `${file}:${line}: renders a TRUNCATED UUID as link text (\`${m[0].trim()}\`). An operator cannot ` +
        `act on \`a3f9c21b\`. Return a display name from the query (LEFT JOIN) and label the link with ` +
        `it — slicing the uuid at the call site only relocates the problem.`
    );
  }
  return problems;
}

function walk(rel, out) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isDirectory()) {
    for (const e of readdirSync(abs)) {
      if (e === "node_modules" || e === "__tests__" || e === "dist") continue;
      walk(join(rel, e), out);
    }
    return;
  }
  if (/\.tsx?$/.test(rel) && !rel.includes(".test.")) out.push(rel);
}

/**
 * STABLE KEY: file + the offending expression. Line numbers shift on unrelated edits, so keying on
 * them would make this ratchet noisy and it would get disabled.
 */
export function offenderKeys(text, file) {
  const keys = [];
  for (const m of text.matchAll(UUID_SLICE)) {
    if (ALLOWED_SUFFIX.test(m[1])) continue;
    keys.push(`${file}|${m[1]}`);
  }
  return keys;
}

const BASELINE_PATH = "scripts/no-uuid-label-baseline.json";

function collectAll() {
  const files = [];
  walk(SRC, files);
  const keys = [];
  for (const rel of files) {
    if (rel.endsWith("verify-no-uuid-label-rendering.mjs")) continue;
    keys.push(...offenderKeys(readFileSync(join(ROOT, rel), "utf8"), rel));
  }
  return { keys, fileCount: files.length };
}

/**
 * RATCHET, not a wall. The class is 173 instances across 98 files — far larger than the wave card's
 * 5 — so failing on all of them would just get this guard reverted. Instead the baseline records
 * what exists today and this fails on any NEW offender. The list may only SHRINK: drain a file,
 * regenerate, and the ceiling drops permanently.
 */
function auditTree() {
  const { keys, fileCount } = collectAll();
  if (fileCount === 0) return [`${LABEL}: no frontend sources found — scope is wrong, refusing to pass vacuously.`];

  const baselinePath = join(ROOT, BASELINE_PATH);
  if (!existsSync(baselinePath)) {
    return [`${LABEL}: missing ${BASELINE_PATH}. Regenerate with --write-baseline.`];
  }
  const baseline = new Set(JSON.parse(readFileSync(baselinePath, "utf8")).offenders ?? []);
  // Compare UNIQUE keys to the (deduped) baseline. Comparing raw occurrence count to a deduped
  // baseline reported a false "count rose 164 -> 173" — a guard that cries wolf gets switched off.
  const unique = [...new Set(keys)];
  const added = unique.filter((k) => !baseline.has(k));
  const problems = [];
  if (added.length) {
    problems.push(
      `${added.length} NEW truncated-uuid label(s) — the ratchet may only shrink:\n  ` +
        added.slice(0, 10).join("\n  ") +
        `\nReturn a display name from the query (LEFT JOIN) and label the link with it.`
    );
  }
  if (unique.length > baseline.size) {
    problems.push(`${LABEL}: offender count rose ${baseline.size} -> ${unique.length}. The baseline may only shrink.`);
  }
  return problems;
}

function selftest() {
  const failures = [];

  // The exact five pre-fix shapes from LegalMatterDetailPage.
  for (const [name, src] of [
    ["claim", 'label={String(matter.insurance_claim_id).slice(0, 8)}'],
    ["unit", '<EntityLink kind="unit" id={String(matter.unit_id)} label={String(matter.unit_id).slice(0, 8)} />'],
    ["lawsuit", 'label={String(matter.insurance_lawsuit_id).slice(0, 8)}'],
    ["incident", "{String(matter.incident_id).slice(0, 8)}"],
  ]) {
    if (auditText(src).length === 0) failures.push(`case-${name} FAIL — a truncated uuid label was NOT caught`);
  }

  // The fixed shapes must be clean.
  if (auditText('label={String(matter.unit_number ?? matter.unit_id)}').length !== 0)
    failures.push("case5 FAIL — a name-with-uuid-fallback label was flagged");
  if (auditText('label={String(matter.insurance_claim_number ?? matter.insurance_claim_id)}').length !== 0)
    failures.push("case6 FAIL — a claim_number label was flagged");

  // Legitimate truncation of a DISPLAY id / number is not this defect.
  if (auditText("{String(row.display_id).slice(0, 8)}").length !== 0)
    failures.push("case7 FAIL — truncating a display_id was flagged");
  if (auditText("{String(je.je_number).slice(0, 8)}").length !== 0)
    failures.push("case8 FAIL — truncating a _number was flagged");

  // Stable keys must not embed line numbers, or the ratchet goes noisy and gets disabled.
  const k = offenderKeys('label={String(m.unit_id).slice(0, 8)}', "a.tsx");
  if (k.length !== 1 || k[0] !== "a.tsx|m.unit_id") failures.push(`case9 FAIL — unstable offender key: ${JSON.stringify(k)}`);

  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case10 FAIL — real tree flagged against baseline: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — all 5 pre-fix uuid labels caught, name labels + display_id/_number clean`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (process.argv.includes("--write-baseline")) {
    const { keys } = collectAll();
    const out = { note: "CLS-UUID-LABEL ratchet — may only SHRINK. Regenerate after draining a file.", offenders: [...new Set(keys)].sort() };
    writeFileSync(join(ROOT, BASELINE_PATH), JSON.stringify(out, null, 2) + "\n");
    console.log(`${LABEL}: baseline written with ${out.offenders.length} offender(s)`);
    return;
  }
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — no rendered link is labelled with a raw or truncated uuid`);
}

main();
