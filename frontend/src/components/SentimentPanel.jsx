import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, LineChart, Line, ReferenceLine } from 'recharts'

export default function SentimentPanel({ data }) {
  const { sentiment_by_category, sentiment_over_time } = data

  const catData = Object.entries(sentiment_by_category).map(([cat, s]) => ({
    name: cat,
    bullish: s.bullish,
    bearish: s.bearish,
    neutral: s.neutral,
    avg: s.avg_compound,
  }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Sentiment Analysis</h2>
        <p className="text-slate-400 text-sm mt-1">VADER compound scores · bullish ≥ 0.05 · bearish ≤ −0.05</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Sentiment by Category</h3>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={catData}>
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 12, color: '#94a3b8' }} />
            <Bar dataKey="bullish" fill="#22c55e" stackId="a" />
            <Bar dataKey="neutral" fill="#94a3b8" stackId="a" />
            <Bar dataKey="bearish" fill="#ef4444" stackId="a" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Average Compound Score Over Time</h3>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={sentiment_over_time}>
            <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={d => d.slice(5)} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[-0.5, 0.5]} tickFormatter={v => v.toFixed(2)} />
            <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={v => v.toFixed(3)} />
            <ReferenceLine y={0} stroke="#475569" strokeDasharray="4 4" />
            <ReferenceLine y={0.05} stroke="#22c55e" strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine y={-0.05} stroke="#ef4444" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Line type="monotone" dataKey="avg_compound" stroke="#6366f1" strokeWidth={2} dot={{ r: 3, fill: '#6366f1' }} />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex gap-4 mt-2 text-xs text-slate-500">
          <span className="text-green-500">— ≥ 0.05 bullish threshold</span>
          <span className="text-red-500">— ≤ −0.05 bearish threshold</span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {catData.map(c => {
          const total = c.bullish + c.bearish + c.neutral
          const lean = c.avg < -0.05 ? 'bearish' : c.avg > 0.05 ? 'bullish' : 'neutral'
          const leanColor = lean === 'bullish' ? 'text-green-400' : lean === 'bearish' ? 'text-red-400' : 'text-slate-400'
          return (
            <div key={c.name} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex justify-between items-start mb-3">
                <p className="font-semibold text-white">{c.name}</p>
                <span className={`text-xs font-bold uppercase ${leanColor}`}>{lean}</span>
              </div>
              <p className="text-2xl font-bold text-white mb-1">{c.avg.toFixed(3)}</p>
              <p className="text-xs text-slate-500 mb-3">avg compound · {total} posts</p>
              <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
                <div className="bg-green-500" style={{ width: `${(c.bullish / total) * 100}%` }} />
                <div className="bg-slate-500" style={{ width: `${(c.neutral / total) * 100}%` }} />
                <div className="bg-red-500" style={{ width: `${(c.bearish / total) * 100}%` }} />
              </div>
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span className="text-green-500">{c.bullish}</span>
                <span>{c.neutral}</span>
                <span className="text-red-500">{c.bearish}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}