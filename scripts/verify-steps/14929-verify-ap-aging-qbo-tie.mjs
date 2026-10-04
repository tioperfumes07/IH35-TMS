export default {
  name: "verify:ap-aging-qbo-tie",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ap-aging-qbo-tie.mjs"]);
  },
};
