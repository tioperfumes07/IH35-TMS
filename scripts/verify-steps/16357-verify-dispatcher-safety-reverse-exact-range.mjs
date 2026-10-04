export default {
  name: "verify:dispatcher-safety-reverse-exact-range",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatcher-safety-reverse-exact-range.mjs"]);
  },
};
