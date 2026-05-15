/**
 * Maps internal domain errors to the MCP tool-call error shape. The HTTP
 * transport layer handles 401/429; everything else flows through here.
 *
 * Existence-leak hygiene (constitution §3): "not in your company" and
 * "doesn't exist" both surface as `not_found`. Never report which one.
 */
export type McpErrorCode = 'not_found' | 'invalid_args' | 'conflict' | 'internal';

export interface McpToolError {
  isError: true;
  content: { type: 'text'; text: string }[];
  structuredContent: { code: McpErrorCode; message: string };
}

export function toolError(code: McpErrorCode, message: string): McpToolError {
  return {
    isError: true,
    content: [{ type: 'text', text: JSON.stringify({ code, message }) }],
    structuredContent: { code, message },
  };
}

export function mapServiceReason(reason: string): { code: McpErrorCode; message: string } {
  switch (reason) {
    case 'not_found':
    case 'forbidden': // collapse to not_found per constitution §3
      return { code: 'not_found', message: 'Not found.' };
    case 'not_running':
      return { code: 'conflict', message: 'Timer is not running.' };
    case 'invalid_window':
      return { code: 'invalid_args', message: 'Invalid time window.' };
    case 'future_timestamp':
      return { code: 'invalid_args', message: 'Timestamp is in the future.' };
    default:
      return { code: 'internal', message: 'Internal error.' };
  }
}
