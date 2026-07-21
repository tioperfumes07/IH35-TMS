export default {
  name: "verify:coa-roles-routes-mounted",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-roles-routes-mounted.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-coa-roles-routes-mounted.mjs"]);
  },
};
