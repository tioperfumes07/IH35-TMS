export default {
  name: "verify:safety-money-chrome",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-money-chrome.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-safety-money-chrome.mjs"]);
  },
};
