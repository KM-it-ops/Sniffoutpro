'use client';

import { useState, type SubmitEvent } from 'react';
import { trpc } from '@/components/providers';

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export function ReportDownloadForm() {
  const download = trpc.reports.download.useMutation();
  const saveClient = trpc.reports.clients.create.useMutation();
  const renameClient = trpc.reports.clients.update.useMutation();
  const saveTemplate = trpc.reports.templates.create.useMutation();
  const renameTemplate = trpc.reports.templates.update.useMutation();
  const clients = trpc.reports.clients.list.useQuery(undefined, { retry: false });
  const templates = trpc.reports.templates.list.useQuery(undefined, { retry: false });
  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);
  const [clientId, setClientId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [savedName, setSavedName] = useState<string | null>(null);
  const [savedTemplate, setSavedTemplate] = useState<string | null>(null);

  async function onSaveClient(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const name = form.get('clientName');
    if (typeof name !== 'string' || name.trim() === '') {
      setError('Enter a client name.');
      return;
    }
    try {
      const row = await saveClient.mutateAsync({ name: name.trim() });
      setClientId(row.id);
      setSavedName(row.name);
      await utils.reports.clients.list.invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The client could not be saved.');
    }
  }

  async function onRenameClient(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const name = form.get('renameClient');
    if (clientId === '') {
      setError('Save a client before renaming it.');
      return;
    }
    if (typeof name !== 'string' || name.trim() === '') {
      setError('Enter a new client name.');
      return;
    }
    try {
      const row = await renameClient.mutateAsync({ id: clientId, name: name.trim() });
      setSavedName(row.name);
      await utils.reports.clients.list.invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The client could not be renamed.');
    }
  }

  async function onSaveTemplate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const name = form.get('templateName');
    if (typeof name !== 'string' || name.trim() === '') {
      setError('Enter a template name.');
      return;
    }
    try {
      const row = await saveTemplate.mutateAsync({ name: name.trim() });
      setTemplateId(row.id);
      setSavedTemplate(row.name);
      await utils.reports.templates.list.invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The template could not be saved.');
    }
  }

  async function onRenameTemplate(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const name = form.get('renameTemplate');
    if (templateId === '') {
      setError('Save a template before renaming it.');
      return;
    }
    if (typeof name !== 'string' || name.trim() === '') {
      setError('Enter a new template name.');
      return;
    }
    try {
      const row = await renameTemplate.mutateAsync({ id: templateId, name: name.trim() });
      setSavedTemplate(row.name);
      await utils.reports.templates.list.invalidate();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The template could not be renamed.');
    }
  }

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const scanId = form.get('scanId');
    const chosenClientId = form.get('clientId');
    const logo = form.get('logo');
    if (typeof scanId !== 'string' || typeof chosenClientId !== 'string' || chosenClientId === '') {
      setError('Enter a scan and save a client first.');
      return;
    }
    const logoPngBase64 =
      logo instanceof File && logo.size > 0 ? await fileToBase64(logo) : undefined;

    try {
      const result = await download.mutateAsync({
        scanId,
        clientId: chosenClientId,
        ...(logoPngBase64 === undefined ? {} : { logoPngBase64 }),
        ...(templateId === '' ? {} : { templateId }),
      });
      const binary = atob(result.pdfBase64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
      }
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'sniffoutpro-report.pdf';
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The report could not be downloaded.');
    }
  }

  return (
    <>
      <form
        className="auth-form"
        onSubmit={(event) => {
          void onSaveClient(event);
        }}
      >
        <label>
          Client name
          <input name="clientName" required placeholder="Acme Security" />
        </label>
        <button type="submit" disabled={saveClient.isPending}>
          {saveClient.isPending ? 'Saving…' : 'Save client'}
        </button>
      </form>
      {savedName !== null ? <p>Saved {savedName}.</p> : null}
      <form
        className="auth-form"
        onSubmit={(event) => {
          void onRenameClient(event);
        }}
      >
        <label>
          New client name
          <input name="renameClient" required placeholder="Renamed client" />
        </label>
        <button type="submit" disabled={renameClient.isPending}>
          {renameClient.isPending ? 'Renaming…' : 'Rename client'}
        </button>
      </form>
      <form
        className="auth-form"
        onSubmit={(event) => {
          void onSaveTemplate(event);
        }}
      >
        <label>
          Template name
          <input name="templateName" required placeholder="Quarterly brief" />
        </label>
        <button type="submit" disabled={saveTemplate.isPending}>
          {saveTemplate.isPending ? 'Saving…' : 'Save template'}
        </button>
      </form>
      {savedTemplate !== null ? <p>Saved {savedTemplate}.</p> : null}
      <form
        className="auth-form"
        onSubmit={(event) => {
          void onRenameTemplate(event);
        }}
      >
        <label>
          New template name
          <input name="renameTemplate" required placeholder="Renamed brief" />
        </label>
        <button type="submit" disabled={renameTemplate.isPending}>
          {renameTemplate.isPending ? 'Renaming…' : 'Rename template'}
        </button>
      </form>
      <form
        className="auth-form"
        onSubmit={(event) => {
          void onSubmit(event);
        }}
      >
        <label>
          Scan
          <input name="scanId" required placeholder="Scan id" />
        </label>
        {clients.data !== undefined && clients.data.length > 0 ? (
          <label>
            Saved clients
            <select
              value={clients.data.some((client) => client.id === clientId) ? clientId : ''}
              onChange={(event) => {
                setClientId(event.target.value);
              }}
            >
              <option value="">Choose a client…</option>
              {clients.data.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Client
          <input
            name="clientId"
            required
            placeholder="Client id"
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
            }}
          />
        </label>
        {templates.data !== undefined && templates.data.length > 0 ? (
          <label>
            Report template
            <select
              value={
                templates.data.some((template) => template.id === templateId) ? templateId : ''
              }
              onChange={(event) => {
                setTemplateId(event.target.value);
              }}
            >
              <option value="">No template</option>
              {templates.data.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label>
          Logo
          <input name="logo" type="file" accept="image/png" />
        </label>
        <button type="submit" disabled={download.isPending}>
          {download.isPending ? 'Preparing…' : 'Download PDF'}
        </button>
      </form>
      {error !== null ? <p className="auth-error">{error}</p> : null}
    </>
  );
}
