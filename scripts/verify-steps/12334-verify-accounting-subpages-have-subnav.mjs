export default {
  name: "verify:accounting-subpages-have-subnav",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-subpages-have-subnav.mjs"]);
  },
};
