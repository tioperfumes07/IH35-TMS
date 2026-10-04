// ROUND 363-CC3-C — every generator in scripts/ declares its artifact in docs/specs/DERIVED-ARTIFACTS.json ("generated"),
// and verify-derived-artifact-freshness checks each one by its mode:
//   regen-diff     regenerate in a scratch worktree of HEAD and compare every declared path to the committed file (a
//                  pair = several paths of ONE artifact, so regenerating one member without the other fails); only the
//                  declared "volatile" lines (measured by running the generator twice) may differ
//   stamp          the existing healthzSha / generated_at check (the "artifacts" list)
//   not-committed  gitignored and untracked — rebuilt on every use, must never be committed
//   historical     a one-off whose committed output is a dated record; tracked, never regenerated
// "Stale" = a generated file was not regenerated after main moved. Not a broken PR, nothing lost: run `regenerate`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";

export const GENERATOR_FILE_RE = /^(gen|generate)-[A-Za-z0-9-]+\.(mjs|cjs|js|ts)$/;
export const MODES = new Set(["regen-diff", "stamp", "not-committed", "historical"]);

/** Strip the declared volatile lines (each entry is a substring that marks a line allowed to change every run). */
export function normalise(text, volatile = []) {
  return String(text ?? "")
    .split("\n")
    .filter((line) => !volatile.some((v) => line.includes(v)))
    .join("\n");
}

/**
 * Pure decision core.
 * @param {{ entries:any[], generatorsOnDisk:string[], exists:(p:string)=>boolean, isTracked:(p:string)=>boolean,
 *           isIgnored:(p:string)=>boolean, regen:Map<string,{committed:string|null,fresh:string|null}>|null }} x
 * @returns {{ problems:string[], stats:{generators:number, registered:number, checked:number, stale:number} }}
 */
export function analyseGenerated(x) {
  const problems = [];
  const unverifiableHere = [];
  const stats = { generators: x.generatorsOnDisk.length, registered: 0, checked: 0, stale: 0, unverifiableHere: 0 };
  // ROUND 389 (LEAD) — an entry that declares `requiresDatabase: true` cannot be regenerated without a
  // read-only DATABASE_URL. The registry has carried that declaration since the entry was written and this
  // core DISCARDED it, so a missing credential was reported as `did not produce it` — the same words as a
  // genuinely broken generator. Two different facts, one anonymous message: every local push on every
  // branch failed closed on a credential, and the one guard that checks this artifact is wired into no
  // verify-step, so CI (which HAS the credential, ci.yml) never ran it either. The artifact was therefore
  // verified NOWHERE while reporting as blocked.
  //
  // Named, counted and loud — never silently skipped (this file's own law, line 32 of the guard):
  //   requiresDatabase + no DATABASE_URL  -> UNVERIFIABLE HERE, named with the var and the command.
  //                                          `strict` (CI) makes it a hard problem, so a CI run that
  //                                          somehow lacks the secret can never go green on it.
  //   requiresDatabase + DATABASE_URL     -> regenerated and diffed exactly as before.
  //   no requiresDatabase + failure       -> a hard problem as before, now carrying the generator's own
  //                                          stderr so the next reader is not guessing at the cause.
  const strict = Boolean(x.strict);
  const hasDb = Boolean(x.hasDatabaseUrl);
  const declared = new Set(x.entries.map((e) => e.generator));
  for (const g of x.generatorsOnDisk) {
    if (!declared.has(g)) problems.push(`${g}: a generator with no declared artifact — add it to DERIVED-ARTIFACTS.json "generated" (path(s), mode, regenerate). An unregistered generated file can be arbitrarily stale with nothing to notice.`);
  }
  stats.registered = x.generatorsOnDisk.filter((g) => declared.has(g)).length;
  for (const e of x.entries) {
    stats.checked++;
    if (!x.exists(e.generator)) { problems.push(`${e.generator}: declared generator does not exist`); continue; }
    if (!MODES.has(e.mode)) { problems.push(`${e.generator}: unknown mode ${JSON.stringify(e.mode)}`); continue; }
    if (!Array.isArray(e.paths) || !e.paths.length) { problems.push(`${e.generator}: declares no output path`); continue; }
    if (!e.why) problems.push(`${e.generator}: no "why" — say what the artifact is and who reads it`);
    if (e.mode === "not-committed") {
      for (const p of e.paths) {
        if (x.isTracked(p)) problems.push(`${p}: declared not-committed but it is tracked — a rebuilt-on-use file must never be committed`);
        if (!x.isIgnored(p)) problems.push(`${p}: declared not-committed but not gitignored`);
      }
    } else if (e.mode === "historical") {
      for (const p of e.paths) if (!x.isTracked(p)) problems.push(`${p}: declared historical record but not tracked`);
    } else if (e.mode === "regen-diff") {
      if (!e.regenerate) { problems.push(`${e.generator}: regen-diff with no regenerate command`); continue; }
      if (e.requiresDatabase && !hasDb) {
        // The entry's own declaration, honoured. Still checks that the output IS committed — only the
        // freshness half is unprovable without the credential, and that half is named, not swallowed.
        for (const p of e.paths) {
          if (!x.isTracked(p)) { problems.push(`${p}: declared output is not committed`); continue; }
          const line = `${p}: UNVERIFIABLE HERE — its generator (${e.generator}) declares requiresDatabase and DATABASE_URL is not set, so freshness cannot be proven in this environment. It IS committed. Prove it where the credential exists: \`DATABASE_URL="<read-only conn>" ${e.regenerate}\` (CI supplies it).`;
          if (strict) problems.push(line);
          else { unverifiableHere.push(line); stats.unverifiableHere++; }
        }
        continue;
      }
      const stale = [];
      for (const p of e.paths) {
        const r = x.regen?.get(p);
        if (!r) { problems.push(`${p}: was not regenerated by the check (${e.regenerate}) — cannot tell whether it is fresh; failing closed`); continue; }
        if (r.committed === null) { problems.push(`${p}: declared output is not committed`); continue; }
        if (r.fresh === null) { problems.push(`${p}: \`${e.regenerate}\` did not produce it${r.error ? ` — the generator said: ${r.error}` : ""}`); continue; }
        if (normalise(r.committed, e.volatile) !== normalise(r.fresh, e.volatile)) stale.push(p);
      }
      if (stale.length) {
        stats.stale++;
        problems.push(`STALE — ${stale.join(" + ")}${e.paths.length > 1 ? ` (one artifact in ${e.paths.length} files: ${e.paths.join(", ")})` : ""}: the committed file differs from what its generator produces from today's inputs. Regenerate and commit ${e.paths.length > 1 ? "ALL of them together" : "it"}: \`${e.regenerate}\`.`);
      }
    }
  }
  return { problems, unverifiableHere, stats };
}

/** Run every regen-diff command in ONE scratch worktree of HEAD; return path -> { committed, fresh }. */
export function regenerateInScratch(root, entries) {
  const out = new Map();
  // ROUND 389 — a generator that declares requiresDatabase cannot run without the credential, so do not
  // spend a worktree and a 240s timeout proving that again. analyseGenerated reports those by name.
  const hasDb = Boolean(process.env.DATABASE_URL);
  const todo = entries.filter((e) => e.mode === "regen-diff" && e.regenerate && !(e.requiresDatabase && !hasDb));
  if (!todo.length) return out;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "derived-artifacts-"));
  const wt = path.join(tmp, "wt");
  execSync(`git worktree add --detach --quiet "${wt}" HEAD`, { cwd: root, stdio: "pipe" });
  try {
    for (const nm of ["node_modules", "apps/backend/node_modules", "apps/frontend/node_modules"]) {
      const src = path.join(root, nm);
      if (fs.existsSync(src) && !fs.existsSync(path.join(wt, nm))) fs.symlinkSync(fs.realpathSync(src), path.join(wt, nm));
    }
    for (const e of todo) {
      try {
        execSync(e.regenerate, { cwd: wt, stdio: "pipe", timeout: 240000, env: process.env, shell: "/bin/bash" });
      } catch (err) {
        for (const p of e.paths) out.set(p, { committed: readHead(root, p), fresh: null, error: String(err.message).slice(0, 200) });
        continue;
      }
      for (const p of e.paths) {
        const f = path.join(wt, p);
        out.set(p, { committed: readHead(root, p), fresh: fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null });
      }
    }
  } finally {
    try { execSync(`git worktree remove --force "${wt}"`, { cwd: root, stdio: "pipe" }); } catch {}
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  }
  return out;
}

function readHead(root, p) {
  try { return execSync(`git show HEAD:${p}`, { cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }); }
  catch { return null; }
}

export function generatorsOnDisk(root) {
  return fs.readdirSync(path.join(root, "scripts")).filter((f) => GENERATOR_FILE_RE.test(f)).map((f) => `scripts/${f}`).sort();
}

export function gitPredicates(root) {
  const ok = (cmd) => { try { execSync(cmd, { cwd: root, stdio: "pipe" }); return true; } catch { return false; } };
  return {
    exists: (p) => fs.existsSync(path.join(root, p)),
    isTracked: (p) => ok(`git ls-files --error-unmatch "${p}"`),
    isIgnored: (p) => ok(`git check-ignore -q "${p}"`),
  };
}
