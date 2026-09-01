export default {
  name: "verify:safety-entitylink-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-safety-entitylink-reverse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-internal-fines-detail-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-safety-internal-fines-detail-chrome.mjs"]);
    return ctx.run("node", ["scripts/verify-safety-entitylink-reverse.mjs"]);
  },
};
