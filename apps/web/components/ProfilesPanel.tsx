import "server-only";

type Profile = {
  id: string;
  display_name: string | null;
  plan_type: "free" | "premium";
  credits_amount: number;
  created_at: string;
  updated_at: string;
};

const formatDate = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
};

const loadProfiles = async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return {
      profiles: [] as Profile[],
      error: "Missing Supabase environment variables.",
    };
  }

  const endpoint = new URL("/rest/v1/profiles", url);
  endpoint.searchParams.set(
    "select",
    "id,display_name,plan_type,credits_amount,created_at,updated_at"
  );
  endpoint.searchParams.set("order", "created_at.desc");
  endpoint.searchParams.set("limit", "10");

  const response = await fetch(endpoint.toString(), {
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    return {
      profiles: [] as Profile[],
      error: `Supabase REST error (${response.status}).`,
    };
  }

  const profiles = (await response.json()) as Profile[];
  return { profiles, error: null as string | null };
};

export default async function ProfilesPanel() {
  const { profiles, error } = await loadProfiles();

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-8">
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-slate-100">Profile</h2>
        <p className="text-sm text-slate-400">
          Data loaded from the Supabase REST API on the server.
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/40 p-6 text-sm text-slate-300">
        {error ? <p>{error}</p> : null}
        {!error && profiles.length === 0 ? <p>No profiles found.</p> : null}
        {!error && profiles.length > 0 ? (
          <div className="space-y-4">
            {profiles.map((profile) => (
              <div
                key={profile.id}
                className="grid gap-3 border-b border-slate-800 pb-4 last:border-b-0 last:pb-0 sm:grid-cols-2"
              >
                <div>
                  <span className="text-slate-500">User ID</span>
                  <div className="mt-1 text-xs text-slate-200">
                    {profile.id}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Display name</span>
                  <div className="mt-1 text-slate-200">
                    {profile.display_name ?? "(empty)"}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Plan</span>
                  <div className="mt-1 text-slate-200">
                    {profile.plan_type}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Credits</span>
                  <div className="mt-1 text-slate-200">
                    {profile.credits_amount}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Created</span>
                  <div className="mt-1 text-slate-200">
                    {formatDate(profile.created_at)}
                  </div>
                </div>
                <div>
                  <span className="text-slate-500">Updated</span>
                  <div className="mt-1 text-slate-200">
                    {formatDate(profile.updated_at)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
