// Step 1760 — ACCT-LINK-05: posting_templates in-app create path + consumer stamp wiring.
// Rule 17: verify-steps ONLY — never edit package.json / ci.yml / locked-guards.
export default {
  name: "verify-acct-link05-posting-template-create",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-acct-link05-posting-template-create.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-acct-link05-posting-template-create.mjs"]);
  },
};
