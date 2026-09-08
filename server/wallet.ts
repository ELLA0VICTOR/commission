import { execFile } from 'node:child_process'
import { resolve } from 'node:path'
import { currentStore } from './store.ts'

type Envelope<T> = { success: boolean; data: T; error?: { message?: string; code?: string }; message?: string }
export async function baw<T>(args: string[], timeout = 60_000): Promise<T> {
  if (process.env.COMMISSION_PUBLIC === '1' && process.env.COMMISSION_WALLET_ENABLED === '0') throw new Error('Wallet operations are disabled on this deployment.')
  return new Promise((resolvePromise, reject) => {
    execFile(process.execPath, [resolve('node_modules/@binance/agentic-wallet/dist/index.js'), ...args, '--json'],
      { timeout, windowsHide: true, maxBuffer: 2 * 1024 * 1024, env: { ...process.env, ...currentStore().walletEnv } },
      (error, stdout) => {
        let result: Envelope<T>
        try { result = JSON.parse(stdout.trim()) as Envelope<T> }
        catch { reject(new Error('Binance Wallet did not return a valid response. Check your connection and try again.')); return }
        if (!result.success || error) {
          reject(new Error(result.error?.message || result.message || 'Binance Wallet request failed.')); return
        }
        resolvePromise(result.data)
      })
  })
}
