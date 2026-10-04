export default {
  name: "verify:reclassify-shows-every-coa-account-including-zero",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reclassify-shows-every-coa-account-including-zero.mjs"]);
  },
};
