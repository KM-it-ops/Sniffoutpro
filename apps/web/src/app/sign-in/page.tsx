import Link from 'next/link';
import { AuthForm } from '../auth/auth-form';

export default function SignInPage() {
  return (
    <main className="page">
      <AuthForm mode="sign-in" />
      <p>
        No account yet? <Link href="/sign-up">Create one</Link>
      </p>
    </main>
  );
}
