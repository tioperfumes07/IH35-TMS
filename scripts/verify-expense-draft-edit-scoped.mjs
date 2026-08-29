#!/usr/bin/env node
/**
 * WAVE-3-EDIT-01 — PATCH /api/v1/expenses/:expenseId (draft-only edit).
 *
 * Locks the safety properties of the new draft-edit route: refuses anything that is not
 * status='draft' AND posting_status='unposted' (FAIL LOUD, never a silent no-op on a posted or void
 * expense), refuses an expense that already carries expense_lines (would desync total_amount_cents
 * from SUM(lines)), requires a reason on every edit (Wave-3's own rule), requires Owner/Accountant
 * authorization (canVoid — the same tier as /post and /void), and writes a full before/after audit
 * trail via appendCrudAudit.
 */
import fs from "node:fs";

const ROUTES_REL = "apps/backend/src/accounting/expenses.routes.ts";

export function run(root = process.cwd()) {
  const failures = [];
  let src;
  try {
    src = fs.readFileSync(`${root}/${ROUTES_REL}`, "utf8");
  } catch {
    return [`${ROUTES_REL}: missing`];
  }

  const fnMatch = src.match(/app\.patch\("\/api\/v1\/expenses\/:expenseId"[\s\S]*?\n {2}\}\);/);
  const fn = fnMatch ? fnMatch[0] : "";
  if (!fn) {
    failures.push(`${ROUTES_REL}: PATCH /api/v1/expenses/:expenseId route not found`);
    return failures;
  }

  if (!/reason: z\.string\(\)\.trim\(\)\.min\(1\)/.test(src.slice(0, src.indexOf(fn) + fn.length))) {
    failures.push(`${ROUTES_REL}: patchExpenseDraftBodySchema must require a non-empty reason`);
  }
  if (!fn.includes(`if (exp.status !== "draft" || exp.posting_status !== "unposted")`)) {
    failures.push(`${ROUTES_REL}: must refuse anything that is not status=draft AND posting_status=unposted`);
  }
  if (!fn.includes(`if (exp.line_count > 0)`)) {
    failures.push(`${ROUTES_REL}: must refuse an expense that already carries expense_lines rows`);
  }
  if (!fn.includes(`if (!canVoid(String(user.role ?? "")))`)) {
    failures.push(`${ROUTES_REL}: must gate on canVoid (Owner + Accountant) authorization`);
  }
  if (!fn.includes(`"expense.draft_edited"`)) {
    failures.push(`${ROUTES_REL}: must write a CRUD audit event tagged expense.draft_edited`);
  }
  if (!/reason: body\.data\.reason, before, after/.test(fn)) {
    failures.push(`${ROUTES_REL}: audit event must carry both before and after field snapshots`);
  }
  if (!fn.includes("FOR UPDATE")) {
    failures.push(`${ROUTES_REL}: read must lock the row (FOR UPDATE) before editing`);
  }

  return failures;
}

function selftest() {
  const root = process.cwd();
  const baseline = run(root);
  if (baseline.length) {
    console.error("SELFTEST FAIL: repository already red.\n" + baseline.join("\n"));
    process.exit(1);
  }
  const filePath = `${root}/${ROUTES_REL}`;
  const original = fs.readFileSync(filePath, "utf8");

  const mutations = [
    ["draft/unposted status gate removed", original.replace(
      'if (exp.status !== "draft" || exp.posting_status !== "unposted") {',
      "if (false) {"
    )],
    ["line_count guard removed", original.replace("if (exp.line_count > 0) {", "if (false) {")],
    [
      "authorization gate removed",
      original.replace(
        'if (!canVoid(String(user.role ?? ""))) return { kind: "forbidden" as const };\n        const r = await client.query(\n          `\n            SELECT\n              e.status,',
        "const r = await client.query(\n          `\n            SELECT\n              e.status,"
      ),
    ],
    ["audit event tag removed", original.replace('"expense.draft_edited"', '"expense.silently_edited"')],
  ];

  for (const [name, mutated] of mutations) {
    if (mutated === original) {
      console.error(`SELFTEST FAIL: plant "${name}" pattern did not match anything to replace.`);
      process.exit(1);
    }
    try {
      fs.writeFileSync(filePath, mutated, "utf8");
      const caught = run(root);
      if (!caught.length) {
        console.error(`SELFTEST FAIL: planted regression "${name}" not caught.`);
        process.exit(1);
      }
      console.log(`  caught: ${name}`);
    } finally {
      fs.writeFileSync(filePath, original, "utf8");
    }
  }

  const after = run(root);
  if (after.length) {
    console.error("SELFTEST FAIL: restore left repository red.\n" + after.join("\n"));
    process.exit(1);
  }
  console.log("SELFTEST PASS: 4/4 planted regressions caught and repository restored green.");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-expense-draft-edit-scoped FAIL:");
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log("verify-expense-draft-edit-scoped OK — draft-only edit route refuses posted/void/lined expenses, requires auth+reason, full audit trail");
}
