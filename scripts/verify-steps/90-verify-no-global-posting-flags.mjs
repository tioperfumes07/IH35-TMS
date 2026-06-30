import fs from "node:fs";
import path from "node:path";

// Per-entity posting-flag guard (Block 01): GL-posting / void flags must resolve PER-ENTITY via
// isEnabled(client, KEY, {operating_company_id}) against lib.feature_flags — NEVER a global
// `process.env.*_GL_POSTING_*` / `process.env.*_VOID_ENABLED` read. A global env flip is all-or-nothing
// across every entity (flipping USMCA on would flip TRANSP on — $1.22M A/P, Chapter 11). This guard
// FAILS the build if any backend source reads such a flag from process.env (tests are exempt — they may
// set/delete env to drive legacy paths). The fix is always: read it via the feature-flag helper.

const SRC = path.resolve("apps/backend/src");
const BANNED_RE = /process\.env\.[A-Z_]*(?:_GL_POSTING_[A-Z_]*|_VOID_ENABLED)\b/;

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, acc);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) acc.push(full);
  }
  return acc;
}

const offenders = [];
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, "utf8");
  src.split("\n").forEach((line, i) => {
    if (BANNED_RE.test(line)) offenders.push(`${path.relative(process.cwd(), file)}:${i + 1}  ${line.trim()}`);
  });
}

export default {
  name: "verify-no-global-posting-flags",
  run: async () => {
    if (offenders.length) {
      console.error(
        "verify-no-global-posting-flags FAILED — GL-posting/void flags must resolve per-entity via\n" +
          "isEnabled(client, KEY, {operating_company_id}), NOT a global process.env read:\n  " +
          offenders.join("\n  ") +
          "\nFix: read the flag through ../lib/feature-flags/service.js isEnabled() with the request's opco."
      );
      process.exit(1);
    }
    console.log("verify-no-global-posting-flags PASS — no global posting/void flag reads in backend src");
  },
};
