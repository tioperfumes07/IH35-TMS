export default {
  name: "verify:coa-canonical",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-canonical.mjs"]);
  },
};
