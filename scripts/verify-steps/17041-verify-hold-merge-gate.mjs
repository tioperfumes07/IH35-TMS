export default {
  name: "verify:hold-merge-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-hold-merge-gate.mjs"]);
  },
};
