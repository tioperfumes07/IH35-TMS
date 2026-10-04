export default {
  name: "verify:samsara-addresses-count-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-samsara-addresses-count-wired.mjs"]);
  },
};
