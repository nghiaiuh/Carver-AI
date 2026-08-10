import AuthForm from "../components/auth/AuthForm";
import AuthPageShell from "../components/auth/AuthPageShell";

type RegisterSearchParams = {
  next?: string;
};

function isPromiseLike<T>(value: Promise<T> | T | undefined): value is Promise<T> {
  return Boolean(value) && typeof (value as Promise<T>).then === "function";
}

export default async function RegisterPage({
  searchParams,
}: {
  searchParams?: Promise<RegisterSearchParams> | RegisterSearchParams;
}) {
  const resolvedSearchParams = isPromiseLike(searchParams) ? await searchParams : searchParams;
  const nextPath =
    typeof resolvedSearchParams?.next === "string" ? resolvedSearchParams.next : undefined;

  return (
    <AuthPageShell
      eyebrow="Workspace Signup"
      title="Create an account and keep every concept in one place."
      description="Use Carver AI as a real workspace: save projects, unlock the preset library, and continue from the same canvas context across sessions."
      footer={<span>Already have an account? Sign in and go straight back to your current workspace.</span>}
    >
      <AuthForm mode="register" nextPath={nextPath} />
    </AuthPageShell>
  );
}
