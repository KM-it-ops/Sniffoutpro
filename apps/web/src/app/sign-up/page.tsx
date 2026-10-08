import Link from 'next/link';
import { AuthForm } from '../auth/auth-form';

export default function SignUpPage() {
  return (
    <main className="page">
      <AuthForm mode="sign-up" />
      <p>
        Already have an account? <Link href="/sign-in">Sign in</Link>
      </p>
    </main>
  );
}
