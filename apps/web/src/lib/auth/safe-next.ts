/**
 * Allowlist for the post-login redirect target. Must be a same-origin path:
 * starts with `/`, no `//` (protocol-relative) and no backslashes anywhere —
 * browsers normalize `\` to `/`, so `/\evil.com` is `//evil.com`. Anything
 * else falls back to /timer to prevent open-redirect to phishing.
 */
export function safeNextPath(input: string | null | undefined): string {
  if (!input || !input.startsWith('/') || input.startsWith('//') || input.includes('\\')) {
    return '/timer';
  }
  return input;
}
