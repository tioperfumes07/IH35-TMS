export default {
  name: "verify-pm-schedule-create-form",
  run(ctx) {
    if (ctx.run("npm", ["run", "verify:pm-schedule-create-form"]) !== 0) {
      throw new Error("verify:pm-schedule-create-form failed");
    }
  },
};
