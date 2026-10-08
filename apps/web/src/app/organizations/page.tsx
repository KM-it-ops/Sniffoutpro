import Link from 'next/link';
import { OrganizationForms } from './organization-forms';

export default function OrganizationsPage() {
  return (
    <main className="page">
      <h1>Organizations</h1>
      <p className="lede">
        An admin can create an organization and invite a member. Each organization sees only its own
        scans. The website does not scan a network.
      </p>
      <OrganizationForms />
      <p>
        <Link href="/sign-in">Sign in</Link>
      </p>
    </main>
  );
}
