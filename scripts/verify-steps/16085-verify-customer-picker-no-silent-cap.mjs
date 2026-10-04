export default {
  name: "verify:customer-picker-no-silent-cap",
  run(ctx) {
    ctx.run("node", ["scripts/verify-customer-picker-no-silent-cap.mjs"]);
  },
};
