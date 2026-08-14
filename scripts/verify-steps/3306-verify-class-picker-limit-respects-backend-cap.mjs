export default {
  name: "verify:class-picker-limit-respects-backend-cap",
  run(ctx) {
    ctx.run("node", ["scripts/verify-class-picker-limit-respects-backend-cap.mjs"]);
  },
};
