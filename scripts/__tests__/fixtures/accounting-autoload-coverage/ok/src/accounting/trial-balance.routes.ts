export async function registerTrialBalanceRoutes(app) {
  app.get("/api/v1/accounting/trial-balance", async () => ({ ok: true }));
}
