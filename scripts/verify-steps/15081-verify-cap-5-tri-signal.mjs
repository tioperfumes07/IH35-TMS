export default {
  name: "verify:cap-5-tri-signal",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cap-5-tri-signal.mjs"]);
  },
};
