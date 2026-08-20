export default {
  name: "verify:dispatch-awaiting-trailer-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-awaiting-trailer-reverse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dispatch-awaiting-trailer-reverse.mjs"]);
  },
};
