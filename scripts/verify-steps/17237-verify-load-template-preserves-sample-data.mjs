export default {
  name: "verify:load-template-preserves-sample-data",
  run(ctx) {
    ctx.run("node", ["scripts/verify-load-template-preserves-sample-data.mjs"]);
  },
};
