import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts'

const SENT_COLORS = { bullish: '#22c55e', bearish: '#ef4444', neutral: '#94a3b8' }
const REC_COLOR = { 'BUY YES': 'text-green-400 border-green-700 bg-green-900/30', 'BUY NO': 'text-red-400 border-red-700 bg-red-900/30', 'HOLD': 'text-slate-400 border-slate-600 bg-slate-800' }

function StatCard({ label, value, sub }) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-3xl font-bold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  )
}

export default function Overview({ data }) {
  const { metadata, posts_per_subreddit, sentiment_over_time, market_signals } = data

  const sentPie = [
    { name: 'Bullish', value: metadata.bullish_pct },
    { name: 'Bearish', value: metadata.bearish_pct },
    { name: 'Neutral', value: metadata.neutral_pct },
  ]

  const subData = Object.entries(posts_per_subreddit)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({ name, count }))

  // Top signals = highest |edge| and not HOLD
  const topSignals = [...market_signals]
    .filter(s => s.recommendation !== 'HOLD')
    .sort((a, b) => Math.abs(b.edge) - Math.abs(a.edge))
    .slice(0, 3)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Overview</h2>
        <p className="text-slate-400 text-sm mt-1">{metadata.date_range} · {metadata.subreddits.length} subreddits</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Posts" value={metadata.total_posts.toLocaleString()} />
        <StatCard label="LDA Topics" value={metadata.topics} sub={`Coherence: ${metadata.coherence_score}`} />
        <StatCard label="Avg Compound" value={metadata.avg_compound.toFixed(3)} sub="VADER score (−1 to +1)" />
        <StatCard label="Bearish Lean" value={`${metadata.bearish_pct}%`} sub={`Bullish: ${metadata.bullish_pct}%`} />
      </div>

      {/* Top signals */}
      <div>
        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-3">Highest-Conviction Signals</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {topSignals.map(sig => {
            const rc = REC_COLOR[sig.recommendation]
            const edgePos = sig.edge > 0
            return (
              <div key={sig.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex justify-between items-start gap-2 mb-2">
                  <p className="text-sm font-medium text-white leading-snug">{sig.title}</p>
                  <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded border ${rc}`}>
                    {sig.recommendation}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <div className="flex-1 flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">Edge</span>
                    <span className={`text-sm font-bold ${edgePos ? 'text-green-400' : 'text-red-400'}`}>
                      {edgePos ? '+' : ''}{(sig.edge * 100).toFixed(0)}pp
                    </span>
                  </div>
                  <div className="flex-1 flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">Market</span>
                    <span className="text-sm font-bold text-white">{(sig.price * 100).toFixed(0)}¢</span>
                  </div>
                  <div className="flex-1 flex items-center gap-1.5">
                    <span className="text-xs text-slate-500">Strength</span>
                    <span className="text-sm font-bold text-indigo-400">{sig.signal_strength.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Sentiment Distribution</h3>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={sentPie} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value"
                label={({ name, value }) => `${name} ${value}%`} labelLine={false}>
                {sentPie.map(entry => <Cell key={entry.name} fill={SENT_COLORS[entry.name.toLowerCase()]} />)}
              </Pie>
              <Tooltip formatter={v => `${v}%`} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Posts by Subreddit</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={subData} layout="vertical" margin={{ left: 10, right: 20 }}>
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={100} />
              <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
              <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Sentiment Over Time (weekly)</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={sentiment_over_time} margin={{ left: 0, right: 0 }}>
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
            <Bar dataKey="bullish" stackId="a" fill="#22c55e" />
            <Bar dataKey="neutral"  stackId="a" fill="#94a3b8" />
            <Bar dataKey="bearish"  stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}