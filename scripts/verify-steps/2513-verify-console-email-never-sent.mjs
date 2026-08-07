// LV-010 — a console-only email must never be recorded as delivered mail
// (verify-step 2513 · CC-1 lane = n%4==1 · Claude ODD band).
export default {
  name: "console-email-never-sent",
  run(ctx) {
    ctx.run("node", ["scripts/verify-console-email-never-sent.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-console-email-never-sent.mjs"]);
  },
};
