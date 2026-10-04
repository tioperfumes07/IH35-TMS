export default {
  name: "verify:vendors-type-catalog-read-recovery",
  run(ctx) {
    ctx.run("node", ["scripts/verify-vendors-type-catalog-read-recovery.mjs"]);
  },
};
