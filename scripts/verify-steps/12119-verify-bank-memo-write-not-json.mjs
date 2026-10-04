export default {
  name: "verify:bank-memo-write-not-json",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-memo-write-not-json.mjs"]);
  },
};
