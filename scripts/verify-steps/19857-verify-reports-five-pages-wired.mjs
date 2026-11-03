export default {
  name: "verify:verify-reports-five-pages-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-reports-five-pages-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reports-five-pages-wired.mjs"]);
  },
};
