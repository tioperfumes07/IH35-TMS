export default {
  name: "verify-maintenance-damage-register-visible-label",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-maintenance-damage-register-visible-label.mjs"]) !== 0) {
      throw new Error("verify-maintenance-damage-register-visible-label failed");
    }
  },
};
