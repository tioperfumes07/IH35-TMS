export default {
  name: "verify-pm-schedule-create-form",
  run(ctx) {
    // Literal path so verify:guard-wired sees verify-pm-schedule-create-form.mjs in the steps corpus
    if (ctx.run("node", ["scripts/verify-pm-schedule-create-form.mjs"]) !== 0) {
      throw new Error("verify:pm-schedule-create-form failed");
    }
  },
};
