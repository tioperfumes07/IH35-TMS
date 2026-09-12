export default {
  name: "verify:dispatch-truck-line",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-truck-line.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-truck-line.mjs"]);
  },
};
