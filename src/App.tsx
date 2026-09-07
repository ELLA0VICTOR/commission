import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpRight, Check, ChevronRight, CircleHelp, Menu, ReceiptText, WalletCards, X } from './components/ui/Icons'
import { briefSchema, planSchema, serviceNames, type Brief, type Order, type Plan, type Project, type Quote, type Service, type Wallet } from '../shared/domain'
import { Sidebar } from './components/layout/Sidebar'
import { BriefEditor } from './components/campaign/BriefEditor'
import { Poster, type Format } from './components/campaign/Poster'
import { Preview } from './components/campaign/Preview'
import { Production } from './components/campaign/Production'
import { WalletDialog } from './components/wallet/WalletDialog'
import { PurchaseDialog } from './components/wallet/PurchaseDialog'
import { Modal } from './components/ui/Modal'
import { api } from './lib/api'
import { contentKey, createProject, loadProjects, saveProjects } from './lib/projects'
import { download, filename } from './lib/download'

export default function App() {
  const [projects, setProjects] = useState(loadProjects)
  const [activeId, setActiveId] = useState(() => projects[0].id)
  const [wallet, setWallet] = useState<Wallet>({ connected: false })
  const [orders, setOrders] = useState<Order[]>([])
  const [format, setFormat] = useState<Format>('poster')
  const [modal, setModal] = useState<'wallet' | 'guide' | 'preview' | 'receipts' | null>(null)
  const [quote, setQuote] = useState<Quote>()
  const [busy, setBusy] = useState(false)
  const [exporting, setExporting] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const projectsRef = useRef(projects)
  const project = projects.find(item => item.id === activeId) || projects[0]
  const projectOrders = orders.filter(order => order.projectId === project.id)
  const artwork = projectOrders.filter(order => order.service === 'image' && order.status === 'delivered').at(-1)?.assetUrl
  const voiceOrder = projectOrders.filter(order => order.service === 'voice' && order.status === 'delivered').at(-1)
  const audio = voiceOrder?.sourceText === project.plan?.narration ? voiceOrder?.assetUrl : undefined
  const stale = Boolean(project.plan && project.planKey !== contentKey(project.brief))

  const commit = useCallback((next: Project[]) => {
    projectsRef.current = next
    setProjects(next)
    try { saveProjects(next) } catch { setError('Browser storage is full or unavailable. Export your campaign before closing this tab.') }
  }, [])
  const refreshWallet = useCallback(async () => {
    try { setWallet(await api<Wallet>('/wallet')) }
    catch (error) { setWallet({ connected: false, error: (error as Error).message }) }
  }, [])
  useEffect(() => {
    void api<Wallet>('/wallet').then(setWallet).catch(error => setWallet({ connected: false, error: (error as Error).message }))
    let alive = true
    async function refreshOrders() {
      try {
        const result = await api<Order[]>('/orders')
        if (!alive) return
        setOrders(result)
        const current = projectsRef.current
        let changed = false
        const next = current.map(item => {
          const latest = result.filter(order => order.projectId === item.id && order.service === 'plan' && order.status === 'delivered').at(-1)
          if (!latest?.plan || latest.id === item.planOrderId) return item
          changed = true
          return { ...item, plan: latest.plan, planOrderId: latest.id, planKey: contentKey(latest.briefSnapshot || item.brief) }
        })
        if (changed) commit(next)
      } catch { /* A transient polling failure never changes payment or delivery state. */ }
    }
    void refreshOrders()
    const timer = setInterval(() => void refreshOrders(), 2500)
    return () => { alive = false; clearInterval(timer) }
  }, [commit, refreshWallet])
  function updateBrief(brief: Brief) {
    commit(projects.map(item => item.id === project.id ? { ...item, brief } : item))
  }
  function updatePlan(plan: Plan) {
    commit(projects.map(item => item.id === project.id ? { ...item, plan } : item))
  }
  function newProject() {
    const next = createProject()
    next.brief.title = 'UNTITLED GATHERING'
    commit([...projects, next]); setActiveId(next.id); setMobileMenu(false)
  }
  async function purchase(service: Service) {
    setError('')
    if (!wallet.connected) { setModal('wallet'); return }
    if (!briefSchema.safeParse(project.brief).success) { setError('Complete the event name, date, time, venue, call to action, and a budget between 0.0001 and 10 U.'); return }
    if (service !== 'plan' && !planSchema.safeParse(project.plan).success) { setError('Review the creative direction and complete its image prompt, narration, and caption first.'); return }
    if (service === 'voice' && stale) { setError('Your brief changed. Review the script and use “Copy checked” below the creative direction before buying a voiceover.'); return }
    setBusy(true)
    try { setQuote(await api<Quote>('/quotes', { projectId: project.id, service, brief: project.brief, plan: project.plan })) }
    catch (error) { setError((error as Error).message) }
    finally { setBusy(false) }
  }
  async function approve() {
    if (!quote) return
    setBusy(true); setError('')
    try {
      const order = await api<Order>('/purchases', { quoteId: quote.id, approvedAmount: quote.amount })
      setOrders(previous => previous.some(item => item.id === order.id) ? previous : [...previous, order])
      setQuote(undefined)
      setNotice('Purchase authorized. Production is running; its receipt will update here.')
    } catch (error) { setError((error as Error).message); setQuote(undefined) }
    finally { setBusy(false) }
  }
  async function exportAsset(kind: 'png' | 'zip' | 'video') {
    if (!briefSchema.safeParse(project.brief).success) { setError('Complete the brief before exporting.'); return }
    if (kind !== 'png' && stale) { setError('Review the copy after your brief changes, then select “Copy checked” before exporting.'); return }
    setExporting(kind); setError(''); setProgress(0)
    try {
      const { campaignZip, canvasBlob, motionPromo, posterCanvas } = await import('./lib/export')
      const base = filename(project.brief) + (artwork ? '' : '-layout-preview')
      if (kind === 'png') download(await canvasBlob(await posterCanvas(project.brief, format, artwork)), base + '-' + format + '.png')
      if (kind === 'zip') download(await campaignZip(project.brief, projectOrders, project.plan, artwork, audio), base + '.zip')
      if (kind === 'video') download(await motionPromo(project.brief, artwork, audio, setProgress), base + (audio ? '-narrated-promo' : '-silent-preview') + '.webm')
      setNotice(kind === 'video' ? 'WebM video exported.' : kind === 'zip' ? 'Campaign ZIP exported.' : 'PNG exported.')
    } catch (error) { setError((error as Error).message) }
    finally { setExporting('') }
  }
  return <div className={'app-shell ' + (mobileMenu ? 'menu-open' : '')}>
    {mobileMenu && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
    <Sidebar projects={projects} activeId={project.id} onSelect={id => { setActiveId(id); setMobileMenu(false) }} onCreate={newProject} wallet={wallet} onWallet={() => setModal('wallet')} onGuide={() => setModal('guide')} />
    <div className="main-shell">
      <header className="topbar"><div className="flex items-center gap-3 min-w-0"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Menu size={20} /></button><span className="text-muted hidden sm:inline">Your studio</span><ChevronRight size={14} className="text-muted hidden sm:inline" /><span className="breadcrumb-title">{project.brief.title || 'Untitled campaign'}</span></div><div className="flex items-center gap-4"><button className="icon-button" aria-label="How Commission works" onClick={() => setModal('guide')}><CircleHelp size={18} /></button><span className="topbar-divider" /><button className="wallet-button" onClick={() => setModal('wallet')}><WalletCards size={16} /><span>{wallet.connected ? 'Wallet connected' : 'Connect wallet'}</span><span className={'status-dot ' + (wallet.connected ? 'connected' : '')} /></button></div></header>
      <main id="main-content" className="workspace">
        <div className="workspace-heading"><div><div className="eyebrow">Event campaign <span> / </span> <span>{artwork ? 'In production' : 'Draft'}</span></div><h1>Make it an occasion.</h1></div><button className="button secondary" disabled={Boolean(exporting)} onClick={() => void exportAsset('zip')}><ArrowDownToLine size={16} /> Export {artwork ? 'campaign' : 'preview'}</button></div>
        {error && <div className="error-box page-alert" role="alert"><span>{error}</span><button className="icon-button small" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
        {notice && <div className="notice page-alert" role="status"><Check size={17} /><span>{notice}</span><button className="icon-button small ml-auto" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
        {wallet.error && <div className="notice mb-5"><span>{wallet.error}</span><button className="text-button shrink-0" onClick={() => void refreshWallet()}>Check again</button></div>}
        <div className="studio-grid"><Preview brief={project.brief} artwork={artwork} format={format} onFormat={setFormat} onExport={() => void exportAsset('png')} exporting={Boolean(exporting)} onExpand={() => setModal('preview')} /><BriefEditor brief={project.brief} onChange={updateBrief} onReview={() => void purchase('plan')} busy={busy || projectOrders.some(order => order.status === 'processing')} connected={wallet.connected} hasPlan={Boolean(project.plan)} /></div>
        <Production plan={project.plan} orders={projectOrders} onPurchase={service => void purchase(service)} busy={busy} artwork={artwork} audio={audio} onZip={() => void exportAsset('zip')} onVideo={() => void exportAsset('video')} onReceipts={() => setModal('receipts')} exporting={exporting} progress={progress} onPlanChange={updatePlan} stale={stale} />
        {stale && <div className="notice mt-3"><span>Check the script and caption against your updated event details.</span><button className="button secondary shrink-0" onClick={() => commit(projects.map(item => item.id === project.id ? { ...item, planKey: contentKey(item.brief) } : item))}><Check size={15} /> Copy checked</button></div>}
        {voiceOrder?.assetUrl && !audio && <p className="notice mt-3">The script has changed since the last voiceover. Your old recording remains in receipts; new exports omit it until you purchase the revised script.</p>}
        <footer className="workspace-footer"><span>Made with intent. Produced with Commission.</span><span>Binance Agentic Wallet <span className="mx-2">·</span> B402 payments</span></footer>
      </main>
    </div>
    {modal === 'wallet' && <WalletDialog wallet={wallet} onRefresh={refreshWallet} onClose={() => setModal(null)} />}
    {quote && <PurchaseDialog quote={quote} onClose={() => { if (!busy) setQuote(undefined) }} onApprove={() => void approve()} busy={busy} />}
    {modal === 'preview' && <Modal title={project.brief.title} onClose={() => setModal(null)}><div className="expanded-poster"><Poster brief={project.brief} format={format} artwork={artwork} /></div><p className="footnote mt-3">{artwork ? 'Purchased artwork with editable event details.' : 'Local layout preview. Original artwork has not been purchased.'}</p></Modal>}
    {modal === 'guide' && <Modal title="A small brief. A whole campaign." onClose={() => setModal(null)}><ol className="setup-steps"><li><span>1</span><div><strong>Make the brief yours</strong><p>Set your event details and budget. Explore the poster and story layouts free.</p></div></li><li><span>2</span><div><strong>Commission the creative direction</strong><p>Connect Binance Agentic Wallet. Review a live Xona quote; the agent buys a concept, art direction, script, and caption using B402.</p></div></li><li><span>3</span><div><strong>Approve the production</strong><p>Edit the direction, then commission original artwork and a voiceover. Each purchase has its own exact-price approval and receipt.</p></div></li><li><span>4</span><div><strong>Leave with real files</strong><p>Download your PNG poster, story, caption, voiceover, and receipts as a ZIP. Export the vertical narrated promo separately as WebM. Date and venue edits reuse your artwork.</p></div></li></ol><p className="footnote">This workspace runs on your computer. Keep the local service running for wallet connection and production. Live delivery depends on Binance and Xona; preview exports work without a funded wallet.</p><a className="text-button mt-5" href="https://github.com/binance/binance-skills-hub/tree/main/skills/binance-web3/binance-agentic-wallet" target="_blank" rel="noreferrer">Official Binance Wallet documentation <ArrowUpRight size={15} /></a></Modal>}
    {modal === 'receipts' && <Modal title="Campaign receipts" onClose={() => setModal(null)}>
      {!projectOrders.length ? <div className="empty-state"><ReceiptText size={32} /><h3>No purchases yet</h3><p>Layout previews are free. Paid services will appear here with their real delivery and settlement status.</p></div> : <div className="receipt-list">{projectOrders.map(order => <article key={order.id}><div className="flex justify-between gap-3"><strong>{serviceNames[order.service]}</strong><strong>{order.amount} U</strong></div><p>{new Date(order.createdAt).toLocaleString()} · {order.status === 'uncertain' ? 'Needs review' : order.status}</p><p>{order.settled ? 'Settlement reported by provider' : 'On-chain settlement not confirmed'}</p>{order.error && <p className="text-red-700">{order.error}</p>}{order.settlement && <a className="text-button" href={'https://bscscan.com/tx/' + order.settlement} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={14} /></a>}{order.recoverable && order.status === 'uncertain' && <button className="text-button mt-2" disabled={busy} onClick={() => {
        setBusy(true)
        void api<Order>('/orders/' + order.id + '/recover', {}).then(result => {
          setOrders(previous => previous.map(item => item.id === result.id ? result : item))
          setNotice('Saved delivery recovered. No new payment was made.')
        }).catch(error => setError((error as Error).message)).finally(() => { setBusy(false); setModal(null) })
      }}>Retry saved delivery · no payment <ArrowUpRight size={14} /></button>}{order.assetUrl && <a className="text-button mt-2" href={order.assetUrl} download>Download original file <ArrowDownToLine size={14} /></a>}<code>{order.id}</code></article>)}</div>}
      <button className="button secondary mt-5" onClick={() => download(new Blob([JSON.stringify(projectOrders, null, 2)], { type: 'application/json' }), filename(project.brief) + '-receipts.json')}><ArrowDownToLine size={16} /> Export receipts</button>
    </Modal>}
  </div>
}
