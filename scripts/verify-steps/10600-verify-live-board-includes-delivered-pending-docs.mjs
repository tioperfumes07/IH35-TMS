// LOADBOARD-LIFECYCLE (owner 2026-09-09: "the second a load is closed, it should disappear from the
// load board … delivered waiting docs … STAYS in the load board until we change the status"). A load
// stays LIVE through its whole lifecycle and leaves only when closed/cancelled/abandoned. This pins:
// (a) delivered_pending_docs NOT in CLOSED_LOAD_STATUSES (stays live), (b) Awaiting active set still
// excludes it (free truck shows once, no dup), (c) DispatchBoard routes it to the load-centric billing
// band (not the in-flight Booked band). Supersedes the 2026-09-06 DSP-BAND-DUP/GAP framing.
// Claimed number 10600 (cursor EVEN lane, Rule 25/37).
export default {
  name: "verify-live-board-includes-delivered-pending-docs",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-live-board-includes-delivered-pending-docs.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-live-board-includes-delivered-pending-docs.mjs"]);
  },
};
