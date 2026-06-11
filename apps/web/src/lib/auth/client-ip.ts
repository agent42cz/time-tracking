/**
 * Client IP extraction from `x-forwarded-for` — first hop only. Safe to
 * trust because the app is only reachable through Cloudflare + Traefik,
 * which overwrite the header (spoofed XFF/X-Real-IP from clients never
 * reaches the app; verified in the AIAGE-39 external review).
 */
export function clientIpFrom(headers: Headers): string | null {
  return headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
}
