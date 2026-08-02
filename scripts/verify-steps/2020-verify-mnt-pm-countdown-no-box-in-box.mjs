// Maintenance PM Countdown — non-compact chrome must stay flat (verify-step 2020, Cursor EVEN band).
export default {
  name: "mnt-pm-countdown-no-box-in-box",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-mnt-pm-countdown-no-box-in-box.mjs"]);
  },
};
