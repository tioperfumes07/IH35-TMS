export default {
  name: "verify:coa-asymmetry-readonly",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-asymmetry-readonly.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-coa-asymmetry-readonly.mjs"]);
  },
};
