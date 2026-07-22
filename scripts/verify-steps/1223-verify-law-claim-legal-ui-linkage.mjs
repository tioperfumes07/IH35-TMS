/** Rule 17: verify-step wrapper — do not edit package.json / locked-guards / ci.yml. */
export default {
  name: "verify-law-claim-legal-ui-linkage",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-law-claim-legal-ui-linkage.mjs"]);
  },
};
