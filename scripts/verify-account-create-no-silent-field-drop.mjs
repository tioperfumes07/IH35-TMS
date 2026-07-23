#!/usr/bin/env node
/**
 * Rule-17 guard: the New Account drawer must PERSIST every field it collects.
 *
 * WHY THIS EXISTS
 * NewAccountDrawerForm rendered "Description", "Parent account", "Use for billable expenses" and
 * "Lock account", then built a create body containing only code / display_name / account_type /
 * account_subtype. All four inputs were silently discarded while the toast said "Account created".
 *
 * The worst case is "Lock account" — a §7 KEEP-listed control. A controller who ticked it on a
 * control account got `is_locked = false` and no warning: an account she believed was locked stayed
 * freely postable. "Parent account" was worse than lossy, it was impossible — a free-text box whose
 * value had to become a uuid FK (catalogs.accounts.parent_account_id, migration 0010).
 *
 * A collected-but-dropped field is a lie told to the operator, so this guard fails if the form ever
 * grows an input it does not send. Storage-less controls must be explicitly disabled + labelled
 * (the "billable expenses" case: catalogs.accounts has no billable column; persisting it needs an
 * owner-gated migration).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-account-create-no-silent-field-drop";
const FORM = "apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * Everything between `chartOfAccountsCatalogClient.create(` and its closing `});`, with comments
 * stripped. Stripping matters: a comment inside the call that merely NAMES a field (e.g. explaining
 * what parent_account_id is) would otherwise satisfy the "payload sends it" check and let the real
 * assignment be deleted undetected.
 */
function createBodyOf(source) {
  const start = source.indexOf("chartOfAccountsCatalogClient.create(");
  if (start === -1) return null;
  const end = source.indexOf("});", start);
  if (end === -1) return null;
  return source
    .slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

export function assertNoSilentFieldDrop(source) {
  const errors = [];
  const body = createBodyOf(source);
  if (!body) {
    errors.push("could not locate the chartOfAccountsCatalogClient.create(...) call — guard cannot verify the payload");
    return errors;
  }

  // field in state -> what the create payload must carry for it to survive the save
  const MUST_PERSIST = [
    ["description", "description:", "Description textarea"],
    ["parentAccount", "parent_account_id", "Parent account picker"],
    ["lockAccount", "is_locked", "Lock account checkbox (§7 KEEP-listed control)"],
  ];
  for (const [stateField, payloadToken, label] of MUST_PERSIST) {
    if (!source.includes(stateField)) continue; // field removed entirely — nothing to drop
    if (!body.includes(payloadToken)) {
      errors.push(`${label}: form collects \`${stateField}\` but the create payload never sends \`${payloadToken}\` — silently discarded on save`);
    }
  }

  // Parent account must be a real FK picker, never free text: a typed name can never resolve to
  // catalogs.accounts.parent_account_id (uuid).
  if (/placeholder="Parent account name or number"/.test(source)) {
    errors.push("Parent account is a free-text input again — its value must be a catalogs.accounts uuid, so typed text can never persist");
  }

  // A control with no storage must be visibly disabled, not silently ignored. Anchor on the JSX
  // checkbox, not the first mention of the name (that is the FormState type, far above the input).
  const billableInput = source.indexOf("checked={form.billableExpenses}");
  if (billableInput !== -1) {
    const block = source.slice(billableInput, billableInput + 400);
    if (!/disabled/.test(block)) {
      errors.push('"Use for billable expenses" has no catalogs.accounts column — it must stay `disabled` + labelled until an owner-approved migration adds one, never silently dropped');
    }
  }

  return errors;
}

/**
 * Planted-regression selftest: re-running the real check against the live tree can only ever confirm
 * today's tree, never that an assertion still bites. Each case below is the exact defect it stops.
 */
function selftest() {
  const problems = [];
  const live = read(FORM);

  const liveErrors = assertNoSilentFieldDrop(live);
  if (liveErrors.length) problems.push(`live source rejected: ${liveErrors.join("; ")}`);

  const cases = [
    ["description dropped from payload", live.replace(/description:\s*form\.description[^\n]*\n/, ""), "never sends `description:`"],
    ["parent_account_id dropped from payload", live.replace(/parent_account_id:\s*form\.isSubaccount[^\n]*\n/, ""), "never sends `parent_account_id`"],
    ["is_locked dropped from payload", live.replace(/is_locked:\s*form\.lockAccount[^\n]*\n/, ""), "never sends `is_locked`"],
    ["parent reverted to free text", live.replace(/<select/, '<input placeholder="Parent account name or number"'), "free-text input again"],
    ["billable checkbox silently re-enabled", live.replace(/\s+disabled\n/, "\n"), "must stay `disabled`"],
  ];

  for (const [name, mutated, expectFragment] of cases) {
    if (mutated === live) {
      problems.push(`planted regression "${name}" did not actually mutate the source — the selftest is inert`);
      continue;
    }
    const found = assertNoSilentFieldDrop(mutated);
    if (!found.some((e) => e.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — live source clean; ${cases.length} planted regressions caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const errors = assertNoSilentFieldDrop(read(FORM));
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
