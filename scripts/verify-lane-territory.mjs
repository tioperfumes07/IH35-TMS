#!/usr/bin/env node
/**
 * verify-lane-territory.mjs — LAW-2026-08-07-LANE-TERRITORY. Stop the lanes colliding.
 *
 * WHY, from measurement rather than assumption. Ownership across the last 60 PRs, by lane prefix:
 * `backend/dispatch` 0/29/0, `backend/mdata` 0/26/0, `apps/frontend` 0/12/0 — CC-2 only.
 * `backend/accounting` 4/0/0, `driver-finance` 3/0/0, `db/migrations` 3/0/0, `.github` 7/0/0 — CC-1
 * only. So the lanes DO NOT collide on domain code; it is already cleanly partitioned in practice, and
 * this guard's job is to keep it that way rather than to impose a split that does not exist.
 *
 * The places they genuinely contend — `docs/audit/*`, `docs/law/*`, `scripts/verify-steps/*` — are
 * append-only registries, and those are solved by union merge (CI-F20/CI-F23), NOT by ownership. This
 * guard deliberately does not touch them: making a shared board single-owner would break the
 * agent -> board -> agent flow that the permanent law requires.
 *
 * TWO ALTERNATIVES WERE CHECKED AND RULED OUT, recorded so nobody re-proposes them:
 *   - GitHub merge queue: unavailable. Private repo on a User plan; merge queues need Team/Enterprise.
 *   - CODEOWNERS: present but INERT — the ruleset requires 0 approving reviews, so an entry notifies
 *     and can never block. It is not a collision control in this repo.
 * A CI guard keyed on the lane prefix is what is left, and the prefixes are reliable: Claude-1 (21),
 * Claude-2 (11), Claude-3 (2) across the sampled PRs.
 *
 * TERRITORY IS BY DOMAIN, NEVER BY FILE SUFFIX. An accounting route is MONEY. The old
 * "CC-1 never touches routes" wording forced money work to be split across two lanes mid-file, which
 * is worse than the collision it was meant to prevent.
 *
 * ADVISORY WHEN THE LANE IS UNKNOWN. Outside a PR context — local runs, pushes to main, a title with
 * no lane prefix — there is nothing to check and it exits 0. A guard that fails when it simply cannot
 * tell would be noise, and noise is how guards get ignored.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lane-territory";

/** Exclusive domain territory. Anything not listed is shared and never flagged. */
export const TERRITORY = {
  "Claude-1": [
    "db/migrations/",
    "apps/backend/src/accounting/",
    "apps/backend/src/driver-finance/",
    "apps/backend/src/banking/",
    "apps/backend/src/factoring/",
    "apps/backend/src/fuel/",
    "apps/backend/src/qbo-sync/",
    ".github/workflows/",
  ],
  "Claude-2": [
    "apps/frontend/",
    "apps/driver-pwa/",
    "apps/backend/src/dispatch/",
    "apps/backend/src/mdata/",
    "apps/backend/src/safety/",
  ],
};

/** Union-merged registries every lane writes by design — ownership must never apply to these. */
const SHARED = [
  "docs/audit/",
  "docs/law/",
  "scripts/.guard-exempt.json",
  "scripts/verify-steps/CLAIMED-NUMBERS.json",
  "docs/standing-orders/",
  "docs/module-completion/",
];

export function laneOf(title) {
  for (const lane of ["Claude-1", "Claude-2", "Claude-3"]) if ((title ?? "").startsWith(lane)) return lane;
  return null;
}

export function findTrespasses(lane, files) {
  if (!lane || !TERRITORY[lane]) return []; // CC-3 owns no product code; unknown lane = advisory
  const out = [];
  for (const f of files) {
    if (SHARED.some((s) => f.startsWith(s))) continue;
    for (const [owner, roots] of Object.entries(TERRITORY)) {
      if (owner === lane) continue;
      if (roots.some((r) => f.startsWith(r))) out.push({ file: f, owner });
    }
  }
  return out;
}

function prContext() {
  const ev = process.env.GITHUB_EVENT_PATH;
  if (ev && fs.existsSync(ev)) {
    try {
      const pr = JSON.parse(fs.readFileSync(ev, "utf8")).pull_request;
      if (pr?.title) return { title: pr.title, base: pr.base?.ref ?? "main" };
    } catch { /* fall through */ }
  }
  return null;
}

function changedFiles(base) {
  try {
    return execFileSync("git", ["diff", "--name-only", `origin/${base}...HEAD`], { encoding: "utf8" })
      .split("\n").map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

function run() {
  const ctx = prContext();
  if (!ctx) { console.log(`${LABEL} OK — not a PR context; nothing to check`); return 0; }
  const lane = laneOf(ctx.title);
  if (!lane) { console.log(`${LABEL} OK — no lane prefix in "${ctx.title.slice(0, 48)}"; advisory only`); return 0; }

  const bad = findTrespasses(lane, changedFiles(ctx.base));
  if (!bad.length) { console.log(`${LABEL} OK — ${lane} stayed inside its territory`); return 0; }

  console.error(`${LABEL} FAIL — ${lane} edited ${bad.length} file(s) owned by another lane:\n`);
  for (const b of bad) console.error(`  - ${b.file}  (owned by ${b.owner})`);
  console.error(
    `\nTerritory is by DOMAIN, not file suffix. Two lanes sweeping the same files simultaneously is\n` +
      `what turned every PR in the repo red on 2026-08-06.\n\n` +
      `If a guard you cannot disable forced this edit as part of YOUR block (e.g. touching a route file\n` +
      `pulls it into the rate-limit guard's scope), keep it, say so in the PR body, and file a board row\n` +
      `for the owning lane. Do NOT start a sweep in their territory. Otherwise: write the finding to\n` +
      `docs/audit/GUARD-WORKORDERS.md and let the owning lane fix it.\n`
  );
  return 1;
}

function selftest() {
  const f = [];
  const t = (name, lane, files, want) => {
    const got = findTrespasses(lane, files).length;
    if (got !== want) f.push(`${name}: expected ${want} trespass(es), got ${got}`);
  };
  t("CC-1 in its own money territory", "Claude-1", ["apps/backend/src/accounting/x.ts", "db/migrations/1.sql"], 0);
  t("CC-1 into CC-2 frontend", "Claude-1", ["apps/frontend/src/App.tsx"], 1);
  t("CC-1 into CC-2 dispatch", "Claude-1", ["apps/backend/src/dispatch/loads.routes.ts"], 1);
  t("CC-2 into CC-1 migrations", "Claude-2", ["db/migrations/9.sql"], 1);
  t("CC-2 in its own territory", "Claude-2", ["apps/backend/src/mdata/drivers.routes.ts"], 0);
  t("shared board is never a trespass", "Claude-1", ["docs/audit/GUARD-WORKORDERS.md", "docs/law/LAW.json"], 0);
  t("an accounting ROUTE is money, not a route", "Claude-1", ["apps/backend/src/accounting/payments.routes.ts"], 0);
  t("unowned path is shared", "Claude-2", ["scripts/verify-thing.mjs"], 0);
  t("CC-3 owns no product code — advisory", "Claude-3", ["apps/frontend/src/App.tsx"], 0);
  t("unknown lane is advisory", null, ["apps/frontend/src/App.tsx"], 0);

  if (f.length) { for (const x of f) console.error(`${LABEL} SELFTEST FAIL — ${x}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — 10 cases: own territory GREEN, cross-lane RED, shared registries and accounting routes never flagged`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? selftest() : run());
}
