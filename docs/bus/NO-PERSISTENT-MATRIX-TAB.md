# NO PERSISTENT MATRIX / APP POLL TABS
**Owner 2026-08-20 22:38 CT · HARD · after prod starve**

Agent Chromes on 9222–9228 left `/program/matrix` (and other app tabs) polling every 3s in the background. That was **~10–71 req/s × 223 KB** from this Mac and put the API into a health-check restart loop. Not Render OOM. Not git.

**Forbidden**
- Leaving `/program/matrix` open (reload restarts the old JS poll until the tab is **closed**)
- Unattended Live Chrome on `app.ih35dispatch.com` after the click is done
- `refetchIntervalInBackground` live-verify sessions

**Required**
- Click **one** leaf URL → prove → **close the tab** (not reload)
- Matrix glance: open, screenshot/read, **close within the same turn**
- After #13335, still close old tabs; new poll is 30s only after a **fresh** load

Live Chrome stays required. Persistent matrix tabs are a production incident.
