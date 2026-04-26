import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const PALETTE = ['#6366f1','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ef4444','#ec4899','#14b8a6','#f97316','#84cc16']

export default function TopicExplorer({ data }) {
  const { topics } = data
  const [selected, setSelected] = useState(topics[0])

  const postCounts = topics.map(t => ({ name: `T${t.id}`, count: t.post_count, id: t.id }))

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Topic Explorer</h2>
        <p className="text-slate-400 text-sm mt-1">LDA k=10 topics · click a bar to inspect</p>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Posts per Topic</h3>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={postCounts} onClick={e => e?.activePayload && setSelected(topics[e.activePayload[0].payload.id])}>
            <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} />
            <Tooltip
              contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
              formatter={(v, _, props) => [v, topics[props.payload.id]?.label]}
            />
            <Bar dataKey="count" radius={[4, 4, 0, 0]} cursor="pointer">
              {postCounts.map((entry) => (
                <Cell key={entry.id} fill={selected?.id === entry.id ? '#ffffff' : PALETTE[entry.id % PALETTE.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {selected && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 md:col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: PALETTE[selected.id % PALETTE.length] + '33', color: PALETTE[selected.id % PALETTE.length] }}>
                Topic {selected.id}
              </span>
              <h3 className="text-lg font-semibold text-white">{selected.label}</h3>
              <span className="ml-auto text-sm text-slate-400">{selected.post_count} posts</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={selected.top_words} layout="vertical" margin={{ left: 10, right: 40 }}>
                <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 0.08]} tickFormatter={v => v.toFixed(3)} />
                <YAxis type="category" dataKey="word" tick={{ fill: '#e2e8f0', fontSize: 12 }} width={70} />
                <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} formatter={v => v.toFixed(4)} />
                <Bar dataKey="weight" fill={PALETTE[selected.id % PALETTE.length]} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {topics.map(t => (
          <button
            key={t.id}
            onClick={() => setSelected(t)}
            className={`text-left p-3 rounded-xl border transition-all ${selected?.id === t.id ? 'border-indigo-500 bg-indigo-950' : 'border-slate-800 bg-slate-900 hover:border-slate-600'}`}
          >
            <p className="text-xs font-bold mb-1" style={{ color: PALETTE[t.id % PALETTE.length] }}>T{t.id}</p>
            <p className="text-xs text-slate-300 leading-snug">{t.label}</p>
            <p className="text-xs text-slate-500 mt-1">{t.post_count} posts</p>
          </button>
        ))}
      </div>
    </div>
  )
}