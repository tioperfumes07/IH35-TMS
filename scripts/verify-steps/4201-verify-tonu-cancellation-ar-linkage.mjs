export default {
  name: "verify:tonu-cancellation-ar-linkage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tonu-cancellation-ar-linkage.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-tonu-cancellation-ar-linkage.mjs"]);
  },
};
