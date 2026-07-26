#!/usr/bin/env node
/**
 * Settlement Pay-Run — escrow-contribution CAP guard (Phase 4 GUARDS).
 *
 * Owner-locked rule: the pay-run escrow contribution is capped at $2,500 (250000 cents) per driver and
 * NEVER releases escrow itself (release/forfeit belongs only to the separate termination-separation
 * flow — accounting/escrow/service.ts's releaseEscrow — never the weekly pay-run close). Locks:
 *   (1) a 250000-cent escrow-contribution cap constant is referenced somewhere in
 *       driver-finance/ + accounting/settlement-posting/.
 *   (2) the contribution amount is computed with a max(0, cap - balance) style clamp — this is also
 *       what guarantees the contribution can never go negative.
 *   (3) whichever file implements the escrow-contribution posting (identified by referencing the
 *       'escrow_contribution' line_type/concept — the migration-added settlement_lines line_type) posts
 *       NO 'release'/'forfeit' posting_type — hold/contribution only. Scoped to files that actually touch
 *       'escrow_contribution' so the unrelated, legitimate termination-separation release flow (which
 *       never mentions escrow_contribution) is never flagged.
 *
 * --selftest exercises assertGuard() against inline fixtures (pass + each failure mode), including a
 * false-positive check that the legitimate separation-release file is never flagged.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-escrow-cap";
const SCAN_DIRS = ["apps/backend/src/driver-finance", "apps/backend/src/accounting/settlement-posting"];

// 250000 or 250_000 (a valid JS numeric separator) — the $2,500 cap in cents.
// RAISED from 200_000 by owner ruling C2b (2026-07-26, re-confirmed in chat: "IT IS 2500 NOW"). This
// guard previously pinned the OLD value, so it would have gone red on the correct fix and green on the
// stale one — a guard asserting the very number it exists to protect. Tightened, never weakened.
const CAP_NUM = "250_?000";
// The superseded cap must not survive anywhere in the scanned money code — not as a constant and not
// as a string stamped into a ledger row (three such literals were being written into permanent
// financial records: a JE line description, an escrow posting note, and the escrow-ledger INSERT).
const STALE_CAP_RE = /\b200_?000\b|\$2,000/;
const CAP_RE = new RegExp(`escrow[\\s\\S]{0,200}${CAP_NUM}|${CAP_NUM}[\\s\\S]{0,200}escrow`, "i");
const CLAMP_RE = new RegExp(
  `Math\\.max\\(\\s*0\\s*,\\s*[\\w.]*(?:${CAP_NUM}|[A-Z_]*ESCROW[A-Z_]*CAP[A-Z_]*)[\\w.]*\\s*-\\s*[\\w.]+\\s*\\)`,
  "i"
);
const CONTRIBUTION_MARKER_RE = /escrow_contribution|escrowContribution/;
const RELEASE_OR_FORFEIT_RE = /(?:posting_type|postingType)\s*[:=]\s*['"](release|forfeit)['"]/i;

/** Strip // line comments and /* *\/ block comments so a guard-describing COMMENT (e.g. a code sample in a
 * doc-comment) can never satisfy the cap/clamp checks in place of real code. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Pure evaluation.
 * @param {{ files: Array<{path:string, text:string}> }} args
 * @returns {string[]} errors
 */
export function assertGuard({ files }) {
  const errors = [];
  const combined = files.map((f) => stripComments(f.text)).join("\n");

  if (!CAP_RE.test(combined)) {
    errors.push("no 250000-cent ($2,500) escrow-contribution cap constant found near an 'escrow' reference (in real code, not a comment)");
  }
  if (STALE_CAP_RE.test(combined)) {
    errors.push("the superseded $2,000 / 200000 cap survives in scanned money code — owner ruling C2b raised it to $2,500; a stale literal here can be STAMPED INTO a ledger row");
  }
  if (!CLAMP_RE.test(combined)) {
    errors.push("no max(0, cap - balance) style clamp found for the escrow contribution (this is what guarantees it is never negative)");
  }

  for (const f of files) {
    const code = stripComments(f.text);
    if (!CONTRIBUTION_MARKER_RE.test(code)) continue; // not an escrow-contribution (pay-run) file — out of scope
    if (RELEASE_OR_FORFEIT_RE.test(code)) {
      errors.push(
        `${f.path}: the pay-run escrow-contribution path posts a 'release'/'forfeit' escrow entry — forbidden, ` +
          `hold/contribution only`
      );
    }
  }

  return errors;
}

function walkFiles(dirRel) {
  const abs = path.join(ROOT, dirRel);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) out.push(p);
    }
  };
  walk(abs);
  return out;
}

function buildFiles() {
  const files = [];
  for (const dir of SCAN_DIRS) {
    for (const abs of walkFiles(dir)) {
      files.push({ path: path.relative(ROOT, abs), text: fs.readFileSync(abs, "utf8") });
    }
  }
  return files;
}

function selftest() {
  const goodContributionFile = {
    path: "apps/backend/src/driver-finance/escrow-contribution.service.ts",
    text: `
export const ESCROW_CONTRIBUTION_CAP_CENTS = 250000; // $2,500 escrow cap (pay-run, owner-locked C2b)

export function computeEscrowContribution(currentBalanceCents) {
  return Math.max(0, ESCROW_CONTRIBUTION_CAP_CENTS - currentBalanceCents);
}

export async function postEscrowContribution(client, args) {
  await client.query(
    \`INSERT INTO driver_finance.settlement_lines (settlement_id, line_type, amount) VALUES ($1, 'escrow_contribution', $2)\`,
    [args.settlementId, args.contributionCents]
  );
  await recordEscrowPosting(client, { posting_type: 'hold', amount_cents: args.contributionCents });
}
`,
  };
  const legitimateSeparationFile = {
    path: "apps/backend/src/driver-finance/escrow-separation.service.ts",
    text: `
// termination flow — DISTINCT from the pay-run; returns the driver's full escrow balance on separation.
export async function releaseDriverEscrowOnSeparation(client, driverId) {
  await client.query(\`INSERT INTO accounting.escrow_postings (posting_type, ...) VALUES ('release', ...)\`);
}
`,
  };

  const cases = [
    {
      name: "well-formed cap + clamp + hold-only contribution → 0 errors",
      in: { files: [goodContributionFile, legitimateSeparationFile] },
      want: 0,
    },
    {
      name: "no 250000 cap constant anywhere → FAIL",
      in: {
        files: [
          { ...goodContributionFile, text: goodContributionFile.text.replace(/250000/g, "someDynamicLimit") },
          legitimateSeparationFile,
        ],
      },
      wantMin: 1,
    },
    {
      name: "cap exists but no Math.max(0, cap - balance) clamp → FAIL",
      in: {
        files: [
          {
            ...goodContributionFile,
            text: goodContributionFile.text.replace(
              "return Math.max(0, ESCROW_CONTRIBUTION_CAP_CENTS - currentBalanceCents);",
              "return ESCROW_CONTRIBUTION_CAP_CENTS - currentBalanceCents;"
            ),
          },
          legitimateSeparationFile,
        ],
      },
      wantMin: 1,
    },
    {
      name: "pay-run contribution file also posts a 'release' → FAIL",
      in: {
        files: [
          { ...goodContributionFile, text: goodContributionFile.text.replace("posting_type: 'hold'", "posting_type: 'release'") },
          legitimateSeparationFile,
        ],
      },
      wantMin: 1,
    },
    {
      name: "false-positive check: legitimate termination-separation release file alone is never flagged",
      in: { files: [legitimateSeparationFile] },
      wantMin: 1, // still fails on missing cap/clamp (no contribution file present) but NOT for the release
      assertNoReleaseError: true,
    },
    {
      name: "underscored numeric literal 250_000 (valid JS separator) is recognized as the cap",
      in: {
        files: [
          {
            ...goodContributionFile,
            text: goodContributionFile.text.replace(/250000/g, "250_000"),
          },
          legitimateSeparationFile,
        ],
      },
      want: 0,
    },
    {
      name: "false-positive check: a CAP mentioned only in a comment (no real code) does not satisfy the check",
      in: {
        files: [
          {
            path: "apps/backend/src/driver-finance/escrow-contribution.service.ts",
            text: `// the escrow cap is 250000 cents ($2,500)\nexport function noop() { return null; }`,
          },
          legitimateSeparationFile,
        ],
      },
      wantMin: 1,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const errs = assertGuard(c.in);
    const n = errs.length;
    let ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (ok && c.assertNoReleaseError) {
      ok = !errs.some((e) => e.includes("release"));
    }
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const files = buildFiles();
if (files.length === 0) {
  console.error(`[${LABEL}] FAILED — no files found under ${SCAN_DIRS.join(", ")}`);
  process.exit(1);
}
const errors = assertGuard({ files });
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — escrow contribution capped at 250000 cents ($2,500) with a max(0, cap-balance) clamp, no release/forfeit in the pay-run path.`);
