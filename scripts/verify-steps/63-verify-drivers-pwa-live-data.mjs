export default {
  name: "verify-drivers-pwa-live-data",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:drivers-pwa-live-data"]) !== 0) {
      throw new Error("verify-drivers-pwa-live-data failed");
    }
  },
};
