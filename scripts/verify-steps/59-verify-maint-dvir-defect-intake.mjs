export default {
  name: "verify-maint-dvir-defect-intake",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:maint-dvir-defect-intake"]) !== 0) {
      throw new Error("verify:maint-dvir-defect-intake failed");
    }
  },
};
