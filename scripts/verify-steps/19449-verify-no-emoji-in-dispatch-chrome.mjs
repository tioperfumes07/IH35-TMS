export default {
  name: "verify:no-emoji-in-dispatch-chrome",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-emoji-in-dispatch-chrome.mjs"]);
  },
};
