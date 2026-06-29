import { execSync } from "node:child_process";

// CODER-10 (BUGFIX-CLUSTER): repo-wide guard — no leftover Git merge conflict markers
// in any tracked file (ci.yml and everything else). A botched conflict resolution that
// leaves markers in a workflow, a service, or a config silently breaks that file.
//
// We match the unambiguous markers a real conflict ALWAYS contains:
//   <<<<<<< <ref>      (ours)
//   ||||||| <ref>      (merged common ancestor, diff3 style)
//   >>>>>>> <ref>      (theirs)
// We intentionally do NOT match a bare "=======" line: exactly seven '=' collides with
// Markdown/plain-text setext rules and section underlines, and every real conflict is
// already caught by its <<<<<<< / >>>>>>> pair — so this stays 100% sensitive with zero
// false positives. The pattern requires the 7 chars at line start followed by a space or
// end-of-line (real markers carry a trailing space + branch label).
const MARKER_RE = "^(<{7}|>{7}|\\|{7})( |$)";

export default {
  name: "verify-no-conflict-markers",
  run: async () => {
    let out = "";
    try {
      out = execSync(
        `git grep -nE '${MARKER_RE}' -- . ':(exclude)scripts/verify-steps/70-verify-no-conflict-markers.mjs'`,
        { encoding: "utf8" }
      );
    } catch (e) {
      // `git grep` exits 1 with no output when there are no matches — that is the pass path.
      if (e.status === 1 && !String(e.stdout || "").trim()) {
        console.log("verify-no-conflict-markers OK — no merge conflict markers in tracked files.");
        return;
      }
      throw e;
    }
    if (out.trim()) {
      console.error("verify-no-conflict-markers FAILED — leftover merge conflict markers:");
      console.error(out);
      process.exit(1);
    }
    console.log("verify-no-conflict-markers OK — no merge conflict markers in tracked files.");
  },
};
