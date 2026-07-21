export default {
  name: "verify:coa-roles-route-reachable",
  run(ctx) {
    const selftest = ctx.run("node", ["scripts/verify-coa-roles-route-reachable.mjs", "--selftest"]);
    if (selftest !== 0) {
      throw new Error("verify:coa-roles-route-reachable --selftest failed");
    }
    const check = ctx.run("node", ["scripts/verify-coa-roles-route-reachable.mjs"]);
    if (check !== 0) {
      throw new Error("verify:coa-roles-route-reachable failed");
    }
  },
};
