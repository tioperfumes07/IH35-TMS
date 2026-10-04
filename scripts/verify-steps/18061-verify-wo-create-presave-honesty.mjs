export default {
  name: "verify:wo-create-presave-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-wo-create-presave-honesty.mjs"]);
  },
};
