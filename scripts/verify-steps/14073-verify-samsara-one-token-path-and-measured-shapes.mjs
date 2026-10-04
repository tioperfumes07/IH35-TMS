export default {
  name: "verify:samsara-one-token-path-and-measured-shapes",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-one-token-path-and-measured-shapes.mjs"]);
  },
};
