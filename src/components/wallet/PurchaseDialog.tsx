import { useEffect, useState } from 'react'
import { ArrowUpRight, Clock3, ShieldCheck } from '../ui/Icons'
import { serviceNames, type Quote } from '../../../shared/domain'
import { Modal } from '../ui/Modal'
export function PurchaseDialog({ quote, onClose, onApprove, busy }: {
  quote: Quote; onClose: () => void; onApprove: () => void; busy: boolean;
}) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer) }, [])
  const expired = now >= quote.expiresAt
  return <Modal title="Review this purchase" onClose={onClose}>
    <p className="text-muted mb-6">One service for this campaign. Commission will sign only the exact payment shown below.</p>
    <div className="purchase-summary"><div><span>Xona · {serviceNames[quote.service]}</span><strong>{quote.amount} <small>{quote.token}</small></strong></div><ShieldCheck size={28} /></div>
    <dl className="purchase-details"><div><dt>Payment rail</dt><dd>Binance B402</dd></div><div><dt>Network</dt><dd>BNB Chain · 56</dd></div><div><dt>Service</dt><dd>{quote.service === 'plan' ? 'GPT-5.2 creative direction' : quote.service === 'image' ? 'FLUX.2 Pro image' : 'Text-to-speech · Eve'}</dd></div></dl>
    <label className="field mt-4">Token contract<code className="address-box">{quote.tokenAddress}</code></label>
    <label className="field mt-4">Provider receives payment at<code className="address-box">{quote.payTo}</code></label>
    {!quote.ready && <p role="alert" className="error-box mt-5">Wallet action needed: {quote.reasons.join(', ').replaceAll('_', ' ').toLowerCase() || 'payment option unavailable'}. Fund the exact token above if needed, then request a new quote.</p>}
    <p className="footnote flex items-center gap-2 my-5"><Clock3 size={14} />{expired ? 'Quote expired. Close and request a new one.' : 'Quote valid for ' + Math.ceil((quote.expiresAt - now) / 1000) + ' seconds.'}</p>
    <button className="button primary w-full" disabled={busy || !quote.ready || expired} onClick={onApprove}>{busy ? 'Authorizing…' : 'Approve ' + quote.amount + ' ' + quote.token + ' purchase'}<ArrowUpRight size={17} /></button>
    <p className="footnote mt-3">Production starts after approval. Delivery problems can occur after payment; Commission stops instead of automatically charging again.</p>
  </Modal>
}
