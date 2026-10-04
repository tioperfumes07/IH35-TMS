export default {
  name: "verify:book-load-driver-qualification-gate",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-load-driver-qualification-gate.mjs"]);
  },
};
