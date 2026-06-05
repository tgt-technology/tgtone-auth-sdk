/**
 * PKCE (Proof Key for Code Exchange) — RFC 7636
 * Generates cryptographically secure code_verifier + code_challenge pairs
 */
export interface PKCEParams {
  codeVerifier: string;
  codeChallenge: string;
}

/**
 * Generate PKCE code verifier and S256 challenge.
 * Uses Web Crypto API (available in browsers and Node 19+).
 */
export async function generatePKCE(): Promise<PKCEParams> {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  const codeVerifier = base64URLEncode(array);
  const codeChallenge = await sha256ThenBase64URL(codeVerifier);
  return { codeVerifier, codeChallenge };
}

/**
 * Synchronous fallback using Math.random (less secure, avoid in production).
 * Exists for environments where crypto.getRandomValues is not available.
 */
export function generatePKCEFallback(): PKCEParams {
  const array = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    array[i] = Math.floor(Math.random() * 256);
  }
  const codeVerifier = base64URLEncode(array);
  // Synchronous SHA-256 not available in all environments;
  // return verifier only, caller should handle
  return { codeVerifier, codeChallenge: '' };
}

function base64URLEncode(buffer: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256ThenBase64URL(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return base64URLEncode(new Uint8Array(hash));
}
