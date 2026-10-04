export default {
  name: "verify:predispatch-panel-mounted",
  run(ctx) {
    ctx.run("node", ["scripts/verify-predispatch-panel-mounted.mjs"]);
  },
};
