export default {
  name: "verify:voided-loads-hold-no-real-number",
  run(ctx) {
    ctx.run("node", ["scripts/verify-voided-loads-hold-no-real-number.mjs"]);
  },
};
