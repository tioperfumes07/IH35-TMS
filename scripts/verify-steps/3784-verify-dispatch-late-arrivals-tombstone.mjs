export default {
  name: "verify-dispatch-late-arrivals-tombstone",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-dispatch-late-arrivals-tombstone.mjs"]);
    // BANK-F91205 piggyback — DriverLateArrival / CustomerLateArrival / ArrivalPrompt leftover slate refuse
    await ctx.run("node", ["scripts/verify-late-arrival-prompt-slate-leftover-chrome.mjs"]);
  },
};
