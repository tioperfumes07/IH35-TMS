export default {
  name: "verify:truck-line-surface-tokens-locked",
  run(ctx) {
    ctx.run("node", ["scripts/verify-truck-line-surface-tokens-locked.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-truck-line-surface-tokens-locked.mjs"]);
  },
};
