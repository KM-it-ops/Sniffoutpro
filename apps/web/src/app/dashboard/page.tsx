import Link from 'next/link';
import { DashboardClient } from '../../components/dashboard-client';
import { createSupabaseServer } from '@/lib/supabase-server';

export default async function DashboardPage() {
  const supabase = await createSupabaseServer();
  const user = supabase === null ? null : (await supabase.auth.getUser()).data.user;
  if (user == null) {
    return (
      <main className="page">
        <h1>Scan dashboard</h1>
        <p>Sign in to see scan history.</p>
        <p>
          <Link href="/sign-in">Sign in</Link>
        </p>
      </main>
    );
  }

  return <DashboardClient />;
}
