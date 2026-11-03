export default {
  name: "verify:verify-inputs-use-shared-height",
  run(ctx) {
    ctx.run("node", ["scripts/verify-inputs-use-shared-height.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-inputs-use-shared-height.mjs"]);
  },
};
