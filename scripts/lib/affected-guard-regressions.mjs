/**
 * NO-REGRESSION CHECK for the fast merge (owner 2026-10-25 9:37 PM CT: "There should be no regressions").
 * Root cause of the 37 regressions measured on 2026-10-25: merges changed files that a guard reads, and nobody
 * ran that guard. This runs exactly those guards — every scripts/verify-*.mjs whose source names a changed
 * file (or a changed guard itself) — through verify-static's own classify() (same live-DB exclusion,
 * capability handling and --selftest folding as the static gate). A FAIL on the branch is re-classified on a
 * clean worktree of origin/main: fails there too = pre-existing red (reported, not blocking); passes on
 * main = REGRESSION (this merge broke it).
 */
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const git = (cwd, args) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

/** Tokens a guard would use to name a changed file: the repo path, the path under src/, the basename stem. */
export function fileTokens(rel) {
  const out = new Set([rel]);
  const m = rel.match(/^apps\/(?:backend|frontend|driver-pwa)\/src\/(.+)$/);
  if (m) out.add(m[1]);
  const stem = path.basename(rel).replace(/\.(tsx?|mjs|js|sql|json)$/, "");
  if (stem.length >= 10 && !/^(index|routes|service|types|utils)$/.test(stem)) out.add(stem);
  return [...out];
}

export function affectedGuards(root, changed) {
  const dir = path.join(root, "scripts");
  const tokens = changed.flatMap(fileTokens);
  const guards = new Set(changed.filter((f) => /^scripts\/verify-[^/]+\.mjs$/.test(f)).map((f) => path.join(root, f)));
  // A changed/removed verify-step changes WHAT CI RUNS — the wiring guard always judges that.
  if (changed.some((f) => f.startsWith("scripts/verify-steps/"))) guards.add(path.join(dir, "verify-guard-wired.mjs"));
  for (const f of fs.readdirSync(dir)) {
    if (!/^verify-.+\.mjs$/.test(f)) continue;
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    if (tokens.some((t) => src.includes(t))) guards.add(path.join(dir, f));
  }
  return [...guards].filter((g) => fs.existsSync(g)).sort();
}

function mainRefWorktree(root) {
  const ref = process.env.FAST_MERGE_MAIN_REF || path.resolve(root, "..", ".fast-merge-main-ref");
  if (!fs.existsSync(path.join(ref, ".git"))) git(root, ["worktree", "add", "-f", "--detach", ref, "origin/main"]);
  git(ref, ["checkout", "-q", "--detach", "origin/main"]);
  for (const d of [".", "apps/frontend", "apps/backend"]) {
    const src = path.join(root, d, "node_modules");
    const dst = path.join(ref, d, "node_modules");
    if (fs.existsSync(src) && !fs.existsSync(dst)) fs.symlinkSync(fs.realpathSync(src), dst);
  }
  return ref;
}

function classifyIn(worktree, guardRel) {
  const code = `const m = await import(${JSON.stringify(path.join(worktree, "scripts/verify-static.mjs"))});` +
    `const r = m.classify(${JSON.stringify(path.join(worktree, guardRel))});` +
    `process.stdout.write(JSON.stringify({ kind: r.kind, detail: r.detail }));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: worktree, encoding: "utf8", timeout: 240_000 });
  try { return JSON.parse(r.stdout.trim().split("\n").pop()); } catch { return { kind: "FAIL-test", detail: (r.stderr || "classify crashed").slice(0, 200) }; }
}

export function checkNoRegressions(root, { log = console.log } = {}) {
  git(root, ["fetch", "-q", "origin", "main"]);
  const changed = git(root, ["diff", "--name-only", "origin/main...HEAD"]).split("\n").filter(Boolean);
  // ADDITIVE-ONLY: a branch whose squash would DELETE files (e.g. a soft reset onto a newer main that keeps an
  // older index — #27828 silently removed four verify-steps that way) is refused unless each deletion is declared.
  const deleted = git(root, ["diff", "--name-only", "--diff-filter=D", "origin/main...HEAD"]).split("\n").filter(Boolean);
  const guards = affectedGuards(root, changed);
  log(`no-regression: ${changed.length} changed file(s) → ${guards.length} guard(s) that read them`);
  const regressions = [], preExisting = [];
  let ref = null;
  for (const g of guards) {
    const rel = path.relative(root, g);
    const here = classifyIn(root, rel);
    if (here.kind !== "FAIL-test") continue;
    ref ??= mainRefWorktree(root);
    const onMain = fs.existsSync(path.join(ref, rel)) ? classifyIn(ref, rel) : { kind: "ABSENT" };
    if (onMain.kind === "FAIL-test") preExisting.push(`${rel} — ${here.detail}`);
    else regressions.push(`${rel} — ${here.detail} (main: ${onMain.kind})`);
  }
  for (const p of preExisting) log(`  pre-existing red (also fails on main): ${p}`);
  return { changed, deleted, guards, regressions, preExisting };
}
