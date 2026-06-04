export default {
  name: "verify-drivers-application-portal",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:drivers-application-portal"]) !== 0) {
      throw new Error("verify-drivers-application-portal failed");
    }
  },
};
