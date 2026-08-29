#!/usr/bin/env node
/**
 * Generate the frontend's module-completion data from docs/module-completion/*.json.
 *
 * The manifests are the source of truth for "N of M" per module and are already enforced in CI by
 * verify-module-completion. They were, however, invisible: nothing in the product read them, so the
 * only way to see whether a module was advancing was to run a script. Progress that cannot be seen
 * reads as no progress.
 *
 * Types + FIRST_14 / U14 law table still generate here (gitignored TS). The in-app Module Completion
 * page MUST fetch GET /api/v1/program/module-completion at runtime so /program is not frozen to the
 * frontend static-build SHA. Do not re-commit apps/frontend/src/generated/module-completion.ts.
 *
 *   node scripts/generate-module-completion-data.mjs           # write
 *   node scripts/generate-module-completion-data.mjs --check    # verify in sync (exit 1 on drift)
 */
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
// Import the CANONICAL scoring rule rather than re-implementing it. An earlier draft of this
// generator counted only PASS and reported accounting as 17 of 31 while CI reported 19 of 31 — the
// in-app scoreboard would have contradicted the guard on day one. There is one definition of done.
import { itemCountsTowardN } from "./verify-module-completion.mjs";

// ALWAYS resolve from this script's location — never process.cwd(). Frontend package.json runs
// `node ../../scripts/generate-…` from apps/frontend; cwd-relative paths then look for
// apps/frontend/docs/module-completion and CI perf/security builds fail ENOENT.
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MANIFEST_DIR = join(ROOT, "docs", "module-completion");
const U14_LAW = join(ROOT, "docs", "lockdown", "URGENT-14-EXCLUSIVE-MODULE-CERTIFY-LAW-2026-08-22.md");
const OUT = join(ROOT, "apps", "frontend", "src", "generated", "module-completion.ts");

/**
 * Law table module id → sidebar id + docs/module-completion/*.json id.
 * Banking is `bank` in the sidebar and `banking` in Rule 24 manifests.
 */
export const U14_ID_MAP = {
  accounting: { sidebarId: "accounting", completionId: "accounting" },
  banking: { sidebarId: "bank", completionId: "banking" },
  settlements: { sidebarId: "settlements", completionId: "settlements" },
  factoring: { sidebarId: "factoring", completionId: "factoring" },
  dispatch: { sidebarId: "dispatch", completionId: "dispatch" },
  vendors: { sidebarId: "vendors", completionId: "vendors" },
  customers: { sidebarId: "customers", completionId: "customers" },
  drivers: { sidebarId: "drivers", completionId: "drivers" },
  fleet: { sidebarId: "fleet", completionId: "fleet" },
  lists: { sidebarId: "lists", completionId: "lists" },
  maintenance: { sidebarId: "maintenance", completionId: "maintenance" },
  safety: { sidebarId: "safety", completionId: "safety" },
  insurance: { sidebarId: "insurance", completionId: "insurance" },
  legal: { sidebarId: "legal", completionId: "legal" },
};

/**
 * Parse the exclusive certify table. CERTIFIED here is seat hops + LIVE_SHA — not Rule 24
 * complete:true and not matrix Box 4 Live.
 */
export function parseU14ExclusiveLaw(md = readFileSync(U14_LAW, "utf8")) {
  const rows = [];
  for (const line of md.split("\n")) {
    const m = line.match(
      /^\| (\d+) \| ([a-z0-9-]+) \| .+ \| (CERTIFIED LIVE_SHA=([a-f0-9]+)|OPEN.*) \|\s*$/
    );
    if (!m) continue;
    const lawId = m[2];
    const ids = U14_ID_MAP[lawId];
    if (!ids) throw new Error(`parseU14ExclusiveLaw: unknown module id ${lawId}`);
    const certified = m[3].startsWith("CERTIFIED");
    rows.push({
      seq: Number(m[1]),
      lawId,
      sidebarId: ids.sidebarId,
      completionId: ids.completionId,
      status: certified ? "CERTIFIED" : "OPEN",
      liveSha: certified ? m[4] : null,
    });
  }
  if (rows.length !== 14) {
    throw new Error(`parseU14ExclusiveLaw: expected 14 table rows, got ${rows.length}`);
  }
  return rows;
}

/**
 * The first 14 sidebar modules, in sidebar order — the owner's current build target. Kept here rather
 * than imported so the generator stays dependency-free; verify-module-completion-ui-in-sync checks
 * this list against sidebar-config.ts so it cannot silently drift from the real nav order.
 */
export const FIRST_14 = [
  "home", "tasks", "fuel", "dispatch", "driver-hub", "maintenance", "safety",
  "compliance", "drivers", "fleet", "insurance", "legal", "eld", "cash-flow",
];

/** Same N-of-M rule as verify-module-completion (Urgent-6 requires prod_verified). */
function countsAsDone(item, moduleId) {
  return itemCountsTowardN(item, moduleId);
}

/**
 * Strip internal build-cycle language from a title before it reaches the UI.
 *
 * Manifest titles are written for engineers and carry internal workflow references such as
 * "(WF-053)". verify-no-internal-language-in-prod-ui forbids those in product copy, and it is right:
 * this data is RENDERED, so an unsanitised title puts internal jargon in front of the owner. The item
 * id (e.g. ACCT-ECON-05) is meaningful and is kept; only the internal parenthetical is removed.
 */
export function sanitizeTitle(title) {
  return String(title)
    .replace(/\s*\((?:WF|BLOCK)-[0-9]+[^)]*\)/gi, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Proof state for the in-app scoreboard.
 * - certified: every item done AND every item prod_verified:true (live GUARD click)
 * - code_verified: every item done (PASS/qualifying HOLD) but at least one not live-proven
 * - in_progress: checklist incomplete
 *
 * complete:true alone NEVER equals certified — that was the false-green defect.
 */
export function proofState({ done, total, items }) {
  if (!total || total <= 0) return "in_progress";
  if (done < total) return "in_progress";
  const allProd = (items ?? []).every((i) => i.prod_verified === true);
  return allProd ? "certified" : "code_verified";
}

export function buildData() {
  const files = readdirSync(MANIFEST_DIR).filter((f) => f.endsWith(".json"));
  const modules = [];

  for (const f of files.sort()) {
    const raw = JSON.parse(readFileSync(join(MANIFEST_DIR, f), "utf8"));
    const items = Array.isArray(raw.items) ? raw.items : [];
    const mapped = items.map((i) => ({
      id: String(i.id ?? ""),
      title: sanitizeTitle(i.title ?? ""),
      status: String(i.status ?? "OPEN"),
      pr: String(i.pr ?? ""),
      // Default false — only GUARD after a live Neon click may set true in the JSON.
      prod_verified: i.prod_verified === true,
    }));
    const done = items.filter((i) => countsAsDone(i, raw.module)).length;
    const total = items.length;
    const prodVerifiedCount = mapped.filter((i) => i.prod_verified).length;
    modules.push({
      id: f.replace(/\.json$/, ""),
      total,
      done,
      complete: raw.complete === true,
      prod_verified_count: prodVerifiedCount,
      proof: proofState({ done, total, items: mapped }),
      items: mapped,
    });
  }
  const u14Exclusive = parseU14ExclusiveLaw();
  return {
    modules,
    first14: FIRST_14,
    u14Exclusive,
    u14CertifiedCount: u14Exclusive.filter((r) => r.status === "CERTIFIED").length,
  };
}

function render(data) {
  return (
    "// GENERATED by scripts/generate-module-completion-data.mjs — do not edit by hand.\n" +
    "// Source of truth: docs/module-completion/*.json (enforced by verify-module-completion).\n" +
    "// Regenerate: node scripts/generate-module-completion-data.mjs\n\n" +
    "export type ModuleCompletionProof = \"certified\" | \"code_verified\" | \"in_progress\";\n\n" +
    "export type ModuleCompletionItem = {\n  id: string;\n  title: string;\n  status: string;\n  pr: string;\n  prod_verified: boolean;\n};\n\n" +
    "export type ModuleCompletion = {\n  id: string;\n  total: number;\n  done: number;\n  complete: boolean;\n  prod_verified_count: number;\n  proof: ModuleCompletionProof;\n  items: ModuleCompletionItem[];\n};\n\n" +
    `export const MODULE_COMPLETION: ModuleCompletion[] = ${JSON.stringify(data.modules, null, 2)};\n\n` +
    "/** The first 14 sidebar modules, in sidebar order — the current build target. */\n" +
    `export const FIRST_14_MODULE_IDS: string[] = ${JSON.stringify(data.first14, null, 2)};\n\n` +
    "/** Urgent exclusive hops (law table). CERTIFIED ≠ Rule 24 Certified ≠ matrix Live. */\n" +
    "export type U14ExclusiveStatus = \"CERTIFIED\" | \"OPEN\";\n\n" +
    "export type U14ExclusiveRow = {\n" +
    "  seq: number;\n" +
    "  lawId: string;\n" +
    "  sidebarId: string;\n" +
    "  completionId: string;\n" +
    "  status: U14ExclusiveStatus;\n" +
    "  liveSha: string | null;\n" +
    "};\n\n" +
    `export const U14_EXCLUSIVE_ROWS: U14ExclusiveRow[] = ${JSON.stringify(data.u14Exclusive, null, 2)};\n\n` +
    `export const U14_EXCLUSIVE_CERTIFIED_COUNT: number = ${data.u14CertifiedCount};\n` +
    "export const U14_EXCLUSIVE_TOTAL: number = 14;\n"
  );
}

const out = render(buildData());

if (process.argv.includes("--check")) {
  let current = "";
  try {
    current = readFileSync(OUT, "utf8");
  } catch {
    console.error("generate-module-completion-data --check FAIL — generated file missing. Run the generator.");
    process.exit(1);
  }
  if (current !== out) {
    console.error(
      "generate-module-completion-data --check FAIL — apps/frontend/src/generated/module-completion.ts is stale.\n" +
        "A module manifest changed without regenerating the UI data, so the in-app scoreboard would show\n" +
        "numbers that no longer match docs/module-completion/. Run:\n" +
        "  node scripts/generate-module-completion-data.mjs"
    );
    process.exit(1);
  }
  console.log("generate-module-completion-data --check OK — generated data matches the manifests.");
} else {
  writeFileSync(OUT, out, "utf8");
  const d = buildData();
  console.log(
    `generate-module-completion-data OK — ${d.modules.length} module manifest(s) → ${OUT.replace(ROOT + "/", "")}`
  );
  for (const m of d.modules) console.log(`  ${m.id}: ${m.done} of ${m.total}`);
}
