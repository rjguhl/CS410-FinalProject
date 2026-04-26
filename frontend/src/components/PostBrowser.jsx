import { useState, useMemo } from 'react'

const SENT_COLOR = { bullish: 'text-green-400', bearish: 'text-red-400', neutral: 'text-slate-400' }
const SENT_BG = { bullish: 'bg-green-900/40 border-green-800', bearish: 'bg-red-900/40 border-red-800', neutral: 'bg-slate-800 border-slate-700' }

export default function PostBrowser({ data }) {
  const { posts, topics } = data
  const [search, setSearch] = useState('')
  const [sentiment, setSentiment] = useState('all')
  const [topic, setTopic] = useState('all')
  const [sort, setSort] = useState('score')

  const topicMap = Object.fromEntries(topics.map(t => [t.id, t.label]))

  const filtered = useMemo(() => {
    let res = posts.filter(p => {
      if (search && !p.title.toLowerCase().includes(search.toLowerCase())) return false
      if (sentiment !== 'all' && p.sentiment_label !== sentiment) return false
      if (topic !== 'all' && p.topic_id !== Number(topic)) return false
      return true
    })
    if (sort === 'score') res = [...res].sort((a, b) => b.score - a.score)
    else if (sort === 'date') res = [...res].sort((a, b) => b.created_date.localeCompare(a.created_date))
    else if (sort === 'compound') res = [...res].sort((a, b) => a.compound - b.compound)
    return res
  }, [posts, search, sentiment, topic, sort])

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-white">Post Browser</h2>
        <p className="text-slate-400 text-sm mt-1">{filtered.length} of {posts.length} posts</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search titles..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 w-56"
        />
        <select value={sentiment} onChange={e => setSentiment(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500">
          <option value="all">All Sentiment</option>
          <option value="bullish">Bullish</option>
          <option value="bearish">Bearish</option>
          <option value="neutral">Neutral</option>
        </select>
        <select value={topic} onChange={e => setTopic(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500">
          <option value="all">All Topics</option>
          {topics.map(t => <option key={t.id} value={t.id}>T{t.id}: {t.label}</option>)}
        </select>
        <select value={sort} onChange={e => setSort(e.target.value)}
          className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-300 focus:outline-none focus:border-indigo-500">
          <option value="score">Sort: Score</option>
          <option value="date">Sort: Newest</option>
          <option value="compound">Sort: Most Bearish</option>
        </select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="text-slate-500 text-sm py-8 text-center">No posts match your filters.</p>
        )}
        {filtered.map(post => (
          <div key={post.id} className={`border rounded-xl p-4 ${SENT_BG[post.sentiment_label]}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <a href={post.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-medium text-white hover:text-indigo-400 transition-colors line-clamp-2">
                  {post.title}
                </a>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-slate-500">
                  <span className="text-slate-400">r/{post.subreddit}</span>
                  <span>·</span>
                  <span>{post.created_date}</span>
                  <span>·</span>
                  <span>↑ {post.score.toLocaleString()}</span>
                  <span>·</span>
                  <span>{post.num_comments} comments</span>
                  <span>·</span>
                  <span className="text-indigo-400">T{post.topic_id}: {topicMap[post.topic_id]}</span>
                </div>
              </div>
              <div className="shrink-0 text-right">
                <p className={`text-xs font-bold uppercase ${SENT_COLOR[post.sentiment_label]}`}>{post.sentiment_label}</p>
                <p className="text-lg font-bold text-white">{post.compound.toFixed(2)}</p>
                <p className="text-xs text-slate-500">compound</p>
                {post.weighted_compound != null && (
                  <p className="text-xs text-indigo-400 mt-0.5">{post.weighted_compound.toFixed(2)} wtd</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}