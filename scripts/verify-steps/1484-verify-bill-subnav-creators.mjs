export default {
  name: "verify-bill-subnav-creators",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-bill-subnav-creators.mjs"]) !== 0) return 1;
    return ctx.run("node", ["scripts/verify-bill-subnav-creators.mjs", "--selftest"]);
  },
};
