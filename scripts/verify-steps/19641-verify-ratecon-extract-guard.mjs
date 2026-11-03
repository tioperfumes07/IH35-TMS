export default {
  name: "verify:ratecon-extract-guard",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ratecon-extract-guard.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ratecon-extract-guard.mjs"]);
  },
};
