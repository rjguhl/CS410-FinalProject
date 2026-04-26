import { useState } from 'react'
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, Cell, ReferenceLine } from 'recharts'

const REC_STYLE = {
  'BUY YES': { bg: 'bg-green-900/40', text: 'text-green-400', border: 'border-green-800' },
  'BUY NO':  { bg: 'bg-red-900/40',   text: 'text-red-400',   border: 'border-red-800'   },
  'HOLD':    { bg: 'bg-slate-800',    text: 'text-slate-400', border: 'border-slate-700' },
}
const SIG_COLOR = { bullish: '#22c55e', bearish: '#ef4444', neutral: '#94a3b8' }

function EdgeBar({ edge }) {
  const pct = Math.min(Math.abs(edge) * 100, 50)
  const pos = edge > 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-500 w-8 text-right">{pos ? '' : ''}</span>
      <div className="flex-1 flex h-3 bg-slate-800 rounded-full overflow-hidden">
        <div className="w-1/2 flex justify-end">
          {!pos && <div className="h-full rounded-l-full bg-red-500" style={{ width: `${pct * 2}%` }} />}
        </div>
        <div className="w-px bg-slate-600" />
        <div className="w-1/2">
          {pos && <div className="h-full rounded-r-full bg-green-500" style={{ width: `${pct * 2}%` }} />}
        </div>
      </div>
      <span className={`text-xs font-bold w-14 ${pos ? 'text-green-400' : 'text-red-400'}`}>
        {pos ? '+' : ''}{(edge * 100).toFixed(0)}pp
      </span>
    </div>
  )
}

export default function MarketSignals({ data }) {
  const { market_signals } = data
  const [selected, setSelected] = useState(market_signals[0])

  const edgeData = market_signals.map(s => ({
    name: s.id.split('-')[0],
    edge: parseFloat((s.edge * 100).toFixed(1)),
    full: s.title,
    rec: s.recommendation,
  }))

  const radarData = selected ? [
    { metric: 'Bearish Posts',   value: selected.bearish_posts   },
    { metric: 'Bullish Posts',   value: selected.bullish_posts   },
    { metric: 'Neutral Posts',   value: selected.neutral_posts   },
    { metric: 'Signal Strength', value: selected.signal_strength },
    { metric: 'Related Posts',   value: selected.related_posts   },
  ] : []

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Market Signals</h2>
        <p className="text-slate-400 text-sm mt-1">
          Reddit sentiment vs Kalshi market price · <span className="text-green-400">positive edge = sentiment more bullish than market</span>
        </p>
      </div>

      {/* Edge chart — this is the core "alpha" view */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-1">Sentiment Edge vs Market Price</h3>
        <p className="text-xs text-slate-500 mb-4">
          Edge = (sentiment-implied probability) − (Kalshi price) · large |edge| = potential mispricing
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={edgeData} onClick={e => e?.activePayload && setSelected(market_signals.find(s => s.title === e.activePayload[0].payload.full))}>
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `${v}pp`} />
            <ReferenceLine y={0} stroke="#475569" />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              formatter={(v, _, props) => [`${v > 0 ? '+' : ''}${v}pp`, props.payload.full]}
            />
            <Bar dataKey="edge" radius={[4, 4, 0, 0]} cursor="pointer">
              {edgeData.map((entry, i) => (
                <Cell key={i} fill={entry.edge > 0 ? '#22c55e' : entry.edge < 0 ? '#ef4444' : '#94a3b8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {market_signals.map(sig => {
          const rec = REC_STYLE[sig.recommendation] ?? REC_STYLE['HOLD']
          const isActive = selected?.id === sig.id
          return (
            <button
              key={sig.id}
              onClick={() => setSelected(sig)}
              className={`text-left p-4 rounded-xl border transition-all ${isActive ? 'border-indigo-500 bg-indigo-950/50' : `${rec.bg} ${rec.border} border hover:border-indigo-600`}`}
            >
              <div className="flex justify-between items-start gap-2 mb-2">
                <p className="font-semibold text-white text-sm leading-snug">{sig.title}</p>
                <span className={`shrink-0 text-xs font-bold px-2 py-0.5 rounded border ${rec.text} ${rec.border} bg-transparent`}>
                  {sig.recommendation}
                </span>
              </div>

              <div className="flex items-center gap-3 text-xs text-slate-400 mb-3">
                <span className="text-slate-500">{sig.category}</span>
                <span>·</span>
                <span>{sig.related_posts} posts</span>
                <span>·</span>
                <span style={{ color: SIG_COLOR[sig.signal] }} className="font-semibold uppercase">{sig.signal}</span>
              </div>

              <EdgeBar edge={sig.edge} />

              <div className="flex items-center gap-3 mt-3">
                <div className="flex-1 bg-slate-800 rounded-full h-2">
                  <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${sig.price * 100}%` }} />
                </div>
                <span className="text-sm font-bold text-white">{(sig.price * 100).toFixed(0)}¢</span>
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-slate-500">Kalshi price</span>
                <span className="text-indigo-400">Strength: {sig.signal_strength.toFixed(1)}%</span>
              </div>
            </button>
          )
        })}
      </div>

      {selected && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-1">{selected.title}</h3>
          <div className="flex flex-wrap gap-4 text-xs text-slate-500 mb-4">
            <span>Resolves: {selected.resolution_date}</span>
            <span>·</span>
            <span>Raw compound: <span style={{ color: SIG_COLOR[selected.signal] }}>{selected.avg_compound.toFixed(3)}</span></span>
            <span>·</span>
            <span>Score-weighted: <span style={{ color: SIG_COLOR[selected.signal] }}>{selected.weighted_compound.toFixed(3)}</span></span>
            <span>·</span>
            <span>Keywords: <span className="text-indigo-300">{selected.keywords?.join(', ')}</span></span>
          </div>
          <div className="flex flex-col md:flex-row gap-6 items-center">
            <ResponsiveContainer width="100%" height={220}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#334155" />
                <PolarAngleAxis dataKey="metric" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Radar dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-3 gap-3 md:w-64 shrink-0">
              {[
                { label: 'Bullish', val: selected.bullish_posts, color: 'text-green-400' },
                { label: 'Bearish', val: selected.bearish_posts, color: 'text-red-400'   },
                { label: 'Neutral', val: selected.neutral_posts, color: 'text-slate-400' },
              ].map(({ label, val, color }) => (
                <div key={label} className="bg-slate-800 rounded-lg p-3 text-center">
                  <p className={`text-xl font-bold ${color}`}>{val}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}