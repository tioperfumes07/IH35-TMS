export default {
  name: "verify-maintenance-leaf-back-buttons-wired",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-maintenance-leaf-back-buttons-wired.mjs"]) !== 0) {
      throw new Error("verify-maintenance-leaf-back-buttons-wired failed");
    }
  },
};
