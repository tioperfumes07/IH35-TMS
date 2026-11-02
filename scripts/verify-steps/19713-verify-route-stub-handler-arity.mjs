export default {
  name: "verify:route-stub-handler-arity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-route-stub-handler-arity.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-route-stub-handler-arity.mjs"]);
  },
};
