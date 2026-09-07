import { ArrowDownToLine, ArrowUpRight, AudioLines, Check, Clapperboard, FileText, Image, LoaderCircle, ReceiptText } from '../ui/Icons'
import { serviceNames, type Order, type Plan, type Service } from '../../../shared/domain'
export function Production({ plan, orders, onPurchase, busy, artwork, audio, onZip, onVideo, onReceipts, exporting, progress, onPlanChange, stale }: {
  plan?: Plan; orders: Order[]; onPurchase: (service: Service) => void; busy: boolean;
  artwork?: string; audio?: string; onZip: () => void; onVideo: () => void; onReceipts: () => void;
  exporting: string; progress: number; onPlanChange: (plan: Plan) => void; stale: boolean;
}) {
  const spent = orders.filter(order => order.settled).reduce((sum, order) => sum + Number(order.amount), 0)
  const committed = orders.reduce((sum, order) => sum + Number(order.amount), 0)
  const processing = orders.find(order => order.status === 'processing')
  const uncertain = orders.find(order => order.status === 'uncertain')
  return <section className="production-panel" aria-labelledby="production-title">
    <div className="panel-heading"><div><span className="step-number">02</span><h2 id="production-title">Production desk</h2></div><span className="quiet-tag">Pay per service</span></div>
    <div className="production-content">
      <div className="service-grid" role="list" aria-label="Production services">
        {(['plan', 'image', 'voice'] as Service[]).map((service, i) => {
          const delivered = service === 'plan' ? Boolean(plan) : service === 'image' ? Boolean(artwork) : Boolean(audio)
          const running = processing?.service === service
          const Icon = [FileText, Image, AudioLines][i]
          return <div className="service-card" role="listitem" key={service}>
            <span className={'service-state ' + (delivered ? 'done' : '')}>{running ? <LoaderCircle size={14} className="animate-spin" /> : delivered ? <Check size={14} /> : '0' + (i + 1)}</span>
            <Icon size={20} strokeWidth={1.4} />
            <h3>{serviceNames[service]}</h3>
            <button className="text-button" disabled={busy || Boolean(processing) || Boolean(uncertain) || (service !== 'plan' && !plan)} onClick={() => onPurchase(service)}>{running ? 'Producing…' : delivered ? 'Review a new version' : 'Get live quote'}<ArrowUpRight size={14} /></button>
          </div>
        })}
      </div>
      {processing && <div className="notice" role="status"><LoaderCircle size={17} className="animate-spin shrink-0" /><span>{serviceNames[processing.service]} is being produced. Keep the local service running. This can take a few minutes.</span></div>}
      {uncertain && <div className="error-box mt-4" role="alert"><strong>Purchase needs attention.</strong> {uncertain.error} <button className="text-button mt-2" onClick={onReceipts}>View receipt <ArrowUpRight size={14} /></button></div>}
      {plan && <details className="direction-details" open><summary>Creative direction <span>Review and edit</span></summary><p>{plan.concept}</p>{stale && <div className="notice">Your brief changed. Update the copy below before purchasing voiceover or exporting the pack. Existing artwork remains available.</div>}<label className="field mt-4">Image direction<textarea rows={3} value={plan.imagePrompt} onChange={e => onPlanChange({ ...plan, imagePrompt: e.target.value })} /></label><label className="field mt-4">Voiceover script<textarea rows={3} value={plan.narration} onChange={e => onPlanChange({ ...plan, narration: e.target.value })} /></label><label className="field mt-4">Social caption<textarea rows={3} value={plan.caption} onChange={e => onPlanChange({ ...plan, caption: e.target.value })} /></label></details>}
      {audio && <div className="voice-preview"><span><AudioLines size={16} /> Purchased voiceover</span><audio controls src={audio} preload="metadata" /></div>}
      <div className="delivery-strip"><div><h3>The finished collection.</h3><p>{artwork ? 'Poster, story, copy, and receipts in one ZIP.' : 'Preview files, ready to take away.'}</p></div><div className="delivery-actions"><button className="button secondary" disabled={Boolean(exporting)} onClick={onVideo}><Clapperboard size={16} />{exporting === 'video' ? 'Rendering ' + progress + '%' : audio ? 'Export narrated promo' : 'Export silent preview'}</button><button className="button dark" disabled={Boolean(exporting)} onClick={onZip}><ArrowDownToLine size={16} />{exporting === 'zip' ? 'Packing…' : artwork ? 'Download campaign' : 'Download preview pack'}</button></div></div>
      {exporting === 'video' && <p className="footnote mt-3" role="status">Keep this tab visible while recording. Downloads as a vertical WebM video{audio ? ' with your purchased voiceover.' : ' without narration.'}</p>}
    </div>
    <div className="production-footer"><span>On-chain settlement: <strong>{spent.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} U</strong>{committed > spent && <span> · {committed.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} U committed</span>}</span><button className="text-button" onClick={onReceipts}><ReceiptText size={15} /> Receipts {orders.length > 0 && '(' + orders.length + ')'}</button></div>
  </section>
}
