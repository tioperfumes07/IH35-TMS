export default {
  name: "verify:driver-qualification-gate-shared",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-qualification-gate-shared.mjs"]);
  },
};
