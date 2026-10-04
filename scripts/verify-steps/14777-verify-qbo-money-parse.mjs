export default {
  name: "verify:qbo-money-parse",
  run(ctx) {
    ctx.run("node", ["scripts/verify-qbo-money-parse.mjs"]);
  },
};
