export default {
  name: "verify:driver-qualification-create-shared",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-qualification-create-shared.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-driver-qualification-create-shared.mjs"]);
  },
};
