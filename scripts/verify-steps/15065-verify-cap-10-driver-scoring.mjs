export default {
  name: "verify:cap-10-driver-scoring",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cap-10-driver-scoring.mjs"]);
  },
};
