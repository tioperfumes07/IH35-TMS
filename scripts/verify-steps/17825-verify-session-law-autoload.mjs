export default {
  name: "verify:session-law-autoload",
  run(ctx) {
    ctx.run("node", ["scripts/verify-session-law-autoload.mjs"]);
  },
};
