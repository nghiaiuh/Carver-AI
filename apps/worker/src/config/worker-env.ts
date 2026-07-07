const REQUIRED_WORKER_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENAI_API_KEY",
  "CLOUDFLARE_R2_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET",
] as const;

export function validateWorkerEnv() {
  const missing: string[] = REQUIRED_WORKER_ENV.filter((key) => !process.env[key]);
  const hasRedisConfig = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);

  if (!hasRedisConfig) {
    missing.push("REDIS_URL");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required worker environment variables: ${missing.join(", ")}`);
  }
}
