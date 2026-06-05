#!/usr/bin/env node
/**
 * CLOSURE-21 — Uptime monitor configuration (Better Uptime / UptimeRobot).
 * Emits monitor definitions; apply with BETTER_UPTIME_API_KEY or UPTIMEROBOT_API_KEY.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "uptime-monitor-config";

const API_BASE = process.env.API_BASE_URL?.trim() || "https://ih35-tms-api.onrender.com";
const APP_BASE = process.env.APP_BASE_URL?.trim() || "https://app.ih35dispatch.com";
const ALERT_EMAIL = process.env.UPTIME_ALERT_EMAIL?.trim() || "tioperfumes07@gmail.com";

export const MONITORS = [
  {
    name: "ih35-api-shallow-health",
    url: `${API_BASE.replace(/\/$/, "")}/api/v1/health`,
    interval_seconds: 60,
    alert_after_seconds: 120,
    regions: ["us", "eu"],
  },
  {
    name: "ih35-api-deep-health",
    url: `${API_BASE.replace(/\/$/, "")}/api/v1/health/deep`,
    interval_seconds: 300,
    alert_after_seconds: 120,
    regions: ["us"],
    expect_status: [200, 503],
  },
  {
    name: "ih35-office-spa",
    url: APP_BASE.replace(/\/$/, ""),
    interval_seconds: 300,
    alert_after_seconds: 120,
    regions: ["us", "eu"],
  },
];

function writeConfigArtifact() {
  const outDir = process.env.UPTIME_CONFIG_OUT_DIR || path.join(ROOT, ".tmp");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "uptime-monitors.generated.json");
  const payload = {
    generated_at: new Date().toISOString(),
    alert_email: ALERT_EMAIL,
    monitors: MONITORS,
  };
  fs.writeFileSync(outPath, `${JSON.stringify(payload, null, 2)}\n`);
  return outPath;
}

async function pushBetterUptime() {
  const key = process.env.BETTER_UPTIME_API_KEY?.trim();
  if (!key) return { pushed: false, reason: "BETTER_UPTIME_API_KEY not set" };
  let created = 0;
  for (const m of MONITORS) {
    const res = await fetch("https://betteruptime.com/api/v2/monitors", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          type: "monitor",
          attributes: {
            url: m.url,
            monitor_type: "status",
            check_frequency: m.interval_seconds,
            pronounceable_name: m.name,
            email: true,
          },
        },
      }),
    });
    if (res.ok) created += 1;
  }
  return { pushed: true, created };
}

function main() {
  const artifact = writeConfigArtifact();
  console.log(`[${LABEL}] Monitors defined: ${MONITORS.length}`);
  for (const m of MONITORS) {
    console.log(`  - ${m.name}: ${m.url} every ${m.interval_seconds}s → ${ALERT_EMAIL}`);
  }
  console.log(`[${LABEL}] Artifact: ${artifact}`);

  pushBetterUptime()
    .then((result) => {
      if (result.pushed) console.log(`[${LABEL}] Better Uptime push: created ${result.created ?? 0} monitors`);
      else console.log(`[${LABEL}] Skipped remote push (${result.reason})`);
    })
    .catch((err) => console.warn(`[${LABEL}] Remote push failed: ${err}`));
}

main();
