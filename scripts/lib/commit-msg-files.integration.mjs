// Isolated real-Git coverage for ENG-18. Never mutates the checkout or its hooks.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { gitChildEnv } from "../trusted-git-environment.mjs";

export function testCommitMsgFiles() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ih35-commit-intent-"));
  const env = { ...gitChildEnv(root), GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: os.devNull };
  delete env.IH35_COMMIT_INTENT;
  const run = (exe, args) => execFileSync(exe, args, { cwd: tmp, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const git = (...args) => run("git", args);
  const cases = [];
  const check = (name, predicate) => { cases.push([name, predicate]); };
  const observed = () => JSON.parse(fs.readFileSync(path.join(tmp, ".git/result.json"), "utf8"));
  const stage = (name, content) => { fs.writeFileSync(path.join(tmp, name), content); git("add", name); };
  const commit = (kind, empty = false) => {
    fs.writeFileSync(path.join(tmp, ".git/message.txt"), "isolated test\n");
    run(process.execPath, [path.join(root, "scripts/commit-with-evidence.mjs"), "--kind", kind, "--message-file", ".git/message.txt", ...(empty ? ["--allow-empty"] : [])]);
  };
  try {
    git("init", "-q"); git("config", "user.name", "Isolated Test"); git("config", "user.email", "test@example.invalid");
    git("config", "core.hooksPath", path.join(tmp, ".git/hooks"));
    const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
    fs.writeFileSync(path.join(tmp, ".git/hooks/prepare-commit-msg"), `#!/bin/sh\n${quote(process.execPath)} ${quote(path.join(root, "scripts/prepare-commit-kind.mjs"))} "$@"\n`);
    fs.writeFileSync(path.join(tmp, ".git/observe.mjs"), `import fs from 'node:fs'; import {resolveCommitMsgFiles} from ${JSON.stringify(new URL("./commit-msg-files.mjs", import.meta.url).href)}; fs.writeFileSync('.git/result.json', JSON.stringify(resolveCommitMsgFiles()));\n`);
    fs.writeFileSync(path.join(tmp, ".git/hooks/commit-msg"), `#!/bin/sh\n${quote(process.execPath)} .git/observe.mjs\n`);
    for (const hook of ["prepare-commit-msg", "commit-msg"]) fs.chmodSync(path.join(tmp, ".git/hooks", hook), 0o755);
    stage("money.ts", "first\n"); commit("new");
    check("root new uses staged files", observed().source === "staged" && observed().files.join() === "money.ts");
    commit("amend");
    check("root amend includes root files", observed().source === "amend" && observed().files.join() === "money.ts");
    stage("note.md", "new\n"); commit("new");
    check("new docs commit excludes previous money", observed().files.join() === "note.md");
    stage("money.ts", "second\n"); commit("new");
    stage("extra.md", "extra\n"); git("commit", "--amend", "-qm", "raw amend with staged docs");
    check("raw amend -m retains prior money plus staged docs", observed().source === "unknown-both" && observed().files.includes("money.ts") && observed().files.includes("extra.md"));
    git("commit", "--allow-empty", "-C", "HEAD");
    check("new -C HEAD never falsely labelled amend", observed().source === "unknown-both");
    commit("new", true);
    check("explicit empty new has no prior files", observed().files.length === 0);
    stage("money.ts", "third\n"); commit("new");
    stage("money.ts", git("show", "HEAD^:money.ts"));
    stage("another.md", "another\n"); commit("amend");
    check("amend reverted money excluded from final tree diff", !observed().files.includes("money.ts") && observed().files.includes("another.md"));
    const mainBranch = git("branch", "--show-current").trim();
    git("branch", "sibling");
    stage("left.md", "left\n"); commit("new");
    git("checkout", "-q", "sibling");
    stage("right.md", "right\n"); commit("new");
    git("checkout", "-q", mainBranch);
    git("merge", "--no-ff", "--no-edit", "sibling"); commit("amend");
    check("merge amend uses first parent", observed().files.join() === "right.md");
    stage("staged-only.md", "must not enter partial commit\n");
    fs.writeFileSync(path.join(tmp, "another.md"), "partial\n");
    git("commit", "--only", "another.md", "-qm", "partial commit");
    check("partial commit honors Git temporary index", observed().files.includes("another.md") && !observed().files.includes("staged-only.md"));
    return cases;
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
