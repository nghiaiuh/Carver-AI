import AuthForm from "../components/auth/AuthForm";
import AuthPageShell from "../components/auth/AuthPageShell";

type LoginSearchParams = {
  next?: string;
};

function isPromiseLike<T>(value: Promise<T> | T | undefined): value is Promise<T> {
  return Boolean(value) && typeof (value as Promise<T>).then === "function";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<LoginSearchParams> | LoginSearchParams;
}) {
  const resolvedSearchParams = isPromiseLike(searchParams) ? await searchParams : searchParams;
  const nextPath =
    typeof resolvedSearchParams?.next === "string" ? resolvedSearchParams.next : undefined;

  return (
    <AuthPageShell
      eyebrow="Design Login"
      title="Sign in before you continue shaping the landscape."
      description="Carver AI keeps your projects, preset references, and canvas workflows tied to your own workspace, so you can return to the same design context without losing control."
      footer={<span>New to Carver AI? Create an account with Google or email to start saving projects.</span>}
    >
      <AuthForm mode="login" nextPath={nextPath} />
    </AuthPageShell>
  );
}
