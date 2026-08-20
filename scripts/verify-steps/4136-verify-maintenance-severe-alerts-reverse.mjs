export default {
  name: "verify:maintenance-severe-alerts-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-maintenance-severe-alerts-reverse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-maintenance-severe-alerts-reverse.mjs"]);
  },
};
