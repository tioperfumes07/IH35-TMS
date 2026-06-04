export default {
  name: "verify-drivers-document-expiry-alerts",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:drivers-document-expiry-alerts"]) !== 0) {
      throw new Error("verify-drivers-document-expiry-alerts failed");
    }
  },
};
