export default {
  name: "verify-create-multiple-bills-onerror",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-create-multiple-bills-onerror.mjs"]) !== 0) {
      return 1;
    }
    return ctx.run("node", ["scripts/verify-create-multiple-bills-onerror.mjs", "--selftest"]);
  },
};
