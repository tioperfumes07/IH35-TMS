export default {
  name: "verify:every-posting-has-a-source",
  run(ctx) {
    ctx.run("node", ["scripts/verify-every-posting-has-a-source.mjs"]);
  },
};
