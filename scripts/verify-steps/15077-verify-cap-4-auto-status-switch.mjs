export default {
  name: "verify:cap-4-auto-status-switch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cap-4-auto-status-switch.mjs"]);
  },
};
