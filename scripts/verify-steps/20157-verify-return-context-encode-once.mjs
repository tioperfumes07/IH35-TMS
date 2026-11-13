export default {
  name: "verify:return-context-encode-once",
  run(ctx) {
    ctx.run("node", ["scripts/verify-return-context-encode-once.mjs"]);
    ctx.run("node", ["scripts/verify-return-context-encode-once.mjs", "--selftest"]);
  },
};
