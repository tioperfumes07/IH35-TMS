#!/usr/bin/env node
/**
 * verify-hotfile-single-open-pr.mjs — LAW-2026-08-07-LANE-TERRITORY, layer 1b.
 *
 * Territory (verify-lane-territory.mjs) stops two lanes editing each other's DOMAIN. It cannot help
 * with the files that legitimately belong to everyone: a handful of genuinely shared entry points
 * that any lane may need to touch for its own correct reasons. Those are where the remaining
 * collisions live, and the only fix is serialization — one open PR at a time.
 *
 * This is the enforced version of Rule 26, which until now was prose and was routinely missed.
 *
 * WHAT IS *NOT* HERE, and the omission is the point. The append-only registries — docs/audit/*.md,
 * docs/law/LAW.json, scripts/.guard-exempt.json, CLAIMED-NUMBERS.json — are deliberately excluded.
 * They are union-merged (CI-F20/CI-F23), so concurrent writes are SAFE, and serializing them would
 * break the agent -> board -> agent flow the permanent law requires: a lane must be able to file a
 * finding at any moment without waiting for a token. Union solved those; ownership and serialization
 * are the wrong tools for them.
 *
 * The list below is therefore short on purpose: true single-definition entry points where two
 * concurrent edits conflict structurally and no merge driver can help.
 *
 * ADVISORY WHEN IT CANNOT SEE. Outside a PR context, or when the GitHub API is unavailable, it exits
 * 0 — a guard that fails because it could not look is noise, and noise is how guards get ignored.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-hotfile-single-open-pr";
const REPO = process.env.GITHUB_REPOSITORY ?? "tioperfumes07/IH35-TMS";

/**
 * Single-definition entry points. Two concurrent edits collide structurally here and no union driver
 * can resolve them, because the conflict is semantic (one router, one app shell, one step list).
 */
export const HOT_FILES = [
  "apps/frontend/src/App.tsx",
  "apps/backend/src/index.ts",
  "scripts/verify-pre-commit.mjs",
  "package.json",
  "apps/frontend/src/pages/program/AuditScoreboardPage.tsx",
];

export function findContention(thisPr, openPrs) {
  const mine = new Set((thisPr.files ?? []).filter((f) => HOT_FILES.includes(f)));
  if (!mine.size) return [];
  const out = [];
  for (const other of openPrs) {
    if (other.number === thisPr.number) continue;
    for (const f of other.files ?? []) {
      if (mine.has(f)) out.push({ file: f, pr: other.number, title: (other.title ?? "").slice(0, 46) });
    }
  }
  return out;
}

function prContext() {
  const ev = process.env.GITHUB_EVENT_PATH;
  if (!ev || !fs.existsSync(ev)) return null;
  try {
    const pr = JSON.parse(fs.readFileSync(ev, "utf8")).pull_request;
    if (!pr?.number) return null;
    const base = pr.base?.ref ?? "main";
    const files = execFileSync("git", ["diff", "--name-only", `origin/${base}...HEAD`], { encoding: "utf8" })
      .split("\n").map((s) => s.trim()).filter(Boolean);
    return { number: pr.number, files };
  } catch { return null; }
}

function run() {
  const me = prContext();
  if (!me) { console.log(`${LABEL} OK — not a PR context; nothing to check`); return 0; }
  if (!me.files.some((f) => HOT_FILES.includes(f))) {
    console.log(`${LABEL} OK — touches no serialized hot file`);
    return 0;
  }
  let open;
  try {
    open = JSON.parse(execFileSync("gh",
      ["pr", "list", "--repo", REPO, "--state", "open", "--limit", "60", "--json", "number,title,files"],
      { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }))
      .map((p) => ({ number: p.number, title: p.title, files: (p.files ?? []).map((x) => x.path) }));
  } catch (err) {
    console.log(`${LABEL} OK — could not list open PRs (${String(err.message).split("\n")[0]}); advisory only`);
    return 0;
  }

  const clash = findContention(me, open);
  if (!clash.length) { console.log(`${LABEL} OK — sole open PR on the hot file(s) it touches`); return 0; }

  console.error(`${LABEL} FAIL — ${clash.length} other open PR(s) already touch a serialized hot file:\n`);
  for (const c of clash) console.error(`  - ${c.file}  also in #${c.pr} "${c.title}"`);
  console.error(
    `\nThese are single-definition entry points: two concurrent edits conflict structurally and no\n` +
      `merge driver can resolve them. Rule 26 says ONE open PR at a time on each — this is that rule,\n` +
      `enforced instead of remembered.\n\n` +
      `Wait for the other PR to squash-merge, then rebase. Do NOT hand-resolve in the GitHub UI.\n` +
      `(Append-only registries are NOT in this list — they are union-merged and safe to write\n` +
      `concurrently, so filing a board finding never has to wait.)\n`
  );
  return 1;
}

function selftest() {
  const f = [];
  const mk = (n, files, title = "x") => ({ number: n, files, title });
  const t = (name, me, open, want) => {
    const got = findContention(me, open).length;
    if (got !== want) f.push(`${name}: expected ${want}, got ${got}`);
  };
  t("no hot file touched", mk(1, ["apps/backend/src/accounting/a.ts"]), [mk(2, ["apps/frontend/src/App.tsx"])], 0);
  t("sole PR on a hot file", mk(1, ["apps/frontend/src/App.tsx"]), [mk(2, ["docs/audit/GUARD-WORKORDERS.md"])], 0);
  t("two PRs on the same hot file", mk(1, ["apps/frontend/src/App.tsx"]), [mk(2, ["apps/frontend/src/App.tsx"])], 1);
  t("self is never contention", mk(1, ["apps/backend/src/index.ts"]), [mk(1, ["apps/backend/src/index.ts"])], 0);
  t("union registries are NOT serialized", mk(1, ["docs/law/LAW.json"]), [mk(2, ["docs/law/LAW.json"])], 0);
  t("board is NOT serialized", mk(1, ["docs/audit/GUARD-WORKORDERS.md"]), [mk(2, ["docs/audit/GUARD-WORKORDERS.md"])], 0);

  if (f.length) { for (const x of f) console.error(`${LABEL} SELFTEST FAIL — ${x}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — 6 cases: contention RED, sole-PR GREEN, union registries never serialized`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? selftest() : run());
}
