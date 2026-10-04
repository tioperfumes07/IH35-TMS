export default {
  name: "verify:complaints-driver-names",
  run(ctx) {
    ctx.run("node", ["scripts/verify-complaints-driver-names.mjs"]);
  },
};
