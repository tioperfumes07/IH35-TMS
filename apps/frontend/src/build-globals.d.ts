// B-B — build-time constants injected by vite.config.ts `define` (frontend build-sha stamp).
// `__APP_VERSION__` = 7-char git sha (RENDER_GIT_COMMIT → GITHUB_SHA → "dev"), comparable to the
// backend healthz `version`. `__BUILD_TIME__` = ISO build timestamp.
declare const __APP_VERSION__: string;
declare const __BUILD_TIME__: string;
