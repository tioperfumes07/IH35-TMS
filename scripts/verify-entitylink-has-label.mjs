#!/usr/bin/env node
/**
 * GUARD: an `<EntityLink>` given an `id` must also be given a `label`.
 *
 * EntityLink falls back to printing its `id` when it has no label, so an unlabelled instance renders
 * a raw uuid at a human. FAIL-CP1 fixed exactly that on the complaints grid — for the DRIVER
 * complainant and the DRIVER respondent. The CUSTOMER complainant was left unlabelled NINE LINES
 * BELOW the comment explaining the failure mode ("Without a label EntityLink prints the raw uuid"),
 * so a complaint filed by a customer still printed a uuid in the column whose entire content is who
 * complained about whom.
 *
 * That is the recurring shape: the fix lands on the instances the reporter happened to look at, and
 * the sibling in the same function survives. A guard counts them all.
 *
 * IN SCOPE: every `<EntityLink ... id={...} ... />` in the frontend.
 * ASSERTS:  the same element also passes `label`.
 *
 * Pre-existing unlabelled instances are held at a per-file RATCHET that may only shrink — and a
 * ceiling left stale after a fix is itself a failure, so a repair cannot be quietly forgotten.
 *
 * Run:  node scripts/verify-entitylink-has-label.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(root, "apps/frontend/src");
const LABEL = "verify-entitylink-has-label";

/**
 * RATCHET — rel -> how many unlabelled EntityLink instances are tolerated. Shrink only.
 *
 * Written for ONE residual (the customer complainant) and it immediately found 29 more across 15
 * files — maintenance work orders, accounting escrow/prepaid/vendor-credits, and most of the safety
 * tabs. Not swept: each needs a decision about WHICH human identifier is correct for that surface,
 * and a blind pass is how a display_id ends up printed where a person's name belongs. The names have
 * to be resolved server-side too, so most of these are a backend change, not a prop.
 *
 * A ceiling left stale after a fix is itself a failure, so the list cannot quietly stop moving.
 */
const RATCHET = new Map([
  ["apps/frontend/src/components/maintenance/DriverWorkOrdersReverseSection.tsx", 1],
  ["apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx", 2],
  ["apps/frontend/src/pages/accounting/EscrowPage.tsx", 2],
  ["apps/frontend/src/pages/accounting/PrepaidExpensesPage.tsx", 3],
  ["apps/frontend/src/pages/accounting/VendorCreditsPage.tsx", 2],
  ["apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx", 4],
  ["apps/frontend/src/pages/safety/InternalFinesPage.tsx", 1],
  ["apps/frontend/src/pages/safety/SafetyMeetingsPage.tsx", 2],
  ["apps/frontend/src/pages/safety/TrainingProgramsPage.tsx", 1],
  ["apps/frontend/src/pages/safety/TrainingRecordsPage.tsx", 1],
  ["apps/frontend/src/pages/safety/tabs/AnomalyDetailDrawer.tsx", 1],
  ["apps/frontend/src/pages/safety/tabs/DOTInspectionsTab.tsx", 3],
  ["apps/frontend/src/pages/safety/tabs/DrugAlcoholTab.tsx", 1],
  ["apps/frontend/src/pages/safety/tabs/IntegrityReportsTab.tsx", 3],
  ["apps/frontend/src/pages/safety/tabs/SafetyHomeTab.tsx", 2],
]);

const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__") continue;
      walk(p, out);
    } else if (/\.tsx$/.test(e.name) && !/\.test\.tsx$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

/**
 * The full `<EntityLink ...>` opening tag, brace-aware. A non-greedy `/>` regex stops at the first
 * `>` inside a JSX expression like `label={x > 0 ? a : b}` and would read a truncated tag.
 */
export function entityLinkTags(code) {
  const tags = [];
  const re = /<EntityLink\b/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    let depth = 0;
    for (let i = m.index; i < code.length; i += 1) {
      const c = code[i];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (c === ">" && depth === 0) {
        tags.push(code.slice(m.index, i + 1));
        break;
      }
    }
  }
  return tags;
}

export function collectProblems(files) {
  const problems = [];
  const bare = new Map();

  for (const { rel, src } of files) {
    for (const tag of entityLinkTags(strip(src))) {
      // A tag with no `id` renders nothing uuid-shaped, so it is out of scope.
      if (!/\bid\s*=/.test(tag)) continue;
      if (/\blabel\s*=/.test(tag)) continue;
      bare.set(rel, (bare.get(rel) ?? 0) + 1);
    }
  }

  for (const [rel, n] of bare) {
    const allowed = RATCHET.get(rel) ?? 0;
    if (n > allowed) {
      problems.push(
        `${rel}: ${n} <EntityLink> with an id and no label, ratchet allows ${allowed}. EntityLink prints ` +
          `the raw id when it has no label, so each of these shows a uuid to a human (FAIL-CP1). Pass a ` +
          `label — resolve the name server-side rather than making every consumer re-join.`
      );
    }
  }
  for (const [rel, allowed] of RATCHET) {
    const n = bare.get(rel) ?? 0;
    if (files.some((f) => f.rel === rel) && n < allowed) {
      problems.push(`${rel}: only ${n} unlabelled remain but the ratchet allows ${allowed}. Lower it to ${n}.`);
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
      name: "the FAIL-CP1 residual shape is caught",
      files: [mk("a.tsx", `<EntityLink kind="customer" id={String(row.complainant_customer_id)} />`)],
      expectAtLeast: 1,
    },
    {
      name: "a labelled link passes",
      files: [mk("a.tsx", `<EntityLink kind="customer" id={x} label={name} />`)],
      expect: 0,
    },
    {
      name: "a label containing > is not truncated into a false positive",
      files: [mk("a.tsx", `<EntityLink kind="driver" id={x} label={n > 0 ? a : b} />`)],
      expect: 0,
    },
    {
      name: "a link with no id is out of scope",
      files: [mk("a.tsx", `<EntityLink kind="driver" />`)],
      expect: 0,
    },
    {
      name: "a commented-out link does not count",
      files: [mk("a.tsx", `// <EntityLink kind="driver" id={x} />`)],
      expect: 0,
    },
    {
      name: "multiline tags are counted",
      files: [mk("a.tsx", `<EntityLink\n  kind="driver"\n  id={x}\n/>`)],
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
  for (const [rel, n] of RATCHET) console.log(`  RATCHET (must shrink) — ${rel}: ${n}`);
  return 0;
}

process.exit(main());
