/** Rule 17: verify-step wrapper — do not edit package.json / locked-guards / ci.yml. */
export default {
  name: "verify-legal-matter-lawsuit-linkage",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-legal-matter-lawsuit-linkage.mjs"]);
  },
};
