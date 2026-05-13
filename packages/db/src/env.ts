type EnvSource = Record<string, string | undefined>;

const readRequired = (env: EnvSource, key: string): string => {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

export const getSupabasePublicEnv = (env: EnvSource = process.env) => ({
  url: readRequired(env, "NEXT_PUBLIC_SUPABASE_URL"),
  anonKey: readRequired(env, "NEXT_PUBLIC_SUPABASE_ANON_KEY"),
});

export const getSupabaseServerEnv = (env: EnvSource = process.env) => ({
  ...getSupabasePublicEnv(env),
  serviceRoleKey: readRequired(env, "SUPABASE_SERVICE_ROLE_KEY"),
});
