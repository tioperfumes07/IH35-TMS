export default {
  name: "verify:settlement-fe-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-fe-honesty.mjs"]);
  },
};
