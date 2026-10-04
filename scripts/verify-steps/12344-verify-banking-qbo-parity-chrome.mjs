export default {
  name: "verify:banking-qbo-parity-chrome",
  run(ctx) {
    ctx.run("node", ["scripts/verify-banking-qbo-parity-chrome.mjs"]);
  },
};
