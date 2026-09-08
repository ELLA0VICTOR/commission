import type { AgentTurn } from '../shared/agent'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, ArrowUpRight, ChevronRight, CircleHelp, Menu, Message, ReceiptText, X } from './components/ui/Icons'
import { briefSchema, planSchema, serviceNames, type Brief, type Order, type Plan, type Project, type Quote, type Service, type Wallet, type UploadedNarration } from '../shared/domain'
import { Sidebar } from './components/layout/Sidebar'
import { BriefEditor } from './components/campaign/BriefEditor'
import { Poster, type Format } from './components/campaign/Poster'
import { Preview } from './components/campaign/Preview'
import { ProgressStrip } from './components/campaign/ProgressStrip'
import { NarrationPanel } from './components/campaign/NarrationPanel'
import { DirectionEditor } from './components/campaign/DirectionEditor'
import { AgentPanel } from './components/agent/AgentPanel'
import { chatMessage, type AgentAction } from './lib/conversation'
import { WalletDialog } from './components/wallet/WalletDialog'
import { WalletControl } from './components/wallet/WalletControl'
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
  const [modal, setModal] = useState<'wallet' | 'guide' | 'preview' | 'receipts' | 'edit' | 'direction' | 'export' | 'narration' | null>(null)
  const [quote, setQuote] = useState<Quote>()
  const [busy, setBusy] = useState(false)
  const [agentThinking, setAgentThinking] = useState(false)
  const [agentConfigured, setAgentConfigured] = useState<boolean>()
  const agentPending = useRef(false)
  const activeProjectRef = useRef(activeId)
  useEffect(() => { activeProjectRef.current = activeId }, [activeId])
  const [exporting, setExporting] = useState('')
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [agentOpen, setAgentOpen] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const projectsRef = useRef(projects)
  const project = projects.find(item => item.id === activeId) || projects[0]
  const projectOrders = orders.filter(order => order.projectId === project.id)
  const artwork = projectOrders.filter(order => order.service === 'image' && order.status === 'delivered').at(-1)?.assetUrl
  const voiceOrder = projectOrders.filter(order => order.service === 'voice' && order.status === 'delivered').at(-1)
  const paidAudio = voiceOrder?.sourceText === project.plan?.narration ? voiceOrder?.assetUrl : undefined
  const uploaded = project.uploadedNarration
  const uploadedAudio = uploaded?.sourceText === (project.plan?.narration || '') ? uploaded?.assetUrl : undefined
  const audio = uploadedAudio || paidAudio
  const audioSource = uploadedAudio ? 'Uploaded narration' : paidAudio ? 'B402 purchase' : undefined
  const providerUnavailable = orders.some(order => order.service === 'voice' && /out of credits|spending limit/i.test(order.error || ''))
  const briefingComplete = briefSchema.safeParse(project.brief).success && Boolean(project.briefConfirmed || project.plan)
  const stale = Boolean(project.plan && project.planKey !== contentKey(project.brief))
  const currentStage = !briefingComplete ? 0 : !project.plan || stale ? 1 : !artwork ? 2 : 4
  const settledUnits = projectOrders.filter(order => order.settled).reduce((sum, order) => {
    const [whole, fraction = ''] = order.amount.split('.')
    return sum + BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, '0'))
  }, 0n)
  const settledDigits = settledUnits.toString().padStart(19, '0')
  const settledAmount = (settledDigits.slice(0, -18) + '.' + settledDigits.slice(-18)).replace(/\.?0+$/, '') || '0'

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
    void api<{ configured: boolean }>('/agent/status').then(status => setAgentConfigured(status.configured)).catch(() => setAgentConfigured(false))
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
  function say(text: string, projectId = project.id) {
    commit(projectsRef.current.map(item => item.id === projectId ? { ...item, messages: [...(item.messages || []), chatMessage('agent', text)].slice(-150) } : item))
  }
  function saveNarration(uploadedNarration: UploadedNarration) {
    commit(projectsRef.current.map(item => item.id === project.id ? { ...item, uploadedNarration } : item))
    say('Uploaded narration saved. It will be used in the campaign exports when it matches the current script. No payment was made.')
  }
  function removeNarration() {
    commit(projectsRef.current.map(item => item.id === project.id ? { ...item, uploadedNarration: undefined } : item))
  }
  function clearChat() {
    setError('')
    commit(projectsRef.current.map(item => item.id === project.id ? { ...item, messages: [], agentField: undefined } : item))
  }
  async function sendMessage(text: string) {
    if (agentPending.current || busy) return
    const current = projectsRef.current.find(item => item.id === project.id)!
    const snapshot = JSON.stringify({ brief: current.brief, plan: current.plan })
    agentPending.current = true; setAgentThinking(true); setError('')
    commit(projectsRef.current.map(item => item.id === current.id ? { ...item, messages: [...(item.messages || []), chatMessage('user', text)].slice(-150) } : item))
    try {
      const result = await api<AgentTurn>('/agent/message', {
        projectId: current.id, brief: current.brief, plan: current.plan, planKey: current.planKey,
        message: text, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        history: (current.messages || []).slice(-12).map(message => ({ role: message.role, text: message.text.slice(0, 1000) })),
      })
      const latest = projectsRef.current.find(item => item.id === current.id)
      if (!latest) return
      if (JSON.stringify({ brief: latest.brief, plan: latest.plan }) !== snapshot) {
        say('The campaign changed while I was thinking, so I kept your newer edits. Please send your request again.', current.id)
        return
      }
      const copyChanged = JSON.stringify(result.plan) !== JSON.stringify(current.plan)
      commit(projectsRef.current.map(item => item.id === current.id ? {
        ...item, brief: result.brief, plan: result.plan, agentField: undefined,
        planKey: copyChanged ? undefined : item.planKey,
        briefConfirmed: briefSchema.safeParse(result.brief).success,
        messages: [...(item.messages || []), chatMessage('agent', result.reply)].slice(-150),
      } : item))
      if (activeProjectRef.current === current.id) {
        if (result.quote) setQuote(result.quote)
        else if (result.panel) setModal(result.panel)
      }
    } catch (error) {
      if (activeProjectRef.current === current.id) setError((error as Error).message)
    } finally { agentPending.current = false; setAgentThinking(false) }
  }
  async function agentAction(action: AgentAction, announce = true) {
    setError('')
    if (action === 'brief') { await sendMessage('Help me build my event brief. Ask only for details that are missing.'); return }
    if (action === 'voice' || action === 'upload') { setModal('narration'); return }
    if (action === 'direction' || action === 'image') {
      if (announce) say('I’ll check the current ' + (action === 'direction' ? 'creative direction' : action) + ' quote. You approve the exact price.')
      await purchase(action === 'direction' ? 'plan' : action)
      return
    }
    if (action === 'review') {
      if (!project.plan) { say('Commission creative direction first. Then we can review the image prompt, script, and caption.'); return }
      setModal('direction'); return
    }
    setModal(action === 'edit' ? 'edit' : action)
  }
  function openStep(index: number) {
    if (index === 0) { setAgentOpen(true); return }
    if (index === 3) { setModal('export'); return }
    if (index === 1 && project.plan) { setModal('direction'); return }
    setAgentOpen(true)
    const label = ['Brief', 'Direction', 'Artwork'][index]
    say(label + ' is selected. ' + (index === 1 || project.plan ? 'Use the matching action below to request a quote.' : 'Complete creative direction first.'))
  }
  function saveBrief() {
    if (!briefSchema.safeParse(project.brief).success) { setError('Complete the required brief fields and a valid budget before saving.'); return }
    commit(projectsRef.current.map(item => item.id === project.id ? { ...item, briefConfirmed: true } : item))
    setModal(null)
  }
  function confirmCopy() {
    if (!planSchema.safeParse(project.plan).success) { setError('Complete the image direction, script, and caption first.'); return }
    commit(projectsRef.current.map(item => item.id === project.id ? { ...item, planKey: contentKey(item.brief) } : item))
    setModal(null); say('Copy checked against the current brief.')
  }
  function updateBrief(brief: Brief) {
    commit(projects.map(item => item.id === project.id ? { ...item, brief } : item))
  }
  function updatePlan(plan: Plan) {
    commit(projects.map(item => item.id === project.id ? { ...item, plan } : item))
  }
  function newProject() {
    const next = createProject()
    commit([...projects, next]); setActiveId(next.id); setMobileMenu(false)
  }
  async function purchase(service: Service) {
    setError('')
    if (!wallet.connected) { say('Connect your Binance Agentic Wallet first. No payment is made by connecting.'); setModal('wallet'); return }
    if (!briefSchema.safeParse(project.brief).success) { setError('Complete the event name, date, time, venue, call to action, and a budget between 0.0001 and 10 U.'); return }
    if (service !== 'plan' && !planSchema.safeParse(project.plan).success) { setError('Review the creative direction and complete its image prompt, narration, and caption first.'); return }
    if (service === 'voice' && stale) { setError('Your brief changed. Open “Review copy”, check the script, and choose “Copy checked” before buying a voiceover.'); return }
    if (service === 'plan') commit(projectsRef.current.map(item => item.id === project.id ? { ...item, briefConfirmed: true } : item))
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
      say('Purchase authorized. I’ll put the delivery and settlement record in this conversation.', order.projectId)
      setAgentOpen(true)
    } catch (error) { setError((error as Error).message); setQuote(undefined) }
    finally { setBusy(false) }
  }
  async function exportAsset(kind: 'png' | 'zip' | 'video') {
    if (!briefSchema.safeParse(project.brief).success) { setError('Complete the brief before exporting.'); return }
    if (kind !== 'png' && stale) { setError('Open “Review copy” and check the updated event details before exporting.'); return }
    setExporting(kind); setError(''); setProgress(0)
    try {
      const { campaignZip, canvasBlob, motionPromo, posterCanvas } = await import('./lib/export')
      const base = filename(project.brief) + (artwork ? '' : '-layout-preview')
      if (kind === 'png') download(await canvasBlob(await posterCanvas(project.brief, format, artwork)), base + '-' + format + '.png')
      if (kind === 'zip') download(await campaignZip(project.brief, projectOrders, project.plan, artwork, audio, audioSource), base + '.zip')
      if (kind === 'video') download(await motionPromo(project.brief, artwork, audio, setProgress), base + (audio ? '-narrated-promo' : artwork ? '-animated-promo' : '-silent-preview') + '.webm')
      setNotice(kind === 'video' ? 'WebM video exported.' : kind === 'zip' ? 'Campaign ZIP exported.' : 'PNG exported.')
    } catch (error) { setError((error as Error).message) }
    finally { setExporting('') }
  }
  return <div className={'app-shell ' + (mobileMenu ? 'menu-open' : '')}>
    {mobileMenu && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMobileMenu(false)} />}
    <Sidebar projects={projects} activeId={project.id} onSelect={id => { setActiveId(id); setMobileMenu(false) }} onCreate={newProject} wallet={wallet} onWallet={() => setModal('wallet')} onGuide={() => setModal('guide')} />
    <div className="main-shell">
      <header className="topbar"><div className="flex items-center gap-3 min-w-0"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobileMenu(true)}><Menu size={20} /></button><span className="text-muted hidden sm:inline">Your studio</span><ChevronRight size={14} className="text-muted hidden sm:inline" /><span className="breadcrumb-title">{project.brief.title || 'Untitled campaign'}</span></div><div className="flex items-center gap-4"><button className="icon-button" aria-label="How Commission works" onClick={() => setModal('guide')}><CircleHelp size={18} /></button><span className="topbar-divider" /><WalletControl key={wallet.address || 'disconnected'} wallet={wallet} onOpen={() => setModal('wallet')} /></div></header>
      <main id="main-content" className="workspace">
        <div className="workspace-heading"><div><div className="eyebrow">Event campaign <span>/</span> <span>{currentStage === 4 ? 'Ready' : 'In progress'}</span></div><h1>{project.brief.title || 'New campaign'}</h1></div><button className="text-button" onClick={() => setModal('edit')}>Edit brief</button></div>
        {error && !agentOpen && !modal && !quote && <div className="notice page-alert" role="alert"><span>{error}</span><button className="icon-button small" aria-label="Dismiss error" onClick={() => setError('')}><X size={16} /></button></div>}
        {notice && <div className="notice page-alert" role="status"><span>{notice}</span><button className="icon-button small" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
        <div className="hero-zone"><Preview brief={project.brief} artwork={artwork} format={format} onFormat={setFormat} onExpand={() => setModal('preview')} /></div>
        <ProgressStrip current={currentStage} onStep={openStep} />
        <footer className="campaign-footer"><span>On-chain settlement <strong className={settledUnits > 0n ? 'money' : ''}>{settledAmount} U</strong></span><div><button className="text-button" onClick={() => setModal('receipts')}>Receipts</button><button className="text-button" disabled={Boolean(exporting)} onClick={() => setModal('export')}>Export</button></div></footer>
      </main>
    </div>
    {!agentOpen && !modal && !quote && <button className="agent-fab" aria-label="Open Agent" onClick={() => setAgentOpen(true)}><Message size={23} /></button>}
    {agentOpen && !modal && !quote && <AgentPanel key={project.id} project={project} orders={projectOrders} busy={busy || agentThinking} configured={agentConfigured} error={error} onSend={text => void sendMessage(text)} onClear={clearChat} onAction={action => void agentAction(action)} onClose={() => setAgentOpen(false)} />}
    {modal === 'edit' && <Modal title="Edit brief" onClose={() => setModal(null)}><BriefEditor brief={project.brief} onChange={updateBrief} onReview={saveBrief} busy={busy} />{error && <p className="notice mt-4" role="alert">{error}</p>}</Modal>}
    {modal === 'direction' && project.plan && <Modal title="Creative direction" onClose={() => setModal(null)}><DirectionEditor plan={project.plan} stale={stale} onChange={updatePlan} onConfirm={confirmCopy} />{error && <p className="notice mt-4" role="alert">{error}</p>}</Modal>}
    {modal === 'narration' && <Modal title="Campaign narration" onClose={() => setModal(null)}><NarrationPanel key={project.id} script={project.plan?.narration || ''} uploaded={uploaded} paidAudio={paidAudio} stale={stale} providerUnavailable={providerUnavailable} onSave={saveNarration} onRemove={removeNarration} onReview={() => project.plan ? setModal('direction') : setModal('edit')} onPurchase={() => { setModal(null); setAgentOpen(true); void purchase('voice') }} /></Modal>}
    {modal === 'export' && <Modal title="Export campaign" onClose={() => setModal(null)}><div className="export-options">
      <p className="text-muted">{artwork ? 'Your campaign files, with purchased artwork.' : 'Layout previews. Original artwork has not been purchased.'}</p>
      <p className="footnote">{audioSource ? 'Narration source: ' + audioSource : 'Voiceover is optional. Your animated promo exports without audio unless you add narration.'}</p>
      <button className="text-button" onClick={() => setModal('narration')}>Optional voiceover</button>
      <button className="button primary" disabled={Boolean(exporting)} onClick={() => void exportAsset('zip')}>{exporting === 'zip' ? 'Packing…' : 'Download campaign ZIP'}<ArrowDownToLine size={16} /></button>
      <button className="text-button" disabled={Boolean(exporting)} onClick={() => void exportAsset('png')}>Export {format} PNG</button>
      <button className="text-button" disabled={Boolean(exporting)} onClick={() => void exportAsset('video')}>{exporting === 'video' ? 'Rendering ' + progress + '%' : audio ? 'Export narrated promo · WebM' : artwork ? 'Export animated promo · WebM' : 'Export silent preview · WebM'}</button>
      <button className="text-button" onClick={() => project.plan ? setModal('direction') : (setModal(null), setAgentOpen(true))}>Review copy</button>
      {(voiceOrder?.assetUrl || uploaded) && !audio && <p className="footnote">The script changed. The previous voiceover is omitted from new exports.</p>}
      {exporting === 'video' && <p className="footnote" role="status">Keep this tab visible while the video records.</p>}
      {error && <p className="notice" role="alert">{error}</p>}
    </div></Modal>}
    {modal === 'wallet' && <WalletDialog wallet={wallet} onRefresh={refreshWallet} onClose={() => setModal(null)} />}
    {quote && <PurchaseDialog quote={quote} onClose={() => { if (!busy) setQuote(undefined) }} onApprove={() => void approve()} busy={busy} />}
    {modal === 'preview' && <Modal className="preview-modal" title={project.brief.title} onClose={() => setModal(null)}><div className="expanded-poster"><Poster brief={project.brief} format={format} artwork={artwork} /></div><p className="footnote mt-3">{artwork ? 'Purchased artwork with editable event details.' : 'Local layout preview. Original artwork has not been purchased.'}</p></Modal>}
    {modal === 'guide' && <Modal title="A small brief. A whole campaign." onClose={() => setModal(null)}><ol className="setup-steps"><li><span>1</span><div><strong>Make the brief yours</strong><p>Set your event details and budget. Explore the poster and story layouts free.</p></div></li><li><span>2</span><div><strong>Commission the creative direction</strong><p>Connect Binance Agentic Wallet. Review a live Xona quote; the agent buys a concept, art direction, script, and caption using B402.</p></div></li><li><span>3</span><div><strong>Approve the production</strong><p>Review the direction and commission original artwork. Your campaign is ready once the copy is reviewed and artwork is delivered. Voiceover is optional; each B402 purchase requires exact-price approval.</p></div></li><li><span>4</span><div><strong>Leave with real files</strong><p>Download your PNG poster, story, caption, and receipts as a ZIP. Export the animated promo separately as WebM, with optional narration. Date and venue edits reuse your artwork.</p></div></li></ol><p className="footnote">This workspace runs on your computer. Keep the local service running for wallet connection and production. Live delivery depends on Binance and Xona; preview exports work without a funded wallet.</p><a className="text-button mt-5" href="https://github.com/binance/binance-skills-hub/tree/main/skills/binance-web3/binance-agentic-wallet" target="_blank" rel="noreferrer">Official Binance Wallet documentation <ArrowUpRight size={15} /></a></Modal>}
    {modal === 'receipts' && <Modal title="Campaign receipts" onClose={() => setModal(null)}>
      {!projectOrders.length ? <div className="empty-state"><ReceiptText size={32} /><h3>No purchases yet</h3><p>Layout previews are free. Paid services will appear here with their real delivery and settlement status.</p></div> : <div className="receipt-list">{projectOrders.map(order => <article key={order.id}><div className="flex justify-between gap-3"><strong>{serviceNames[order.service]}</strong><strong className="money">{order.amount} U</strong></div><p>{new Date(order.createdAt).toLocaleString()} · {order.status === 'uncertain' ? 'Needs review' : order.status}</p><p>{order.settled ? 'Settlement reported by provider' : 'On-chain settlement not confirmed'}</p>{order.error && <p className="receipt-error">{order.error}</p>}{order.settlement && <a className="text-button" href={'https://bscscan.com/tx/' + order.settlement} target="_blank" rel="noreferrer">View transaction <ArrowUpRight size={14} /></a>}{order.recoverable && order.status === 'uncertain' && <button className="text-button mt-2" disabled={busy} onClick={() => {
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
