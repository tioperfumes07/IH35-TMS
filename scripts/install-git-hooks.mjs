#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const HUSKY_DIR = path.resolve(ROOT, ".husky");
const PRE_PUSH_PATH = path.resolve(HUSKY_DIR, "pre-push");

function run(command) {
  const res = spawnSync(command, {
    cwd: ROOT,
    shell: true,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  });
  if (res.status !== 0) {
    const output = `${res.stdout ?? ""}\n${res.stderr ?? ""}`.trim();
    throw new Error(output || `command failed: ${command}`);
  }
}

function ensurePrePushHookFile() {
  if (!fs.existsSync(HUSKY_DIR)) {
    fs.mkdirSync(HUSKY_DIR, { recursive: true });
  }
  const script = `#!/usr/bin/env sh
npm run branch:precheck-push
`;
  fs.writeFileSync(PRE_PUSH_PATH, script, "utf8");
  fs.chmodSync(PRE_PUSH_PATH, 0o755);
}

function installGitHookCopy() {
  const gitHooksDir = path.resolve(ROOT, ".git/hooks");
  fs.mkdirSync(gitHooksDir, { recursive: true });
  const target = path.join(gitHooksDir, "pre-push");
  const contents = fs.readFileSync(PRE_PUSH_PATH, "utf8");
  fs.writeFileSync(target, contents, { mode: 0o755 });
}

function main() {
  try {
    run("npx husky install");
  } catch (error) {
    console.error(`install-git-hooks FAIL: ${error.message}`);
    process.exit(1);
  }

  ensurePrePushHookFile();
  installGitHookCopy();
  console.log("Git hooks installed: .husky/pre-push -> npm run branch:precheck-push");
}

main();
