export default {
  name: "verify-drivers-onboarding-wizard",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:drivers-onboarding-wizard"]) !== 0) {
      throw new Error("verify-drivers-onboarding-wizard failed");
    }
  },
};
