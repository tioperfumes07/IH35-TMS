export default {
  name: "verify:void-reversal-payload-subject-type-normalization",
  run(ctx) {
    ctx.run("node", ["scripts/verify-void-reversal-payload-subject-type-normalization.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-void-reversal-payload-subject-type-normalization.mjs"]);
  },
};
