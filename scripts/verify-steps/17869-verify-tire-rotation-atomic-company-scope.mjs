export default {
  name: "verify:tire-rotation-atomic-company-scope",
  run(ctx) {
    ctx.run("node", ["scripts/verify-tire-rotation-atomic-company-scope.mjs"]);
  },
};
