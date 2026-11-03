export default {
  name: "verify:coa-roles",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-roles.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-coa-roles.mjs"]);
  },
};
