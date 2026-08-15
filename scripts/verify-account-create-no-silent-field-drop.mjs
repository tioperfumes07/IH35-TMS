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
const NEW_FORM = "apps/frontend/src/components/parity/drawers/NewAccountDrawerForm.tsx";
const DRAWER = "apps/frontend/src/pages/lists/accounting/AccountDrawer.tsx";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/** LST-F3354 — thin wrapper delegates create chrome to AccountDrawer. */
function newFormEmbedsAccountDrawer(newFormSrc) {
  return (
    /<AccountDrawer[\s>]/.test(newFormSrc) &&
    (/from ["'].*AccountDrawer["']|from ["'].*\/AccountDrawer["']/.test(newFormSrc) ||
      /import\s*\{\s*AccountDrawer\s*\}/.test(newFormSrc))
  );
}

/** Which file owns the create payload under test. */
function createChromeRel(newFormSrc) {
  return newFormEmbedsAccountDrawer(newFormSrc) ? DRAWER : NEW_FORM;
}

/**
 * Everything between `chartOfAccountsCatalogClient.create(` and its closing `});`, with comments
 * stripped. Stripping matters: a comment inside the call that merely NAMES a field (e.g. explaining
 * what parent_account_id is) would otherwise satisfy the "payload sends it" check and let the real
 * assignment be deleted undetected.
 *
 * LST-F3354: AccountDrawer uses `const body = {…}` + createCatalogAccount(body).
 */
function createBodyOf(source) {
  const stripComments = (s) =>
    s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  const legacyStart = source.indexOf("chartOfAccountsCatalogClient.create(");
  if (legacyStart !== -1) {
    const end = source.indexOf("});", legacyStart);
    if (end !== -1) return stripComments(source.slice(legacyStart, end));
  }

  const bodyStart = source.indexOf("const body = {");
  if (bodyStart !== -1) {
    const end = source.indexOf("};", bodyStart);
    if (end !== -1) return stripComments(source.slice(bodyStart, end + 2));
  }

  return null;
}

export function assertNoSilentFieldDrop(source) {
  const errors = [];
  const body = createBodyOf(source);
  if (!body) {
    errors.push(
      "could not locate create payload (chartOfAccountsCatalogClient.create or const body + createCatalogAccount) — guard cannot verify the payload",
    );
    return errors;
  }

  // field in state -> what the create payload must carry for it to survive the save
  const MUST_PERSIST = [
    { collect: /form\.description|setField\("description"/, payload: "description:", label: "Description textarea" },
    { collect: /form\.notes|setField\("notes"/, payload: "notes:", label: "Description textarea (AccountDrawer notes field)" },
    { collect: /form\.parentAccount|setField\("parentAccount"/, payload: "parent_account_id", label: "Parent account picker" },
    { collect: /form\.parent_account_id|setField\("parent_account_id"/, payload: "parent_account_id", label: "Parent account FK (AccountDrawer)" },
    { collect: /form\.lockAccount|setField\("lockAccount"/, payload: "is_locked", label: "Lock account checkbox (§7 KEEP-listed control)" },
    { collect: /form\.is_locked|setField\("is_locked"/, payload: "is_locked", label: "Lock account checkbox (AccountDrawer)" },
    // Storage landed in migration 202607750000 (catalogs.accounts.is_billable_expense) and the
    // catalogs accounting factory now maps it, so this field must be SENT when the UI collects it.
    { collect: /form\.billableExpenses|setField\("billableExpenses"/, payload: "is_billable_expense", label: "Use-for-billable-expenses checkbox" },
  ];
  for (const { collect, payload, label } of MUST_PERSIST) {
    if (!collect.test(source)) continue; // field removed entirely — nothing to drop
    if (!body.includes(payload)) {
      errors.push(`${label}: form collects the field but the create payload never sends \`${payload.replace(":", "")}\` — silently discarded on save`);
    }
  }

  // Parent account must be a real FK picker, never free text: a typed name can never resolve to
  // catalogs.accounts.parent_account_id (uuid).
  if (/placeholder="Parent account name or number"/.test(source)) {
    errors.push("Parent account is a free-text input again — its value must be a catalogs.accounts uuid, so typed text can never persist");
  }

  // INVERTED once the column shipped: while catalogs.accounts had no billable column this control
  // had to stay `disabled` so it could not lie. Migration 202607750000 added the column, so it must
  // now be ENABLED and actually persisted — a disabled control here would be a silent regression
  // back to "collects a value nobody stores".
  const billableInput = source.indexOf("checked={form.billableExpenses}");
  if (billableInput !== -1) {
    const block = source.slice(billableInput, billableInput + 400);
    if (/disabled/.test(block)) {
      errors.push('"Use for billable expenses" is disabled again — catalogs.accounts.is_billable_expense exists (migration 202607750000), so the control must be enabled and sent');
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
  const newFormLive = read(NEW_FORM);
  const chromeRel = createChromeRel(newFormLive);
  const live = read(chromeRel);

  const liveErrors = assertNoSilentFieldDrop(live);
  if (liveErrors.length) problems.push(`live source rejected (${chromeRel}): ${liveErrors.join("; ")}`);

  const cases = [
    ["notes dropped from payload", live.replace(/notes:\s*form\.notes[^\n]*\n/, ""), "never sends `notes`"],
    ["parent_account_id dropped from payload", live.replace(/parent_account_id:\s*mode === "create"[^\n]*\n/, ""), "never sends `parent_account_id`"],
    ["is_locked dropped from payload", live.replace(/is_locked:\s*form\.is_locked[^\n]*\n/, ""), "never sends `is_locked`"],
    ["parent reverted to free text", live.replace(/<ReferenceSelect/, '<input placeholder="Parent account name or number"'), "free-text input again"],
  ];
  if (/billableExpenses/.test(live)) {
    cases.push(
      ["is_billable_expense dropped from payload", live.replace(/is_billable_expense:\s*form\.billableExpenses[^\n]*\n/, ""), "never sends `is_billable_expense`"],
      ["billable checkbox disabled again", live.replace(/checked=\{form\.billableExpenses\}/, "checked={form.billableExpenses} disabled"), "is disabled again"],
    );
  }

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

const newFormSrc = read(NEW_FORM);
if (newFormEmbedsAccountDrawer(newFormSrc) && /const DETAIL_TYPES\s*[:=]/.test(newFormSrc)) {
  console.error(`${LABEL} FAIL`);
  console.error("  NewAccountDrawerForm must not hardcode DETAIL_TYPES when embedding AccountDrawer");
  process.exit(1);
}
const errors = assertNoSilentFieldDrop(read(createChromeRel(newFormSrc)));
if (errors.length) {
  console.error(`${LABEL} FAIL`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
