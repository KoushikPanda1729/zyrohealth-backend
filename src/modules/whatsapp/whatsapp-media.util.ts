// Downloads inbound WhatsApp media (Twilio's MediaUrl0 / Meta's media-id
// two-step lookup) and re-uploads it into our own storage, since neither
// provider's media URL is a durable, publicly-shareable link on its own
// (Twilio's requires your account credentials on every request; Meta's
// expires quickly). Mirrors the existing doctor-document upload pattern
// (admin.service.ts) — download bytes, `storage.upload(key, buffer, mimeType)`.

export async function downloadTwilioMedia(
  mediaUrl: string,
  accountSid: string,
  authToken: string,
): Promise<Buffer> {
  const res = await fetch(mediaUrl, {
    headers: {
      Authorization:
        'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64'),
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to download Twilio media: HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export async function downloadMetaMedia(
  mediaId: string,
  accessToken: string,
  apiVersion: string,
): Promise<{ buffer: Buffer; mimeType: string }> {
  const lookupRes = await fetch(
    `https://graph.facebook.com/${apiVersion}/${mediaId}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!lookupRes.ok) {
    throw new Error(
      `Failed to resolve Meta media URL: HTTP ${lookupRes.status}`,
    );
  }
  const meta = (await lookupRes.json()) as { url: string; mime_type: string };

  const fileRes = await fetch(meta.url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!fileRes.ok) {
    throw new Error(`Failed to download Meta media: HTTP ${fileRes.status}`);
  }
  return {
    buffer: Buffer.from(await fileRes.arrayBuffer()),
    mimeType: meta.mime_type,
  };
}

// Gupshup's inbound image payload carries a direct `url` for the media
// (payload.payload.url) rather than Twilio/Meta's auth-then-fetch dance —
// this still passes the account's apikey header since Gupshup media links
// are typically account-scoped. Unverified against a live Gupshup account;
// adjust if a real payload shows otherwise.
export async function downloadGupshupMedia(
  mediaUrl: string,
  apiKey: string,
): Promise<Buffer> {
  const res = await fetch(mediaUrl, { headers: { apikey: apiKey } });
  if (!res.ok) {
    throw new Error(`Failed to download Gupshup media: HTTP ${res.status}`);
  }
  return Buffer.from(await res.arrayBuffer());
}

export function mediaStorageKey(tenantId: string, mimeType: string): string {
  const ext = mimeType.split('/')[1]?.split(';')[0] ?? 'bin';
  return `whatsapp-media/${tenantId}/${Date.now()}.${ext}`;
}
