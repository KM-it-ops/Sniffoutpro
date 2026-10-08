'use client';

import { useState, type SubmitEvent } from 'react';
import { trpc } from '@/components/providers';

export function OrganizationForms() {
  const createOrg = trpc.organizations.create.useMutation();
  const invite = trpc.organizations.invite.useMutation();
  const [orgId, setOrgId] = useState('');
  const [orgName, setOrgName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invited, setInvited] = useState<string | null>(null);

  async function onCreate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const name = form.get('name');
    const slug = form.get('slug');
    if (
      typeof name !== 'string' ||
      typeof slug !== 'string' ||
      name.trim() === '' ||
      slug.trim() === ''
    ) {
      setError('Enter an organization name and a short slug.');
      return;
    }
    try {
      const org = await createOrg.mutateAsync({ name: name.trim(), slug: slug.trim() });
      setOrgId(org.id);
      setOrgName(org.name);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The organization could not be created.');
    }
  }

  async function onInvite(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInvited(null);
    const form = new FormData(event.currentTarget);
    const email = form.get('email');
    const role = form.get('role');
    if (typeof email !== 'string' || orgId === '') {
      setError('Create an organization, then enter the member email.');
      return;
    }
    if (role !== 'admin' && role !== 'analyst' && role !== 'viewer') {
      setError('Choose a role.');
      return;
    }
    try {
      const result = await invite.mutateAsync({ orgId, email, role });
      setInvited(
        result.updated
          ? `${email} is now ${result.role}.`
          : `${result.role} invite sent to ${email}.`,
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The invite could not be sent.');
    }
  }

  return (
    <>
      <form
        className="auth-form"
        onSubmit={(event) => {
          void onCreate(event);
        }}
      >
        <label>
          Organization name
          <input name="name" required placeholder="Acme Security" />
        </label>
        <label>
          Short name
          <input name="slug" required placeholder="acme-security" />
        </label>
        <button type="submit" disabled={createOrg.isPending}>
          {createOrg.isPending ? 'Saving…' : 'Create organization'}
        </button>
      </form>
      {orgName !== null ? <p>Created {orgName}.</p> : null}
      <form
        className="auth-form"
        onSubmit={(event) => {
          void onInvite(event);
        }}
      >
        <label>
          Organization
          <input
            name="orgId"
            required
            placeholder="Organization id"
            value={orgId}
            onChange={(event) => {
              setOrgId(event.target.value);
            }}
          />
        </label>
        <label>
          Member email
          <input name="email" type="email" required placeholder="analyst@example.com" />
        </label>
        <label>
          Role
          <select name="role" defaultValue="analyst">
            <option value="analyst">analyst</option>
            <option value="viewer">viewer</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <button type="submit" disabled={invite.isPending}>
          {invite.isPending ? 'Inviting…' : 'Invite member'}
        </button>
      </form>
      {invited !== null ? <p>{invited}</p> : null}
      {error !== null ? <p className="auth-error">{error}</p> : null}
    </>
  );
}
