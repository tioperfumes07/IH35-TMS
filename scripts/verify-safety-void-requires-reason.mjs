#!/usr/bin/env node
/**
 * GUARD: voiding a Safety record requires an operator-supplied reason (SAF-F11).
 *
 * WHY THIS EXISTS (2026-07-23 audit, verified in source)
 * The DOT Inspections and Complaints void endpoints accepted NO request body and wrote:
 *
 *   SET voided_at = now(), voided_by = $2,
 *       void_reason = COALESCE(void_reason, 'voided via endpoint')
 *
 * Every void therefore landed in the audit trail with the literal placeholder
 * "voided via endpoint" and no accountable explanation — on records that are evidentiary
 * (DOT inspections) and owner-privacy gated (complaints). The UIs sent no reason either, so there was
 * nothing to record even if the column had been honest.
 *
 * Void-cancel governance is reason-required. This guard keeps both halves honest: the route must
 * validate a real `void_reason`, and it must not silently substitute a placeholder.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-void-requires-reason";
const SELFTEST = process.argv.includes("--selftest");

const ROUTES = [
  "apps/backend/src/routes/safety/dot-inspections.ts",
  "apps/backend/src/routes/safety/complaints.ts",
];
const CLIENT = "apps/frontend/src/api/safetyV64.ts";
const TABS = [
  {
    rel: "apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx",
    apiFn: "voidDotInspection",
    label: "DOT Inspections",
  },
  {
    rel: "apps/frontend/src/pages/safety/tabs/ComplaintsTab.tsx",
    apiFn: "voidComplaintV64",
    label: "Complaints",
  },
];

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

/** Injectable so the selftest exercises the real assertions against mutated real source. */
export function assertVoidRequiresReason(sources) {
  const problems = [];

  for (const rel of ROUTES) {
    const code = stripComments(sources?.[rel] ?? read(rel));

    if (/void_reason\s*=\s*COALESCE\s*\(/i.test(code)) {
      problems.push(
        `${rel}: void writes \`void_reason = COALESCE(...)\` — a placeholder reason. The audit trail must ` +
          `record the operator's actual reason, not "voided via endpoint".`
      );
    }
    if (/'voided via endpoint'/.test(code)) {
      problems.push(`${rel}: still contains the placeholder literal 'voided via endpoint'.`);
    }
    // The route must validate a real reason from the body.
    const hasSchema = /void_reason:\s*z\.string\(\)[^\n]*\.min\(\s*[1-9]/.test(code);
    if (!hasSchema) {
      problems.push(
        `${rel}: no zod schema requiring a non-trivial \`void_reason\` (expected ` +
          `\`void_reason: z.string().trim().min(3).max(500)\`, matching the accounting void contract).`
      );
    }
    // …and it must actually parse the body, not just declare the schema.
    if (hasSchema && !/voidBodySchema\.safeParse\(\s*req\.body/.test(code)) {
      problems.push(
        `${rel}: declares a void body schema but never parses req.body with it — the requirement is inert.`
      );
    }
  }

  // The client must send the reason, or the backend requirement just 400s every void.
  const client = stripComments(sources?.[CLIENT] ?? read(CLIENT));
  for (const fn of ["voidDotInspection", "voidComplaintV64"]) {
    const m = new RegExp(`export function ${fn}\\(([^)]*)\\)([\\s\\S]{0,400})`).exec(client);
    if (!m) {
      problems.push(`${CLIENT}: ${fn} not found`);
      continue;
    }
    if (!/voidReason|void_reason/.test(m[1])) {
      problems.push(`${CLIENT}: ${fn} takes no void reason parameter — the UI cannot supply one.`);
    }
    if (!/void_reason/.test(m[2])) {
      problems.push(`${CLIENT}: ${fn} does not send \`void_reason\` in the request body.`);
    }
  }

  // Mirror HOSViolationsTab: void must prompt via VoidReasonModal before POST (client-side gate).
  for (const tab of TABS) {
    const code = stripComments(sources?.[tab.rel] ?? read(tab.rel));
    if (!/VoidReasonModal/.test(code)) {
      problems.push(`${tab.rel}: ${tab.label} void must prompt via VoidReasonModal (HOS pattern).`);
      continue;
    }
    if (!/setVoidTargetId/.test(code)) {
      problems.push(`${tab.rel}: void button must open VoidReasonModal via setVoidTargetId, not fire void directly.`);
    }
    const destructuredReason =
      /mutationFn:\s*\(\{\s*id,\s*reason\s*\}/.test(code) &&
      new RegExp(`${tab.apiFn}\\([^)]*reason`).test(code);
    const snapshottedReason =
      /mutationFn:\s*\(input:\s*\{[^}]*id:\s*string;[^}]*reason:\s*string;[^}]*companyId:\s*string;[^}]*generation:\s*number[^}]*\}\)/.test(code) &&
      new RegExp(`${tab.apiFn}\\(input\\.companyId,\\s*input\\.id,\\s*input\\.reason\\)`).test(code);
    if (!destructuredReason && !snapshottedReason) {
      problems.push(`${tab.rel}: void mutation must pass user-supplied reason to ${tab.apiFn}.`);
    }
    if (!/<VoidReasonModal[\s\S]{0,800}onSubmit=\{async\s*\(reason\)/.test(code)) {
      problems.push(`${tab.rel}: VoidReasonModal onSubmit must receive the operator reason before void POST.`);
    }
  }

  return problems;
}

if (SELFTEST) {
  const live = Object.fromEntries([...ROUTES, CLIENT, ...TABS.map((t) => t.rel)].map((f) => [f, read(f)]));
  const failures = [];
  const target = ROUTES[0];

  const expectCaught = (name, mutated, needle) => {
    if (JSON.stringify(mutated) === JSON.stringify(live)) {
      failures.push(`${name}: mutation did not change the source — inert case`);
      return;
    }
    const problems = assertVoidRequiresReason(mutated);
    if (!problems.some((p) => p.includes(needle))) {
      failures.push(
        `${name}: planted defect NOT caught (expected "${needle}", got: ${
          problems.length ? problems.join(" | ") : "no problems"
        })`
      );
    }
  };

  // Case 1: the COALESCE placeholder comes back.
  expectCaught(
    "coalesce-placeholder",
    {
      ...live,
      [target]: live[target].replace(
        "void_reason = $4",
        "void_reason = COALESCE(void_reason, 'voided via endpoint')"
      ),
    },
    "placeholder reason"
  );

  // Case 2: the schema is dropped.
  expectCaught(
    "schema-removed",
    { ...live, [target]: live[target].replace(/void_reason: z\.string\(\)[^\n]*\n/, "") },
    "no zod schema requiring"
  );

  // Case 3: schema declared but body never parsed — the requirement is inert.
  expectCaught(
    "schema-not-parsed",
    { ...live, [target]: live[target].replace(/const body = voidBodySchema\.safeParse\(req\.body \?\? \{\}\);\n/, "") },
    "never parses req.body"
  );

  // Case 4: the client stops sending the reason.
  expectCaught(
    "client-drops-reason",
    { ...live, [CLIENT]: live[CLIENT].replace(/\n\s*body: \{ void_reason: voidReason \},/, "") },
    "does not send `void_reason`"
  );

  // Case 5: the UI drops VoidReasonModal (direct void without reason capture).
  expectCaught(
    "ui-drops-modal",
    {
      ...live,
      [TABS[0].rel]: live[TABS[0].rel].replace(/<VoidReasonModal[\s\S]*?\/>/, ""),
    },
    "VoidReasonModal"
  );

  const liveProblems = assertVoidRequiresReason(live);
  if (liveProblems.length) failures.push(`live sources FAIL: ${liveProblems.join(" | ")}`);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 5 planted defects caught, live sources clean`);
  process.exit(0);
}

const problems = assertVoidRequiresReason();
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — Safety voids require an operator-supplied reason end to end`);
