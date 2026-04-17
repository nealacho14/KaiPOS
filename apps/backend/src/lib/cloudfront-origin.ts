/**
 * CloudFront origin verification policy, extracted as pure helpers so the
 * env read and header compare are testable without Hono.
 *
 * Behavior (same as before, just centralized):
 * - When `CLOUDFRONT_SECRET` is unset or empty (local dev), verification is
 *   disabled and any header value — including absent — is accepted.
 * - When set, the incoming `x-origin-verify` header must match exactly.
 *
 * Note: this is intentionally HTTP-only. WebSocket handshakes bypass
 * CloudFront (browsers cannot set custom headers on `new WebSocket(...)`),
 * so WS uses JWT-in-query via `lib/ws-auth.ts` instead. See CLAUDE.md
 * § WebSocket for the rationale.
 */

function getCloudfrontSecret(): string | undefined {
  const secret = process.env.CLOUDFRONT_SECRET;
  return secret && secret.length > 0 ? secret : undefined;
}

export function isCloudfrontOriginVerifyEnabled(): boolean {
  return getCloudfrontSecret() !== undefined;
}

export function verifyCloudfrontOriginHeader(headerValue: string | undefined): boolean {
  const secret = getCloudfrontSecret();
  if (secret === undefined) return true;
  return headerValue === secret;
}
