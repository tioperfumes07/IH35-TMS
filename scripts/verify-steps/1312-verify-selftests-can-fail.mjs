export default {
  name: "verify-selftests-can-fail",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-selftests-can-fail.mjs"]);
  },
};
