export default {
  name: "verify:coa-create-account-type-enum-conversion",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-create-account-type-enum-conversion.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-coa-create-account-type-enum-conversion.mjs"]);
  },
};
