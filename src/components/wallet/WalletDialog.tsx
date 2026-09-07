import { useEffect, useState } from 'react'
import { ArrowUpRight, Check, Copy, LoaderCircle, ShieldCheck } from '../ui/Icons'
import type { Wallet } from '../../../shared/domain'
import { api } from '../../lib/api'
import { Modal } from '../ui/Modal'
type Pairing = { status: 'idle' | 'waiting' | 'connected' | 'failed'; urlForWeb?: string; pairingCode?: string; error?: string }
export function WalletDialog({ wallet, onClose, onRefresh }: { wallet: Wallet; onClose: () => void; onRefresh: () => Promise<void> }) {
  const [pairing, setPairing] = useState<Pairing>({ status: 'idle' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (pairing.status !== 'waiting') return
    const timer = setInterval(() => {
      void api<Pairing>('/wallet/pairing').then(result => {
        setPairing(result)
        if (result.status === 'connected') void onRefresh()
      }).catch(() => setError('Connection check interrupted. Keep the local service running.'))
    }, 2000)
    return () => clearInterval(timer)
  }, [pairing.status, onRefresh])
  async function connect() {
    setBusy(true); setError('')
    try { const result = await api<Pairing>('/wallet/connect', {}); setPairing(result); if (result.status === 'connected') await onRefresh() }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function disconnect() {
    setBusy(true)
    try { await api('/wallet/disconnect', {}); await onRefresh(); setPairing({ status: 'idle' }) }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  return <Modal title={wallet.connected ? 'Your production wallet' : 'Connect Binance Wallet'} onClose={onClose}>
    {wallet.connected ? <>
      <div className="connection-success"><ShieldCheck size={24} /><div><strong>Connected on this computer</strong><p>Binance Agentic Wallet · BNB Chain</p></div></div>
      <label className="field mt-6">Your BNB Chain wallet address<div className="address-box"><code>{wallet.address || 'No BNB Chain address returned'}</code>{wallet.address && <button className="icon-button" aria-label="Copy wallet address" onClick={() => { void navigator.clipboard.writeText(wallet.address!).then(() => setCopied(true)) }}>{copied ? <Check size={16} /> : <Copy size={16} />}</button>}</div></label>
      <p className="text-sm text-muted my-5">Request a live quote before funding. The current provider accepts U (United Stables) on BNB Chain. Match the full token contract in the purchase review. Your exchange balance and MCP trading account are separate from this wallet.</p>
      <button className="button secondary" disabled={busy} onClick={() => void disconnect()}>Disconnect wallet</button>
    </> : <>
      <p className="text-muted mb-6">Connect once. Review every purchase. Your wallet signs locally through Binance’s official Agentic Wallet software.</p>
      <ol className="setup-steps">
        <li><span>1</span><div><strong>Set up Binance Wallet in the app</strong><p>Open the Binance app’s Wallet section. Create your wallet if needed and finish the setup and backup prompts.</p></div></li>
        <li><span>2</span><div><strong>Open the official pairing page</strong><p>Use the button below, then scan its QR code with the Binance app.</p></div></li>
        <li><span>3</span><div><strong>Match the code and approve</strong><p>Check that the code here matches the app. Keep Commission running until connected.</p></div></li>
      </ol>
      {pairing.status === 'waiting' ? <div className="pairing-box"><span>Match this pairing code</span><strong>{pairing.pairingCode}</strong><a className="button primary" href={pairing.urlForWeb} target="_blank" rel="noreferrer">Open Binance pairing page<ArrowUpRight size={16} /></a><p><LoaderCircle size={14} className="animate-spin" /> Waiting for your approval in Binance…</p></div>
        : <button className="button primary w-full" disabled={busy} onClick={() => void connect()}>{busy ? <LoaderCircle size={17} className="animate-spin" /> : <ArrowUpRight size={17} />}{busy ? 'Requesting pairing code…' : 'Start secure connection'}</button>}
      <p className="footnote mt-4">No funds are transferred by connecting. Fund the exact token and network shown in your first purchase quote.</p>
    </>}
    {(error || pairing.error) && <p className="error-box mt-4" role="alert">{error || pairing.error}</p>}
  </Modal>
}
