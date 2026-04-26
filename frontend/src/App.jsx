import { useState, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import Overview from './components/Overview'
import TopicExplorer from './components/TopicExplorer'
import SentimentPanel from './components/SentimentPanel'
import MarketSignals from './components/MarketSignals'
import PostBrowser from './components/PostBrowser'
import Backtesting from './components/Backtesting'

export default function App() {
  const [page, setPage] = useState('overview')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch('/data/analysis.json')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(e => { setError(e.message); setLoading(false) })
  }, [])

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-slate-400">
      Loading analysis data...
    </div>
  )

  if (error) return (
    <div className="flex h-screen items-center justify-center bg-slate-950 text-red-400">
      Failed to load data: {error}
    </div>
  )

  const pages = { overview: Overview, topics: TopicExplorer, sentiment: SentimentPanel, signals: MarketSignals, posts: PostBrowser, backtest: Backtesting }
  const Page = pages[page]

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <Sidebar current={page} onNavigate={setPage} />
      <main className="flex-1 overflow-y-auto p-6">
        <Page data={data} />
      </main>
    </div>
  )
}