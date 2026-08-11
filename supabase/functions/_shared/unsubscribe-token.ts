function base64url(buf: ArrayBuffer | Uint8Array): string {
  const u8 = buf instanceof ArrayBuffer
    ? new Uint8Array(buf)
    : buf;
  const b64 = btoa(String.fromCharCode(...u8));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array | null {
  let b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = 4 - (b64.length % 4);
  if (pad !== 4) b64 += "=".repeat(pad);
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export async function signMunicipalityId(
  municipalityId: string,
  secret: string,
): Promise<string> {
  const enc = new TextEncoder();
  const msg = concatBytes(
    enc.encode(municipalityId),
    new Uint8Array([0]),
    enc.encode("muni-email-pref-v1"),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, msg);
  return base64url(sig);
}

export async function makeUnsubscribeToken(
  municipalityId: string,
  secret: string,
): Promise<string> {
  const sig = await signMunicipalityId(municipalityId, secret);
  const payload = `${municipalityId}:${sig}`;
  return base64url(new TextEncoder().encode(payload));
}

/**
 * @returns municipality id on success, null on invalid
 */
export async function parseUnsubscribeToken(
  token: string,
  secret: string,
): Promise<string | null> {
  if (!token || typeof token !== "string") return null;
  const raw = b64urlToBytes(token);
  if (!raw) return null;
  const decoded = new TextDecoder().decode(raw);
  const idx = decoded.indexOf(":");
  if (idx <= 0) return null;
  const municipalityId = decoded.slice(0, idx);
  const sig = decoded.slice(idx + 1);
  if (!/^[0-9a-f-]{36}$/i.test(municipalityId)) return null;
  const expect = await signMunicipalityId(municipalityId, secret);
  if (sig.length !== expect.length) return null;
  let same = 0;
  for (let i = 0; i < expect.length; i++) {
    same += sig.charCodeAt(i) === expect.charCodeAt(i) ? 1 : 0;
  }
  return same === expect.length ? municipalityId : null;
}
