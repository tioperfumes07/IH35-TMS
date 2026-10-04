export default {
  name: "verify:cap-9-pairing",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cap-9-pairing.mjs"]);
  },
};
