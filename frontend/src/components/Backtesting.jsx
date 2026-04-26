import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Cell } from 'recharts'

const REC_COLOR = { 'BUY YES': 'text-green-400', 'BUY NO': 'text-red-400', 'HOLD': 'text-slate-400' }
const REC_BG = { 'BUY YES': 'bg-green-900/30 border-green-800', 'BUY NO': 'bg-red-900/30 border-red-800', 'HOLD': 'bg-slate-800 border-slate-700' }

function AccuracyMeter({ value, label }) {
  const color = value >= 0.7 ? '#22c55e' : value >= 0.5 ? '#f59e0b' : '#ef4444'
  const pct = Math.round(value * 100)
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col items-center">
      <p className="text-xs text-slate-500 uppercase tracking-widest mb-3">{label}</p>
      <div className="relative w-24 h-24">
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#1e293b" strokeWidth="3" />
          <circle cx="18" cy="18" r="15.9" fill="none" stroke={color} strokeWidth="3"
            strokeDasharray={`${pct} 100`} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-bold text-white">{pct}%</span>
        </div>
      </div>
    </div>
  )
}

export default function Backtesting({ data }) {
  const { historical_signals } = data

  const resolved = historical_signals.filter(s => s.resolved)
  const total = resolved.length
  const correct = resolved.filter(s => s.correct).length
  const accuracy = total ? correct / total : 0

  // Accuracy by category
  const byCat = {}
  resolved.forEach(s => {
    if (!byCat[s.category]) byCat[s.category] = { correct: 0, total: 0 }
    byCat[s.category].total++
    if (s.correct) byCat[s.category].correct++
  })
  const catRows = Object.entries(byCat).map(([cat, v]) => ({ cat, acc: v.correct / v.total, correct: v.correct, total: v.total }))

  // Calibration data: signal_strength vs correct (1/0) — shows if stronger signals are more accurate
  const scatterData = resolved.map(s => ({
    strength: s.signal_strength,
    result: s.correct ? 1 : 0,
    title: s.title,
    correct: s.correct,
  }))

  // Accuracy in "high conviction" (strength > 60) vs low
  const highConv = resolved.filter(s => s.signal_strength > 60)
  const highAcc = highConv.length ? highConv.filter(s => s.correct).length / highConv.length : null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">Backtesting</h2>
        <p className="text-slate-400 text-sm mt-1">
          Compare past Alpha-Seeker recommendations against resolved Kalshi contract outcomes
        </p>
      </div>

      {total === 0 ? (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
          <p className="text-slate-400 text-sm">No resolved contracts yet. Results will appear here after contracts close.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <AccuracyMeter value={accuracy} label="Overall Accuracy" />
            {highAcc !== null && <AccuracyMeter value={highAcc} label="High Conviction (>60%)" />}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-center">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Resolved</p>
              <p className="text-3xl font-bold text-white">{total}</p>
              <p className="text-xs text-slate-500 mt-1">contracts evaluated</p>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 flex flex-col justify-center">
              <p className="text-xs text-slate-500 uppercase tracking-widest mb-1">Correct</p>
              <p className="text-3xl font-bold text-green-400">{correct}</p>
              <p className="text-xs text-slate-500 mt-1">of {total} calls</p>
            </div>
          </div>

          {/* Accuracy by category */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Accuracy by Category</h3>
            <div className="space-y-3">
              {catRows.map(({ cat, acc, correct, total }) => {
                const pct = Math.round(acc * 100)
                const color = acc >= 0.7 ? 'bg-green-500' : acc >= 0.5 ? 'bg-yellow-500' : 'bg-red-500'
                return (
                  <div key={cat}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300">{cat}</span>
                      <span className="text-slate-400">{correct}/{total} · {pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Signal strength calibration */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-1">Signal Strength vs Outcome</h3>
            <p className="text-xs text-slate-500 mb-4">
              Dots above line = correct · Does higher signal strength predict accuracy?
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <ScatterChart margin={{ left: 0, right: 20 }}>
                <XAxis type="number" dataKey="strength" name="Signal Strength" tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[20, 90]} label={{ value: 'Signal Strength (%)', fill: '#64748b', fontSize: 11, position: 'insideBottom', offset: -4 }} />
                <YAxis type="number" dataKey="result" name="Correct" tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[-0.2, 1.2]} ticks={[0, 1]} tickFormatter={v => v === 1 ? 'Correct' : 'Wrong'} />
                <ReferenceLine y={0.5} stroke="#475569" strokeDasharray="4 4" />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }}
                  content={({ payload }) => {
                    if (!payload?.length) return null
                    const d = payload[0].payload
                    return (
                      <div className="text-xs p-2">
                        <p className="text-white font-medium mb-1">{d.title}</p>
                        <p className="text-slate-400">Strength: {d.strength}%</p>
                        <p className={d.correct ? 'text-green-400' : 'text-red-400'}>{d.correct ? 'Correct' : 'Wrong'}</p>
                      </div>
                    )
                  }}
                />
                <Scatter data={scatterData} r={6}>
                  {scatterData.map((entry, i) => (
                    <Cell key={i} fill={entry.correct ? '#22c55e' : '#ef4444'} fillOpacity={0.85} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {/* Historical record */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Resolved Contracts</h3>
            <div className="space-y-2">
              {resolved.map(s => (
                <div key={s.id} className={`flex items-center gap-4 p-3 rounded-lg border ${REC_BG[s.recommendation]}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{s.title}</p>
                    <div className="flex gap-3 mt-0.5 text-xs text-slate-500">
                      <span>{s.category}</span>
                      <span>·</span>
                      <span>Strength: {s.signal_strength.toFixed(1)}%</span>
                      <span>·</span>
                      <span>Edge: {s.edge > 0 ? '+' : ''}{(s.edge * 100).toFixed(0)}pp</span>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-3">
                    <span className={`text-xs font-bold ${REC_COLOR[s.recommendation]}`}>{s.recommendation}</span>
                    <span className="text-slate-600">→</span>
                    <span className="text-xs text-slate-400">Resolved: <span className="text-white font-semibold uppercase">{s.outcome}</span></span>
                    <span className={`text-sm font-bold ${s.correct ? 'text-green-400' : 'text-red-400'}`}>
                      {s.correct ? '✓' : '✗'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}