'use client';

import { useState, type SubmitEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase-browser';
import { ensureSignedInUser } from './actions';

type AuthMode = 'sign-in' | 'sign-up';

function titleFor(mode: AuthMode): string {
  switch (mode) {
    case 'sign-in':
      return 'Sign in';
    case 'sign-up':
      return 'Create account';
    default: {
      const unreachable: never = mode;
      return unreachable;
    }
  }
}

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setPending(true);

    const form = new FormData(event.currentTarget);
    const emailEntry = form.get('email');
    const passwordEntry = form.get('password');
    if (typeof emailEntry !== 'string' || typeof passwordEntry !== 'string') {
      setPending(false);
      setError('Enter an email and a password.');
      return;
    }
    const email = emailEntry;
    const password = passwordEntry;
    const supabase = createSupabaseBrowser();
    if (supabase === null) {
      setPending(false);
      setError('Sign-in is not configured on this site yet.');
      return;
    }

    const result =
      mode === 'sign-up'
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setPending(false);
      setError(result.error.message);
      return;
    }

    if (result.data.session === null) {
      setPending(false);
      setNotice('Check your email to finish creating the account, then sign in.');
      return;
    }

    const saved = await ensureSignedInUser();
    setPending(false);
    if (!saved.ok) {
      setError(saved.error);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <form
      className="auth-form"
      onSubmit={(event) => {
        void onSubmit(event);
      }}
    >
      <h1>{titleFor(mode)}</h1>
      <p className="lede">
        The website shows your scan history. The scan itself stays on the desktop app.
      </p>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Password
        <input
          name="password"
          type="password"
          autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
          required
          minLength={8}
        />
      </label>
      {error !== null ? <p className="auth-error">{error}</p> : null}
      {notice !== null ? <p className="auth-notice">{notice}</p> : null}
      <button type="submit" disabled={pending}>
        {pending ? 'Working…' : titleFor(mode)}
      </button>
    </form>
  );
}
