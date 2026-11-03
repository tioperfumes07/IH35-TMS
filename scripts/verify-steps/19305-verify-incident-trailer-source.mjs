export default {
  name: "verify:incident-trailer-source",
  run(ctx) {
    ctx.run("node", ["scripts/verify-incident-trailer-source.mjs"]);
  },
};
