export default {
  name: "verify:send-back-preserves-the-match-and-its-load",
  run(ctx) {
    ctx.run("node", ["scripts/verify-send-back-preserves-the-match-and-its-load.mjs"]);
  },
};
