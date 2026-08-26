#!/usr/bin/env node
/**
 * Tripwire: Cursor failed LEAD-CONTRACT T1–T6.
 * Makes CC-1 lead and pastes CLAUDE-LEAD-NOW onto INBOX-CC-1 TOP.
 * Usage: node scripts/ops/activate-claude-lead.mjs --reason="T3"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
function parseReason(argv) {
  const eq = argv.find((a) => a.startsWith("--reason="));
  if (eq) return eq.slice("--reason=".length) || "UNSPECIFIED";
  const i = argv.indexOf("--reason");
  if (i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("-")) return argv[i + 1];
  return "UNSPECIFIED";
}
const reason = parseReason(process.argv);
const when = new Date().toISOString();

const packet = fs.readFileSync(path.join(ROOT, "docs/bus/CLAUDE-LEAD-NOW.md"), "utf8");
const cursorWorker = `**23:32+ CT CLAUDE LEAD ACTIVE.** \`LEAD-SEAT=CC-1\`. You are NOT lead. Worker + deploy lieutenant. Paste: \`docs/bus/CLAUDE-LEAD-NOW.md\` §3. FAST-MERGE Cursor-lane only. Only you \`trigger_deploy\` when Claude’s census says the 5–10 gate. Do not steal \`57cabbab\`. Do not recertify U14. Tripwire reason: ${reason}.

`;

const cc1Top = `**CLAUDE YOU ARE LEAD.** Tripwire ${reason} @ ${when}. Read \`docs/bus/CLAUDE-LEAD-NOW.md\` in full (also below). Census every turn. Money NOW still \`57cabbab\` unless you rewrite it. Never \`trigger_deploy\`. Never restamp U14.

---
${packet}

---
PREVIOUS INBOX FOLLOWS
`;

function prepend(rel, block) {
  const abs = path.join(ROOT, rel);
  const cur = fs.readFileSync(abs, "utf8");
  if (cur.startsWith("**CLAUDE YOU ARE LEAD.**") || cur.includes("CLAUDE LEAD ACTIVE")) {
    console.log(`skip prepend (already activated): ${rel}`);
    return;
  }
  fs.writeFileSync(abs, block + cur);
  console.log(`prepended ${rel}`);
}

fs.writeFileSync(
  path.join(ROOT, "docs/bus/LEAD-SEAT.md"),
  `# LEAD SEAT (one line of truth)

**SEAT=CC-1**  
**SINCE=${when}**  
**REASON=${reason}**  
**PACKET=\`docs/bus/CLAUDE-LEAD-NOW.md\`**

Cursor is worker + deploy lieutenant. Claude owns census + INBOX rewrites + money NOW.
`,
);

prepend("docs/bus/INBOX-CC-1.md", cc1Top);
prepend("docs/bus/INBOX-CURSOR.md", cursorWorker);

const outboxLine = `Cursor | TRIPWIRE | ${when} | reason=${reason} | LEAD=CC-1 | PACKET=docs/bus/CLAUDE-LEAD-NOW.md | GO — Claude is lead. Cursor worker. FAST-MERGE this bus change. Nobody trigger_deploy.
`;
prepend("docs/bus/OUTBOX-CURSOR.md", outboxLine);
prepend("docs/bus/OUTBOX-CC-1.md", `Cursor→CC-1 | ${when} | LEAD | YOU ARE LEAD · read CLAUDE-LEAD-NOW.md · census now · money 57cabbab · never trigger_deploy | GO
`);

console.log(`activate-claude-lead OK reason=${reason}`);
console.log("Next: FAST-MERGE these bus files. Cursor stop leading.");
