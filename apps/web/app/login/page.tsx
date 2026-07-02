import AuthForm from "../components/auth/AuthForm";
import AuthPageShell from "../components/auth/AuthPageShell";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = typeof searchParams?.next === "string" ? searchParams.next : undefined;

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
