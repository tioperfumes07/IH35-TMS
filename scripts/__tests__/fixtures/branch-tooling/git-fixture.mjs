import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export function runGitOrThrow(args, options = {}) {
  const cwd = options.cwd;
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...(options.env ?? {}) },
  });
  if ((result.status ?? 1) !== 0) {
    throw new Error(`${result.stdout ?? ""}${result.stderr ?? ""}`.trim() || `git ${args.join(" ")} failed`);
  }
  return (result.stdout ?? "").trim();
}

export function initFixtureRepo(fixtureDir) {
  fs.mkdirSync(fixtureDir, { recursive: true });
  runGitOrThrow(["init", "-b", "main"], { cwd: fixtureDir });
  runGitOrThrow(["config", "user.email", "fixture@ih35.test"], { cwd: fixtureDir });
  runGitOrThrow(["config", "user.name", "IH35 Fixture"], { cwd: fixtureDir });
  return fixtureDir;
}

export function writeAndCommit(fixtureDir, filePath, contents, message) {
  const absolute = path.join(fixtureDir, filePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, contents, "utf8");
  runGitOrThrow(["add", filePath], { cwd: fixtureDir });
  runGitOrThrow(["commit", "-m", message], { cwd: fixtureDir });
}

export function attachBareOrigin(fixtureDir) {
  const bare = `${fixtureDir}.git`;
  if (fs.existsSync(bare)) {
    fs.rmSync(bare, { recursive: true, force: true });
  }
  runGitOrThrow(["init", "--bare", bare]);
  const hasOrigin = spawnSync("git", ["remote"], { cwd: fixtureDir, encoding: "utf8" });
  if ((hasOrigin.stdout ?? "").includes("origin")) {
    runGitOrThrow(["remote", "remove", "origin"], { cwd: fixtureDir });
  }
  runGitOrThrow(["remote", "add", "origin", bare], { cwd: fixtureDir });
  runGitOrThrow(["push", "-u", "origin", "main"], { cwd: fixtureDir });
  return bare;
}
