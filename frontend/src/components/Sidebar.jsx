const NAV = [
  { id: 'overview',  label: 'Overview',        icon: '▦' },
  { id: 'topics',    label: 'Topic Explorer',   icon: '◈' },
  { id: 'sentiment', label: 'Sentiment',        icon: '◉' },
  { id: 'signals',   label: 'Market Signals',   icon: '◈' },
  { id: 'backtest',  label: 'Backtesting',      icon: '◎' },
  { id: 'posts',     label: 'Post Browser',     icon: '☰' },
]

export default function Sidebar({ current, onNavigate }) {
  return (
    <aside className="w-56 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col py-6 px-4">
      <div className="mb-8">
        <h1 className="text-lg font-bold text-white tracking-tight">Alpha-Seeker</h1>
        <p className="text-xs text-slate-500 mt-0.5">Reddit → Kalshi Signals</p>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left
              ${current === id
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
          >
            <span className="text-base leading-none">{icon}</span>
            {label}
          </button>
        ))}
      </nav>
    </aside>
  )
}