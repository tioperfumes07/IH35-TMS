export default {
  name: "verify:dispatch-trip-pairing-expenses-endpoint-404",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dispatch-trip-pairing-expenses-endpoint-404.mjs"]);
  },
};
