export default {
  name: "verify:verify-names-proper-case-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-names-proper-case-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-names-proper-case-wired.mjs"]);
  },
};
