const LOGO_PATH =
  /^\/storage\/v1\/object\/public\/report-logos\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i;

export function publicReportLogoUrl(supabaseUrl: string, clientId: string): string {
  const base = supabaseUrl.replace(/\/$/, '');
  return `${base}/storage/v1/object/public/report-logos/${clientId}.png`;
}

export function isStoredReportLogoUrl(logoUrl: string, supabaseUrl: string): boolean {
  let logo: URL;
  let base: URL;
  try {
    logo = new URL(logoUrl);
    base = new URL(supabaseUrl);
  } catch {
    return false;
  }
  return (
    logo.origin === base.origin && logo.protocol === base.protocol && LOGO_PATH.test(logo.pathname)
  );
}

export async function loadStoredReportLogo(
  logoUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Uint8Array | undefined> {
  const supabaseUrl = process.env['SUPABASE_URL'];
  if (
    supabaseUrl === undefined ||
    supabaseUrl === '' ||
    !isStoredReportLogoUrl(logoUrl, supabaseUrl)
  ) {
    return undefined;
  }
  try {
    const response = await fetchImpl(logoUrl);
    if (!response.ok) {
      return undefined;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return undefined;
  }
}

export async function storeReportLogo(
  bytes: Uint8Array,
  objectName: string,
): Promise<string | null> {
  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (url === undefined || url === '' || key === undefined || key === '') {
    return null;
  }

  const response = await fetch(
    `${url.replace(/\/$/, '')}/storage/v1/object/report-logos/${objectName}.png`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'image/png',
        'x-upsert': 'true',
      },
      body: bytes,
    },
  );
  if (!response.ok) {
    return null;
  }
  return publicReportLogoUrl(url, objectName);
}
