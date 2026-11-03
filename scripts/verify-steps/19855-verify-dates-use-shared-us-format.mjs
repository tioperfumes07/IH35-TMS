export default {
  name: "verify:verify-dates-use-shared-us-format",
  run(ctx) {
    ctx.run("node", ["scripts/verify-dates-use-shared-us-format.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-dates-use-shared-us-format.mjs"]);
  },
};
