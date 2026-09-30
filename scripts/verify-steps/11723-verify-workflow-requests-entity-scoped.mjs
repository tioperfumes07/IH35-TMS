export default {
  name: "verify:workflow-requests-entity-scoped",
  run(ctx) {
    ctx.run("node", ["scripts/verify-workflow-requests-entity-scoped.mjs", "--selftest"]);
    // X-16: behavior runs on CI's isolated Postgres, metadata in required-live-load-guard.
    if (process.env.GITHUB_ACTIONS === "true") {
      return ctx.run("node", ["scripts/verify-workflow-requests-entity-scoped.mjs", "--isolated"], {
        env: { ...process.env, WORKFLOW_RLS_TEST_DATABASE_URL: ctx.VERIFY_DB_URL },
      });
    }
    console.log("workflow RLS: database assertions required in CI; no local database verdict");
  },
};
