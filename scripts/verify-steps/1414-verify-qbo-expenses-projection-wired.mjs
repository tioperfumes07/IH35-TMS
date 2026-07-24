export default {
  name: "verify:qbo-expenses-projection-wired",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-expenses-projection-wired.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-qbo-expenses-projection-wired.mjs"]);
  },
};
