import { createServerClient } from "@supabase/ssr";
import { getSupabasePublicEnv } from "@carver/db/client";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

function getInternalAdminIds() {
  return new Set(
    (process.env.CARVER_INTERNAL_ADMIN_USER_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
  );
}

/** Protects internal-only diagnostics without exposing a second identity system. */
export async function requireInternalAdminPage() {
  const adminIds = getInternalAdminIds();
  if (adminIds.size === 0) {
    notFound();
  }

  const cookieStore = await cookies();
  const { url, anonKey } = getSupabasePublicEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: () => {
        // These diagnostic pages only read the current session.
      },
    },
  });
  const { data } = await supabase.auth.getUser();

  if (!data.user || !adminIds.has(data.user.id)) {
    notFound();
  }
}
