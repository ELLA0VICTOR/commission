import { ArrowUpRight, BookOpen, ChevronRight, FolderClosed, Plus, WalletCards } from '../ui/Icons'
import type { Project, Wallet } from '../../../shared/domain'
export function Sidebar({ projects, activeId, onSelect, onCreate, onWallet, wallet, onGuide }: {
  projects: Project[]; activeId: string; onSelect: (id: string) => void; onCreate: () => void;
  onWallet: () => void; wallet: Wallet; onGuide: () => void;
}) {
  return <aside className="sidebar">
    <a href="/" className="brand" aria-label="Commission home"><img src="/favicon.svg" width="32" height="32" alt="" /><span>commission<span className="brand-accent">.</span></span></a>
    <div className="workspace-switch"><span className="studio-avatar">S</span><div><strong>Studio</strong><span>Independent workspace</span></div><ChevronRight size={15} /></div>
    <div className="flex items-center justify-between px-3 mb-3"><span className="text-xs font-semibold text-muted">Campaigns</span><button aria-label="New campaign" className="icon-button small" onClick={onCreate}><Plus size={16} /></button></div>
    <nav aria-label="Campaigns" className="space-y-1">
      {projects.length > 4 ? <select className="campaign-select" aria-label="Switch campaign" value={activeId} onChange={event => onSelect(event.target.value)}>{projects.map(project => <option key={project.id} value={project.id}>{project.brief.title || 'Untitled campaign'}</option>)}</select> : projects.map(project => <button key={project.id} className={'nav-item ' + (activeId === project.id ? 'active' : '')} aria-current={activeId === project.id ? 'page' : undefined} onClick={() => onSelect(project.id)}>
        <FolderClosed size={17} /><span>{project.brief.title || 'Untitled campaign'}</span>{activeId === project.id && <span className="active-dot" />}
      </button>)}
    </nav>
    <button className="new-project" onClick={onCreate}><Plus size={16} /> New campaign</button>
    <div className="sidebar-bottom">
      <div className="studio-note"><span className="mini-symbol">c.</span><p>A small brief.<br />A whole campaign.</p><span>Your agent handles production.<br />You keep creative control.</span></div>
      <button className="nav-item" onClick={onGuide}><BookOpen size={17} /> How it works <ArrowUpRight size={14} className="ml-auto" /></button>
      <button className="wallet-nav" onClick={onWallet}><WalletCards size={18} /><span>{wallet.connected ? 'Wallet connected' : 'Connect your wallet'}<small>{wallet.connected ? 'Binance Agentic Wallet' : 'Powered by Binance'}</small></span><span className={'status-dot ' + (wallet.connected ? 'connected' : '')} /></button>
      <div className="sidebar-foot"><span>Commission Studio</span><span>Local workspace</span></div>
    </div>
  </aside>
}
