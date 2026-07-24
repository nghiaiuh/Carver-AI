const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "ASSET_GATEWAY_SIGNING_SECRET",
  "CARVER_ALLOWED_ORIGINS",
  "REDIS_URL",
  "CLOUDFLARE_R2_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET",
  "CLOUDFLARE_LANDING_R2_BUCKET",
];

const missing = required.filter((name) => !process.env[name]?.trim());
const errors = [];

if (missing.length > 0) {
  errors.push(`Missing required production variables: ${missing.join(", ")}`);
}

const signingSecret = process.env.ASSET_GATEWAY_SIGNING_SECRET?.trim() ?? "";
if (signingSecret && signingSecret.length < 32) {
  errors.push("ASSET_GATEWAY_SIGNING_SECRET must be at least 32 characters.");
}

const redisUrl = process.env.REDIS_URL?.trim();
if (redisUrl) {
  try {
    const parsed = new URL(redisUrl);
    if (parsed.protocol !== "rediss:" || !parsed.password) {
      errors.push("REDIS_URL must use authenticated rediss:// in production.");
    }
  } catch {
    errors.push("REDIS_URL is not a valid URL.");
  }
}

const allowedOrigins = (process.env.CARVER_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
if (allowedOrigins.some((origin) => !origin.startsWith("https://"))) {
  errors.push("CARVER_ALLOWED_ORIGINS may only contain exact https:// production origins.");
}

if (process.env.CLOUDFLARE_R2_BUCKET === process.env.CLOUDFLARE_LANDING_R2_BUCKET) {
  errors.push("User-owned R2 bucket and public landing bucket must be different.");
}

if (process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.trim()) {
  errors.push("CLOUDFLARE_R2_PUBLIC_BASE_URL must not be configured for private user assets.");
}

if (errors.length > 0) {
  console.error("Security environment preflight failed:");
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.info("Security environment preflight passed.");
}
