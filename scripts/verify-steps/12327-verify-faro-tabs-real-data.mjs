export default {
  name: "verify:faro-tabs-real-data",
  run(ctx) {
    ctx.run("node", ["scripts/verify-faro-tabs-real-data.mjs"]);
  },
};
