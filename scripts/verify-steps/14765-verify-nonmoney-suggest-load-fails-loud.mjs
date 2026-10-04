export default {
  name: "verify:nonmoney-suggest-load-fails-loud",
  run(ctx) {
    ctx.run("node", ["scripts/verify-nonmoney-suggest-load-fails-loud.mjs"]);
  },
};
