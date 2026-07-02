import AuthForm from "../components/auth/AuthForm";
import AuthPageShell from "../components/auth/AuthPageShell";

export default function RegisterPage() {
  return (
    <AuthPageShell
      eyebrow="Workspace Signup"
      title="Create an account and keep every concept in one place."
      description="Use Carver AI as a real workspace: save projects, unlock the preset library, and continue from the same canvas context across sessions."
      footer={<span>Already have an account? Sign in and go straight back to your current workspace.</span>}
    >
      <AuthForm mode="register" />
    </AuthPageShell>
  );
}
