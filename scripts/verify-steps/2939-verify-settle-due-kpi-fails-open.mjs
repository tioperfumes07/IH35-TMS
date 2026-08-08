export default {
  name: "verify:settle-due-kpi-fails-open",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settle-due-kpi-fails-open.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settle-due-kpi-fails-open.mjs"]);
  },
};
