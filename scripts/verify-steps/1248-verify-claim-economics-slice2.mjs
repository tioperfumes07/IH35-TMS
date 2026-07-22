/** Rule 17: verify-step wrapper — do not edit package.json / locked-guards / ci.yml. */
export default {
  name: "verify-claim-economics-slice2",
  async run(ctx) {
    ctx.run("node", ["scripts/verify-claim-economics-slice2.mjs"]);
  },
};
