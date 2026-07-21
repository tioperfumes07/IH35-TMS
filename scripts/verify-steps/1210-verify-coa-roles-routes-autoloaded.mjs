export default {
  name: "verify:coa-roles-routes-autoloaded",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-roles-routes-mounted.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-coa-roles-routes-mounted.mjs"]);
  },
};
