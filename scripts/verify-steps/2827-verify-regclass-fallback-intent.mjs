export default {
  name: "verify:regclass-fallback-intent",
  run(ctx) {
    ctx.run("node", ["scripts/verify-regclass-fallback-intent.mjs"]);
  },
};
