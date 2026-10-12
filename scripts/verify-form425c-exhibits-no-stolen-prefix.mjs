#!/usr/bin/env node
/**
 * F425C-EXHIBITS-STOLEN-PREFIX — /425c related hops must stay on /425c.
 * Live: exhibits + Form425CHome RelatedModuleLinks stole /accounting /finance /legal
 * /safety /maintenance /compliance (other leftover seats).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-form425c-exhibits-no-stolen-prefix";
const PAGE = "apps/frontend/src/pages/reports/form-425c/ExhibitsViewer.tsx";
const HOME = "apps/frontend/src/pages/form425c/Form425CHome.tsx";
const FORM = "apps/frontend/src/pages/form425c/tabs/CurrentPeriodTab.tsx";
const PROFILES = "apps/frontend/src/pages/form425c/tabs/ProfilesTab.tsx";
const STOLEN_RE =
  /to[=:]\s*"\/(legal|finance|accounting|safety|maintenance|compliance|customers|drivers|fleet|lists|cash-flow|driver-hub)/;

// LEAD 443.101 (2026-10-12) — the two form425c guards contradicted each other; this one changes.
//   old rule: ExhibitsViewer may link to NO /accounting, /finance or /legal path (seat-lane prefix ownership, #14998).
//   new rule: exactly the three economic drills that verify-form425c-econ-link-pack (#5417, 425-ECON-01 / 425-LINK-01)
//             requires — /accounting/reconciliation, /finance/statements, /legal/reports — are allowed on the exhibits
//             page; every other foreign-prefix hop on every 425c page still fails.
//   why: the prefix ban enforced seat lanes, which AGENTS.md marks SUPERSEDED (2026-09-02); the live linkage law requires
//        forward drill from a document to the statements it ties to (no dead-end screen). With the two rules both
//        registered, verify:form425c-history-includes-drafts could never pass.
export const ECON_DRILLS = ['to="/accounting/reconciliation"', 'to="/finance/statements"', 'to="/legal/reports"'];

export function collectProblems(src, page = PAGE) {
  const problems = [];
  const scanned = page === PAGE ? ECON_DRILLS.reduce((acc, d) => acc.split(d).join('to="/425c"'), src) : src;
  if (STOLEN_RE.test(scanned)) {
    problems.push(`${page}: related links must not steal other seats' prefixes`);
  }
  if (page === PAGE) {
    if (!src.includes('to="/425c?tab=qb"')) {
      problems.push(`${page}: missing in-module Deposit Import hop /425c?tab=qb`);
    }
    if (!src.includes('to="/425c?tab=merge"')) {
      problems.push(`${page}: missing in-module Merge hop /425c?tab=merge`);
    }
    if (!src.includes('to="/425c?tab=history"')) {
      problems.push(`${page}: missing in-module History hop /425c?tab=history`);
    }
    if (!src.includes("Select an operating company before building exhibits")) {
      problems.push(`${page}: Build all exhibits must toast when no operating company (disabled+silent is leftover FINDING)`);
    }
    if (!src.includes("No exhibit payload to export")) {
      problems.push(`${page}: Export JSON with empty exhibit must toast, not download null silently`);
    }
    if (!src.includes("Exported exhibit")) {
      problems.push(`${page}: Export JSON success must toast (silent download is leftover FINDING)`);
    }
  }
  if (page === HOME) {
    if (!src.includes('to: "/425c?tab=qb"')) {
      problems.push(`${page}: related hops must stay on /425c?tab=qb`);
    }
    if (!src.includes('to: "/425c?tab=merge"')) {
      problems.push(`${page}: related hops must stay on /425c?tab=merge`);
    }
    if (!src.includes('to: "/425c?tab=history"')) {
      problems.push(`${page}: related hops must stay on /425c?tab=history`);
    }
  }
  // LEAD 443.99 class B (2026-10-12) — flagged-line Exhibit hop.
  //   old rule: FORM and PROFILES render an "Exhibit required" badge that Links to /425c/exhibits.
  //   new rule: FORM — every flagged line writes its Exhibit A/B explanation in place (textarea + button calling
  //             onSaveExhibit(q.num, …), labelled `Save Exhibit ${letter} entry`); PROFILES — a flagged default answer
  //             Links to the Form tab (/425c?tab=form) "Save Exhibit on Form 425C". Neither may Link to /425c/exhibits,
  //             and a dead (unlinked/unwired) control still fails.
  //   why: F425C-EXHIBIT-REQUIRED-DEAD-HOP-TO-AF (#15121, 8d99ae0d17) and #15122 (9a2ea92229): /425c/exhibits is the
  //        A–F banking package — the click never wrote the court-filing line explanation (wrong surface). The
  //        official Exhibit A/B writers (POST /form-425c/:id/exhibit-a|b) are now reached from the line itself.
  if (page === FORM || page === PROFILES) {
    if (src.includes('to="/425c/exhibits"')) {
      problems.push(`${page}: a flagged line must not hop to /425c/exhibits (A–F banking package, wrong surface)`);
    }
  }
  if (page === FORM) {
    if (!/<textarea[\s\S]{0,400}value=\{exhibitDrafts\[q\.num\][\s\S]{0,400}onClick=\{\(\) => onSaveExhibit\(q\.num, exhibitDrafts\[q\.num\] \?\? ""\)\}/.test(src)) {
      problems.push(`${page}: flagged line must save its Exhibit A/B explanation in place via onSaveExhibit(q.num, …)`);
    }
    if (!src.includes("Save Exhibit ${letter} entry")) {
      problems.push(`${page}: missing "Save Exhibit A/B entry" control label`);
    }
  }
  if (page === PROFILES) {
    if (!/\{flagged \? \(\s*<Link\s+to="\/425c\?tab=form"[\s\S]{0,200}Save Exhibit on Form 425C/.test(src)) {
      problems.push(`${page}: flagged default answer must Link to /425c?tab=form "Save Exhibit on Form 425C"`);
    }
  }
  return problems;
}

// 443.101: the three economic drills are now allowed (see ECON_DRILLS); the planted steal uses foreign hops that are not.
const stolen = `
  <Link to="/accounting/journal-entries">Journal entries</Link>
  <Link to="/finance/hub">Finance hub</Link>
  <Link to="/legal/matters">Legal matters</Link>
`;
const kept = `
  <Link to="/425c?tab=qb">Deposit Import</Link>
  <Link to="/425c?tab=merge">Merge & Export</Link>
  <Link to="/425c?tab=history">History</Link>
  <Link to="/425c">← Form 425C</Link>
  pushToast("Select an operating company before building exhibits", "error");
  pushToast("No exhibit payload to export", "error");
  pushToast("Exported exhibit A JSON", "success");
`;
const stolenHome = `links={[{ label: "Safety Audit", to: "/safety/audit-425c" }]}`;
const keptHome = `
  links={[
    { label: "Deposit Import", to: "/425c?tab=qb" },
    { label: "Merge & Export", to: "/425c?tab=merge" },
    { label: "History", to: "/425c?tab=history" },
  ]}
`;

if (process.argv.includes("--selftest")) {
  const bad = collectProblems(stolen, PAGE);
  const good = collectProblems(kept, PAGE);
  const badHome = collectProblems(stolenHome, HOME);
  const goodHome = collectProblems(keptHome, HOME);
  if (!bad.some((p) => p.includes("steal"))) {
    console.error(`${LABEL} --selftest FAIL: stolen prefixes must fail`);
    process.exit(1);
  }
  if (good.length) {
    console.error(`${LABEL} --selftest FAIL good fixture: ${good.join("; ")}`);
    process.exit(1);
  }
  // 443.101: the three named economic drills pass on the exhibits page; any other foreign hop, or the same drill on
  // another 425c page, still fails.
  const econCases = [
    ["exhibits + the 3 econ drills", `${kept}${ECON_DRILLS.map((d) => `<Link ${d}>x</Link>`).join("")}`, PAGE, 0],
    ["exhibits + an extra /accounting hop", `${kept}<Link to="/accounting/journal">x</Link>`, PAGE, 1],
    ["exhibits + a /finance hop that is not the statements drill", `${kept}<Link to="/finance/hub">x</Link>`, PAGE, 1],
    ["home borrows an econ drill", `${keptHome}<Link to="/finance/statements">x</Link>`, HOME, 1],
  ];
  for (const [name, fixture, pg, want] of econCases) {
    const got = collectProblems(fixture, pg).filter((p) => p.includes("steal")).length;
    if (want === 0 ? got !== 0 : got === 0) {
      console.error(`${LABEL} --selftest FAIL: ${name} (steal problems=${got})`);
      process.exit(1);
    }
  }
  if (!badHome.some((p) => p.includes("steal"))) {
    console.error(`${LABEL} --selftest FAIL: home stolen prefixes must fail`);
    process.exit(1);
  }
  if (goodHome.length) {
    console.error(`${LABEL} --selftest FAIL good home: ${goodHome.join("; ")}`);
    process.exit(1);
  }
  const goodFormSrc = `{flagged ? (<div>
      <textarea placeholder="x" value={exhibitDrafts[q.num] ?? ""} onChange={(e) => setExhibitDrafts(e.target.value)} />
      <button type="button" onClick={() => onSaveExhibit(q.num, exhibitDrafts[q.num] ?? "")}>{savingExhibit ? "Saving…" : \`Save Exhibit \${letter} entry\`}</button>
    </div>) : null}`;
  const formCases = [
    ["good form", goodFormSrc, 0],
    ["form hops to /425c/exhibits", `${goodFormSrc}<Link to="/425c/exhibits">Exhibit required</Link>`, 1],
    ["form button not wired to onSaveExhibit", goodFormSrc.replace("onClick={() => onSaveExhibit(q.num, exhibitDrafts[q.num] ?? \"\")}", "onClick={() => undefined}"), 1],
    ["dead Exhibit required span only", `<span>Exhibit required</span>`, 1],
  ];
  const goodProfilesSrc = `{flagged ? (
                  <Link
                    to="/425c?tab=form"
                    className="x"
                  >
                    Save Exhibit on Form 425C
                  </Link>
                ) : null}`;
  const profileCases = [
    ["good profiles", goodProfilesSrc, 0],
    ["profiles hop to /425c/exhibits", goodProfilesSrc.replace("/425c?tab=form", "/425c/exhibits"), 1],
    ["profiles dead span", `<span>Save Exhibit on Form 425C</span>`, 1],
  ];
  for (const [name, fixture, want] of [...formCases.map((c) => [...c, FORM]), ...profileCases.map((c) => [...c, PROFILES])].map(([n, f, w, pg]) => [n, [f, pg], w])) {
    const got = collectProblems(fixture[0], fixture[1]).length;
    if (want === 0 ? got !== 0 : got === 0) {
      console.error(`${LABEL} --selftest FAIL: ${name} (problems=${got})`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
const homeSrc = fs.readFileSync(path.join(ROOT, HOME), "utf8");
const formSrc = fs.readFileSync(path.join(ROOT, FORM), "utf8");
const profilesSrc = fs.readFileSync(path.join(ROOT, PROFILES), "utf8");
const problems = [
  ...collectProblems(src, PAGE),
  ...collectProblems(homeSrc, HOME),
  ...collectProblems(formSrc, FORM),
  ...collectProblems(profilesSrc, PROFILES),
];
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — ${PAGE} + ${HOME} + ${FORM} hops stay on /425c`);
process.exit(0);
