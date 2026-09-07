import { useEffect, useState } from 'react'
import type { Wallet } from '../../../shared/domain'
import { Check, Copy, WalletCards } from '../ui/Icons'

export function WalletControl({ wallet, onOpen }: { wallet: Wallet; onOpen: () => void }) {
  const [feedback, setFeedback] = useState('')
  useEffect(() => {
    if (!feedback) return
    const timer = setTimeout(() => setFeedback(''), 2200)
    return () => clearTimeout(timer)
  }, [feedback])
  const address = wallet.connected ? wallet.address : undefined
  async function copyAddress() {
    if (!address) return
    try { await navigator.clipboard.writeText(address); setFeedback('Address copied') }
    catch { setFeedback('Copy failed. Open wallet to copy manually.') }
  }
  return <div className="wallet-control">
    <button className="wallet-button" aria-label={wallet.connected ? 'Wallet connected' : 'Connect wallet'} title={address || 'Open wallet'} onClick={onOpen}>
      <WalletCards size={16} />
      <span className={address ? 'wallet-address-label' : undefined}>{address ? address.slice(0, 6) + '?' + address.slice(-4) : wallet.connected ? 'Wallet connected' : 'Connect wallet'}</span>
      <span className={'status-dot ' + (wallet.connected ? 'connected' : '')} />
    </button>
    {address && <button className="icon-button wallet-copy" aria-label="Copy wallet address" title={feedback || 'Copy full wallet address'} onClick={() => void copyAddress()}>{feedback === 'Address copied' ? <Check size={15} /> : <Copy size={15} />}</button>}
    <span className="wallet-copy-feedback" role="status">{feedback}</span>
  </div>
}
