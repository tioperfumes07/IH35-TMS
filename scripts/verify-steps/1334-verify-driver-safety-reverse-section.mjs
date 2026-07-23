export default {
  name: "verify:driver-safety-reverse-section",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-safety-reverse-section.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-driver-safety-reverse-section.mjs"]);
  },
};
