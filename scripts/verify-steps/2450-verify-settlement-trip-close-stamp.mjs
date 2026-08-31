export default {
  name: "verify-settlement-trip-close-stamp",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-settlement-trip-close-stamp.mjs"]);
  },
};
