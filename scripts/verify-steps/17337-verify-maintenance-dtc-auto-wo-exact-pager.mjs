export default {
  name: "verify:maintenance-dtc-auto-wo-exact-pager",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-dtc-auto-wo-exact-pager.mjs"]);
  },
};
