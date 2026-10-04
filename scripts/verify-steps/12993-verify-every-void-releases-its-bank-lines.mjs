export default {
  name: "verify:every-void-releases-its-bank-lines",
  run(ctx) {
    ctx.run("node", ["scripts/verify-every-void-releases-its-bank-lines.mjs"]);
  },
};
