'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowser } from '@/lib/supabase-browser';

export function SignOutButton() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    const supabase = createSupabaseBrowser();
    if (supabase === null) {
      setError('Sign-in is not configured on this site yet.');
      return;
    }
    const { error: signOutError } = await supabase.auth.signOut();
    if (signOutError) {
      setError(signOutError.message);
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          void onClick();
        }}
      >
        Sign out
      </button>
      {error !== null ? <p className="auth-error">{error}</p> : null}
    </>
  );
}
