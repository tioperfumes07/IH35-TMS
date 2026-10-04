export default {
  name: "verify:factoring-forward-only-chrome",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-forward-only-chrome.mjs"]);
  },
};
