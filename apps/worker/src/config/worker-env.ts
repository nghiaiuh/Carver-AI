const REQUIRED_WORKER_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLOUDFLARE_R2_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET",
] as const;

export type WorkerRole = "all" | "generation" | "maintenance";

export function getWorkerRole(value = process.env.WORKER_ROLE): WorkerRole {
  if (!value || value === "all") return "all";
  if (value === "generation" || value === "maintenance") return value;
  throw new Error("WORKER_ROLE must be one of: all, generation, maintenance.");
}

export function validateWorkerEnv(params: { role?: WorkerRole } = {}) {
  const role = params.role ?? getWorkerRole();
  const missing: string[] = REQUIRED_WORKER_ENV.filter((key) => !process.env[key]);
  const hasRedisConfig = Boolean(process.env.REDIS_URL || process.env.REDIS_HOST);

  if ((role === "all" || role === "generation") && !process.env.OPENAI_API_KEY) {
    missing.push("OPENAI_API_KEY");
  }

  if (!hasRedisConfig) {
    missing.push("REDIS_URL");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required worker environment variables: ${missing.join(", ")}`);
  }
}
