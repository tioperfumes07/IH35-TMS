export default {
  name: "verify:one-source-per-number",
  run(ctx) {
    ctx.run("node", ["scripts/verify-one-source-per-number.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-one-source-per-number.mjs"]);
  },
};
