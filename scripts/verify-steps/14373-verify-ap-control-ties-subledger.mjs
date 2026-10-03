export default {
  name: "verify:ap-control-ties-subledger",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ap-control-ties-subledger.mjs"]);
  },
};
