// 18431-verify-ensure-driver-vendor-links-or-refuses — LEAD 443.113 AJK-04.
// A same-name vendor is linked to the driver (driver_id set, non-frozen company) or refused with the vendor's name —
// never a silent "already_present". Runs the guard's --selftest and its real check.
export default {
  name: "verify-ensure-driver-vendor-links-or-refuses",
  run(ctx) {
    ctx.run("node", ["scripts/verify-ensure-driver-vendor-links-or-refuses.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-ensure-driver-vendor-links-or-refuses.mjs"]);
  },
};
