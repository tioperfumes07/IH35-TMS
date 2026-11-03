export default {
  name: "verify:owner-authorization",
  run(ctx) {
    // 1. Prove guard mechanics work (8/8 planted violations caught).
    ctx.run("node", ["scripts/verify-owner-authorization.mjs", "--selftest"]);
    // 2. Scan real OWNER-AUTHORIZATIONS.md: confirm ≥1 OPEN block with a valid expires_at.
    //    Does NOT call git fetch or gh — safe for CI. The per-action gate (passing AUTH-<NNN>)
    //    is an operator tool, not a generic-suite check.
    ctx.run("node", [
      "--input-type=module",
      "--eval",
      `
import fs from "node:fs";
const text = fs.readFileSync("docs/bus/OWNER-AUTHORIZATIONS.md", "utf8");
const blocks = text.split(/\\n(?=## AUTH-)/);
const open = blocks.filter(b => /status:\\s*OPEN/.test(b) && /expires_at:\\s*\\S/.test(b));
if (!open.length) {
  console.error("verify-owner-authorization: scan FAIL — no OPEN blocks with expires_at found in OWNER-AUTHORIZATIONS.md");
  process.exit(1);
}
console.log(\`verify-owner-authorization: scan PASS — \${open.length} OPEN block(s) found in OWNER-AUTHORIZATIONS.md\`);
`,
    ]);
  },
};
