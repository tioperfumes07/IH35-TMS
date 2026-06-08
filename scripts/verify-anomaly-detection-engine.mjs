#!/usr/bin/env node
import fs from "node:fs";
const failures = [];
const read = (p) => { if (!fs.existsSync(p)) { failures.push(`MISSING ${p}`); return ""; } return fs.readFileSync(p, "utf8"); };
const must = (p, pat, label) => { if (!pat.test(read(p))) failures.push(`${p}: ${label}`); };

must("db/migrations/202606080211_anomaly_alert_rules.sql", /anomaly_alert_rules/, "migration tables");
must("apps/backend/src/safety/anomaly/seed-default-rules.ts", /DEFAULT_ANOMALY_RULES/, "6 default rules");
read("apps/backend/src/safety/anomaly/seed-default-rules.ts").match(/rule_slug/g)?.length >= 6 || failures.push("need 6 default rules");
must("apps/backend/src/jobs/anomaly-detector-worker.ts", /initializeAnomalyDetectorWorker/, "worker");
must("apps/backend/src/safety/anomaly/routes.ts", /registerAnomalyDetectionRoutes/, "routes");
must("apps/backend/src/index.ts", /registerAnomalyDetectionRoutes|initializeAnomalyDetectorWorker/, "index wiring");
must("apps/frontend/src/pages/safety/anomaly/AnomalyDashboard.tsx", /anomaly-dashboard/, "dashboard");
must("apps/frontend/src/components/safety/AnomalyAlertBadge.tsx", /AnomalyAlertBadge/, "badge");
read(".block-ready/GAP-46.json");

if (failures.length) { console.error("GAP-46 verify FAILED", failures); process.exit(1); }
console.log("verify:anomaly-detection-engine — OK");
