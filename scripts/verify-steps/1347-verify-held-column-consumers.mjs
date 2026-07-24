export default {
  name: "verify:held-column-consumers",
  run(ctx) {
    ctx.run("node", ["scripts/verify-held-column-consumers.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-held-column-consumers.mjs"]);
  },
};
