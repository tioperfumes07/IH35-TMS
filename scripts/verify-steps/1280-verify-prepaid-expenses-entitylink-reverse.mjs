export default {
  name: "verify:prepaid-expenses-entitylink-reverse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-prepaid-expenses-entitylink-reverse.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-prepaid-expenses-entitylink-reverse.mjs"]);
  },
};
