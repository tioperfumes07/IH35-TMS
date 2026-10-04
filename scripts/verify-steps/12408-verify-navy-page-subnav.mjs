export default {
  name: "verify:navy-page-subnav",
  run(ctx) {
    ctx.run("node", ["scripts/verify-navy-page-subnav.mjs"]);
  },
};
