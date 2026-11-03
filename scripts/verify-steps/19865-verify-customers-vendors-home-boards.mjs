export default {
  name: "verify:verify-customers-vendors-home-boards",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customers-vendors-home-boards.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-customers-vendors-home-boards.mjs"]);
  },
};
