/** Parses CORS_ALLOWED_ORIGINS (same default list as index CORS registration). */
export function getCorsAllowedOrigins(): string[] {
  return (
    process.env.CORS_ALLOWED_ORIGINS ??
    "https://ih35-tms-web.onrender.com,https://ih35-tms-driver.onrender.com,http://localhost:5173,http://localhost:5174"
  )
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}
