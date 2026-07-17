export default {
  name: "verify-insurance-units-assets-bridge",
  run(ctx) {
    // Literal path so verify:guard-wired sees verify-insurance-units-assets-bridge.mjs in the steps corpus
    if (ctx.run("node", ["scripts/verify-insurance-units-assets-bridge.mjs"]) !== 0) {
      throw new Error("verify:insurance-units-assets-bridge failed");
    }
  },
};
