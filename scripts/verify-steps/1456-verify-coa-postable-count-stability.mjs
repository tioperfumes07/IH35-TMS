export default {
  name: "verify:coa-postable-count-stability",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coa-postable-count-stability.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-coa-postable-count-stability.mjs"]);
  },
};
