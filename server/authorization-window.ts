import { setTimeout as delay } from 'node:timers/promises'
import type { Order } from '../shared/domain.ts'

type Diagnostic = NonNullable<Order['paymentDiagnostics']>
type Clock = { now: () => number; sleep: (ms: number) => Promise<void>; blockTimestamp: () => Promise<number> }

async function bnbBlockTimestamp() {
  for (const url of ['https://bsc-dataseed.binance.org', 'https://bsc-rpc.publicnode.com']) {
    try {
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBlockByNumber', params: ['latest', false] }),
        redirect: 'error', signal: AbortSignal.timeout(3_000),
      })
      if (!response.ok) continue
      const data = await response.json() as { result?: { timestamp?: unknown } }
      const value = data.result?.timestamp
      if (typeof value !== 'string' || !/^0x[0-9a-f]+$/i.test(value)) continue
      const timestamp = Number(BigInt(value))
      if (Number.isSafeInteger(timestamp) && timestamp > 0) return timestamp
    } catch { /* Try the other public read-only endpoint; never submit a transaction. */ }
  }
  throw new Error('Could not check the BNB Chain clock. No request was sent to the provider.')
}

// U's EIP-3009 contract requires block.timestamp > validAfter, not >=.
// Leave two additional chain seconds for lag between our RPC and the facilitator.
// Never edit signed timestamps, re-sign, or retry a submitted payment.
export async function waitForAuthorization(diagnostic: Diagnostic, signatureExpiresAt: number,
  clock: Clock = { now: Date.now, sleep: delay, blockTimestamp: bnbBlockTimestamp }) {
  const authorization = diagnostic.authorization
  const after = authorization?.validAfter, before = authorization?.validBefore
  if (diagnostic.accepted?.network !== 'eip155:56' || !after || !before ||
    !/^\d+$/.test(after) || !/^\d+$/.test(before) || !Number.isSafeInteger(Number(after)) || !Number.isSafeInteger(Number(before)))
    throw new Error('The wallet did not provide a supported authorization time window. No request was sent to the provider.')
  const validAfter = Number(after)
  const expiresAt = Math.min(Number(before), signatureExpiresAt)
  if (!Number.isFinite(expiresAt) || validAfter >= expiresAt)
    throw new Error('The wallet returned an invalid authorization time window. No request was sent to the provider.')
  const deadline = Math.min(clock.now() + 20_000, (expiresAt - 15) * 1000)
  while (clock.now() < deadline) {
    const blockTimestamp = await clock.blockTimestamp()
    if (clock.now() >= deadline || blockTimestamp >= expiresAt - 15) break
    if (blockTimestamp > validAfter + 2) {
      return { authorizationReadyAt: clock.now(), settlementBlockTimestamp: blockTimestamp }
    }
    await clock.sleep(Math.min(750, Math.max(0, deadline - clock.now())))
  }
  throw new Error('The authorization could not become ready with enough time to settle. No request was sent to the provider.')
}
