const { execSync } = require('child_process');
const fs = require('fs');
const LOG = '/tmp/devin-a-watcher.log';
function log(line) {
  const t = new Date().toISOString();
  fs.appendFileSync(LOG, `${t} ${line}\n`);
  console.log(`${t} ${line}`);
}
function tick() {
  try {
    const raw = execSync('curl -sS https://api.ih35dispatch.com/api/v1/healthz/shallow', { encoding: 'utf8', timeout: 15000 });
    const j = JSON.parse(raw);
    log(`healthz ok version=${j.version} uptime=${j.uptime_seconds}`);
  } catch (e) {
    log(`healthz FAIL: ${e.message}`);
  }
}
tick();
setInterval(tick, 60000);
