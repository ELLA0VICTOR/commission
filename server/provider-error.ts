// Surface recognized failure categories, never arbitrary provider text or credentials.
export function settlementFailure(raw: unknown): string | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const body = raw as Record<string, unknown>
  const nested = body.error && typeof body.error === 'object' ? body.error as Record<string, unknown> : undefined
  const fields = [body.error, body.message, body.errorCode, body.errorReason, nested?.message, nested?.code]
  if (fields.some(value => typeof value === 'string' && /\binvalid_transaction_state\b/.test(value))) {
    return 'B402 reported a settlement failure (invalid_transaction_state). Creative delivery is unavailable. This error does not establish whether funds moved; check wallet activity before retrying.'
  }
}
