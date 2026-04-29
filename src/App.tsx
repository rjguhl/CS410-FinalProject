import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ArrowUpRight,
  Gauge,
  Loader2,
  MessageSquareText,
  Network,
  Search,
} from 'lucide-react';
import {
  formatCloseDate,
  formatMoney,
  getMarkets,
  getSeriesByTag,
  getTagsByCategories,
  marketProbability,
  marketVolume,
  type KalshiMarket,
  type KalshiSeries,
} from './kalshi';

type SignalDirection = 'Bullish YES' | 'Bearish YES' | 'Neutral';

type MarketSignal = {
  direction: SignalDirection;
  edge: number;
  relatedPosts: number;
  topics: string[];
  confidence: number;
};

// One row per Kalshi category, written by src/sentiment.py to
// public/sentiment_summary.json. The keys (e.g. "Inflation", "Fed")
// match Kalshi series tag names so we can join directly.
type CategorySentiment = {
  n_posts: number;
  mean_compound: number;
  bullish_share: number;
  bearish_share: number;
  neutral_share: number;
};
type SentimentSummary = Record<string, CategorySentiment>;

type MarketGroup = {
  key: string;
  title: string;
  tags?: string[];
  markets: KalshiMarket[];
  totalVolume: number;
  earliestClose: number;
  isLoaded: boolean;
  isLoading: boolean;
};

const ECONOMICS_CATEGORY = 'Economics';
const SERIES_PAGE_SIZE = 9;
const MIN_FILTER_LOADING_MS = 1000;

const SEARCH_ALIASES: Record<string, string[]> = {
  inflation: ['inflation', 'cpi', 'pce', 'truflation', 'prices', 'price index'],
  fed: ['fed', 'fomc', 'rate', 'rates', 'federal reserve'],
  jobs: ['jobs', 'employment', 'unemployment', 'payrolls', 'labor'],
  gas: ['gas', 'gasoline', 'oil', 'energy'],
  bitcoin: ['bitcoin', 'btc', 'crypto'],
  ethereum: ['ethereum', 'eth', 'crypto'],
};

function App() {
  const [query, setQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [tagsByCategory, setTagsByCategory] = useState<Record<string, string[] | null>>({});
  const [seriesItems, setSeriesItems] = useState<KalshiSeries[]>([]);
  const [marketsBySeries, setMarketsBySeries] = useState<Record<string, KalshiMarket[]>>({});
  const [selectedGroupKey, setSelectedGroupKey] = useState('');
  const [loadingGroups, setLoadingGroups] = useState<Set<string>>(new Set());
  const [emptySeries, setEmptySeries] = useState<Set<string>>(new Set());
  const [visibleSeriesCount, setVisibleSeriesCount] = useState(SERIES_PAGE_SIZE);
  const [checkedSeries, setCheckedSeries] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [sentimentSummary, setSentimentSummary] = useState<SentimentSummary>({});

  useEffect(() => {
    let isMounted = true;

    fetch('/sentiment_summary.json')
      .then((response) => (response.ok ? response.json() : {}))
      .then((data: SentimentSummary) => {
        if (isMounted) {
          setSentimentSummary(data);
        }
      })
      .catch(() => {
        // No sentiment file yet — cards will show "No data" until sentiment.py is run.
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    getTagsByCategories()
      .then((tags) => {
        if (isMounted) {
          setTagsByCategory(tags);
        }
      })
      .catch(() => {
        if (isMounted) {
          setTagsByCategory({});
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadMarkets() {
      setIsLoading(true);
      setError('');
      const startedAt = Date.now();

      try {
        const loadedSeries = await fetchSeriesForSelection({
          tag: selectedTag,
          tagsByCategory,
        });

        if (isMounted) {
          setSeriesItems(dedupeSeries(loadedSeries));
          setMarketsBySeries({});
          setSelectedGroupKey('');
          setLoadingGroups(new Set());
          setEmptySeries(new Set());
          setVisibleSeriesCount(SERIES_PAGE_SIZE);
          setCheckedSeries(new Set());
        }
      } catch (loadError) {
        if (isMounted) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load series. Kalshi may be rate-limiting requests.',
          );
          setSeriesItems([]);
          setMarketsBySeries({});
          setEmptySeries(new Set());
          setCheckedSeries(new Set());
        }
      } finally {
        if (isMounted) {
          const elapsed = Date.now() - startedAt;
          const remainingDelay = Math.max(MIN_FILTER_LOADING_MS - elapsed, 0);

          if (remainingDelay > 0) {
            await delay(remainingDelay);
          }

          setIsLoading(false);
        }
      }
    }

    loadMarkets();

    return () => {
      isMounted = false;
    };
  }, [selectedTag, tagsByCategory]);

  const categoryTags = useMemo(() => {
    return tagsByCategory[ECONOMICS_CATEGORY] ?? [];
  }, [tagsByCategory]);

  const filteredSeries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const hasSentiment = Object.keys(sentimentSummary).length > 0;

    return seriesItems.filter((series) => {
        if (emptySeries.has(series.ticker)) {
          return false;
        }

        // Hide series that don't match any category we have sentiment for.
        // Skipped while sentiment is still loading so the page doesn't flash empty.
        if (hasSentiment && !(series.tags ?? []).some((tag) => sentimentSummary[tag])) {
          return false;
        }

        if (!normalizedQuery) {
          return true;
        }

        const queryTerms = expandQuery(normalizedQuery);
        const searchableText = [
          series.title,
          series.ticker,
          series.category,
          ...(series.tags ?? []),
          ...(marketsBySeries[series.ticker] ?? []).map((market) => `${market.title ?? ''} ${market.subtitle ?? ''}`),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();

        return textMatchesAny(searchableText, queryTerms);
      });
  }, [emptySeries, marketsBySeries, query, seriesItems, sentimentSummary]);

  const marketGroups = useMemo(() => {
    return buildSeriesGroups(filteredSeries, marketsBySeries, loadingGroups);
  }, [filteredSeries, loadingGroups, marketsBySeries]);
  const visibleMarketGroups = marketGroups.slice(0, visibleSeriesCount);

  useEffect(() => {
    if (isLoading || filteredSeries.length === 0) {
      return;
    }

    let isMounted = true;
    const visibleSeriesKeys = filteredSeries
      .slice(0, visibleSeriesCount)
      .map((series) => series.ticker)
      .filter((seriesTicker) => {
        return (
          !checkedSeries.has(seriesTicker) &&
          !marketsBySeries[seriesTicker] &&
          !loadingGroups.has(seriesTicker) &&
          !emptySeries.has(seriesTicker)
        );
      });

    if (visibleSeriesKeys.length === 0) {
      return;
    }

    async function checkVisibleSeries() {
      for (const seriesTicker of visibleSeriesKeys) {
        setCheckedSeries((current) => new Set(current).add(seriesTicker));
        setLoadingGroups((current) => new Set(current).add(seriesTicker));

        try {
          const response = await getMarkets({ seriesTicker, limit: 100 });

          if (!isMounted) {
            return;
          }

          if (response.markets.length === 0) {
            setEmptySeries((current) => new Set(current).add(seriesTicker));
          } else {
            setMarketsBySeries((current) => ({
              ...current,
              [seriesTicker]: response.markets,
            }));
          }
        } catch {
          if (isMounted) {
            setEmptySeries((current) => new Set(current).add(seriesTicker));
          }
        } finally {
          if (isMounted) {
            setLoadingGroups((current) => {
              const next = new Set(current);
              next.delete(seriesTicker);
              return next;
            });
          }
        }

        await delay(100);
      }
    }

    checkVisibleSeries();

    return () => {
      isMounted = false;
    };
  }, [filteredSeries, isLoading, visibleSeriesCount]);

  async function toggleGroup(groupKey: string) {
    setSelectedGroupKey(groupKey);

    if (!marketsBySeries[groupKey] && !loadingGroups.has(groupKey)) {
      setLoadingGroups((current) => new Set(current).add(groupKey));

      try {
        const response = await getMarkets({ seriesTicker: groupKey, limit: 100 });

        if (response.markets.length === 0) {
          setEmptySeries((current) => new Set(current).add(groupKey));
          setSelectedGroupKey('');
        }

        setMarketsBySeries((current) => ({
          ...current,
          [groupKey]: response.markets,
        }));
      } catch {
        setMarketsBySeries((current) => ({
          ...current,
          [groupKey]: [],
        }));
      } finally {
        setLoadingGroups((current) => {
          const next = new Set(current);
          next.delete(groupKey);
          return next;
        });
      }
    }
  }

  const selectedGroup = marketGroups.find((group) => group.key === selectedGroupKey);

  return (
    <main className="page-shell">
      <header className="site-header">
        <a className="brand" href="/">
          <span className="brand-mark" />
          <span>Alpha-Seeker</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#topics">Topics</a>
          <a href="#signals">Signal Layer</a>
          <a href="https://docs.kalshi.com/api-reference/market/get-markets" target="_blank">
            Kalshi API
          </a>
        </nav>
      </header>

      <section className="hero">
        <h1>Search Kalshi Markets</h1>

        <div className="search-panel">
          <div className="search-box">
            <Search size={22} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter loaded markets, tickers, topics, or events..."
              type="search"
            />
          </div>

          {categoryTags.length > 0 && (
            <div className="topic-pills hero-topic-pills" aria-label="Economics topics">
              <button
                className={selectedTag === '' ? 'active' : ''}
                onClick={() => setSelectedTag('')}
                type="button"
              >
                All topics
              </button>
              {categoryTags.map((tag) => (
                <button
                  className={selectedTag === tag ? 'active' : ''}
                  key={tag}
                  onClick={() => setSelectedTag(tag)}
                  type="button"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

        </div>
      </section>

      <section className="market-section" id="markets">
        {isLoading && (
          <div className="empty-state">
            <Loader2 className="spin" />
            <p>Loading Kalshi markets...</p>
          </div>
        )}

        {!isLoading && error && (
          <div className="empty-state error">
            <p>{error}</p>
            <span>Try a different category or run the app through Vite so the API proxy is available.</span>
          </div>
        )}

        {!isLoading && !error && visibleMarketGroups.length === 0 && (
          <div className="empty-state">
            <p>No markets matched your search.</p>
            <span>Try removing search terms or switching to another Economics topic.</span>
          </div>
        )}

        {!isLoading && !error && visibleMarketGroups.length > 0 && (
          <>
            <div className="series-grid">
              {visibleMarketGroups.map((group) => (
                <SeriesGroupCard
                  group={group}
                  key={group.key}
                  onToggle={() => toggleGroup(group.key)}
                />
              ))}
            </div>
            {visibleSeriesCount < marketGroups.length && (
              <button
                className="load-more-button"
                onClick={() => setVisibleSeriesCount((count) => count + SERIES_PAGE_SIZE)}
                type="button"
              >
                Show More Topics
              </button>
            )}
          </>
        )}
      </section>

      {selectedGroup && (
        <MarketModal
          group={selectedGroup}
          onClose={() => setSelectedGroupKey('')}
          sentimentSummary={sentimentSummary}
        />
      )}

      <section className="signal-layer" id="signals">
        <div className="signal-copy">
          <p className="section-kicker">Alpha-Seeker Signal Layer Preview</p>
          <h2>Connect market prices to Reddit text signals</h2>
          <p>
            Each market card includes a preview of the future pipeline: matched Reddit
            posts, topic-model keywords, and a sentiment edge compared with Kalshi&apos;s
            implied probability.
          </p>
        </div>
        <div className="signal-explainer-grid">
          <ExplainerCard
            icon={<MessageSquareText />}
            title="Related Reddit Posts"
            text="Find posts whose title/body matches the market topic, category, ticker keywords, or event wording."
          />
          <ExplainerCard
            icon={<Network />}
            title="Topic Keywords"
            text="Use LDA/topic modeling to summarize what the matched discussion is actually about."
          />
          <ExplainerCard
            icon={<Gauge />}
            title="Sentiment Edge"
            text="Compare sentiment-implied probability with Kalshi probability to flag disagreement."
          />
        </div>
      </section>
    </main>
  );
}

function SeriesGroupCard({
  group,
  onToggle,
}: {
  group: MarketGroup;
  onToggle: () => void;
}) {
  return (
    <article className="series-group">
      <button className="series-group-button" onClick={onToggle} type="button">
        <div>
          <span className="series-kicker">{group.key}</span>
          <h3>{formatDisplayTitle(group.title)}</h3>
          <p>
            {group.isLoading
              ? 'Checking for active markets...'
              : group.isLoaded
              ? `${group.markets.length} active markets · closes ${formatGroupClose(group.earliestClose)}`
              : 'Click expand to load active markets'}
          </p>
        </div>
        <div className="series-summary">
          <span className="expand-indicator">Expand</span>
        </div>
      </button>
    </article>
  );
}

function MarketModal({
  group,
  onClose,
  sentimentSummary,
}: {
  group: MarketGroup;
  onClose: () => void;
  sentimentSummary: SentimentSummary;
}) {
  // Pick the first series tag that has sentiment data. Tag names like
  // "Inflation", "Fed", "Housing" come straight from Kalshi and double as
  // the category keys in sentiment_summary.json — no lookup table needed.
  const matchedCategory = (group.tags ?? []).find((tag) => sentimentSummary[tag]);
  const sentiment = matchedCategory ? sentimentSummary[matchedCategory] : undefined;

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        aria-labelledby="market-modal-title"
        className="market-modal"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="modal-header">
          <div>
            <span className="series-kicker">{group.key}</span>
            <h2 id="market-modal-title">{formatDisplayTitle(group.title)}</h2>
            <p>
              {group.isLoading
                ? 'Checking for active markets...'
                : `${group.markets.length} active markets · closes ${formatGroupClose(group.earliestClose)}`}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} type="button">
            Close
          </button>
        </div>

        {group.isLoading && <div className="series-loading">Loading active markets...</div>}

        {!group.isLoading && group.markets.length === 0 && (
          <div className="series-loading">No active markets found for this series.</div>
        )}

        {!group.isLoading && group.markets.length > 0 && (
          <div className="modal-market-grid">
            {group.markets.map((market) => (
              <MarketCard
                key={market.ticker}
                market={market}
                seriesTicker={group.key}
                seriesTitle={group.title}
                sentiment={sentiment}
                sentimentCategory={matchedCategory}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ExplainerCard({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
  return (
    <article className="explainer-card">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function MarketCard({
  market,
  seriesTicker,
  seriesTitle,
  sentiment,
  sentimentCategory,
}: {
  market: KalshiMarket;
  seriesTicker?: string;
  seriesTitle?: string;
  sentiment?: CategorySentiment;
  sentimentCategory?: string;
}) {
  const probability = marketProbability(market);
  const kalshiUrl = marketUrl(market, seriesTitle, seriesTicker);
  const signal = sentiment ? buildSignalFromSentiment(sentiment, sentimentCategory) : null;
  const marketDetail = marketOutcomeDetail(market);

  return (
    <article className="market-card">
      <div className="card-topline">
        <span>Kalshi</span>
        <small>{market.series_ticker ?? market.event_ticker ?? 'Market'}</small>
      </div>
      <h3>{formatDisplayTitle(market.title || market.subtitle || market.ticker)}</h3>
      <p>{marketDetail}</p>

      <div className="market-metrics">
        <Metric label="Yes" value={probability === null ? 'N/A' : `${probability.toFixed(0)}%`} />
        <Metric label="Vol" value={formatMoney(marketVolume(market))} />
      </div>

      {signal ? (
        <div className={`signal-preview ${signalClass(signal.direction)}`}>
          <div className="signal-preview-header">
            <span>Reddit signal (VADER)</span>
            <strong>{signal.direction}</strong>
          </div>
          <div className="signal-edge-row">
            <span>Sentiment edge</span>
            <strong>{formatEdge(signal.edge)}</strong>
          </div>
          <div className="signal-mini-grid">
            <div>
              <span>Posts</span>
              <strong>{signal.relatedPosts}</strong>
            </div>
            <div>
              <span>Confidence</span>
              <strong>{signal.confidence}%</strong>
            </div>
          </div>
          <div className="topic-tags" aria-label="Sentiment category">
            {signal.topics.map((topic) => (
              <span key={topic}>{topic}</span>
            ))}
          </div>
        </div>
      ) : (
        <div className="signal-preview signal-neutral">
          <div className="signal-preview-header">
            <span>Reddit signal</span>
            <strong>No data</strong>
          </div>
          <p style={{ margin: 0, fontSize: '0.85em', opacity: 0.7 }}>
            No matching Reddit sentiment for this category yet.
          </p>
        </div>
      )}

      <div className="card-footer">
        <span>Closes {formatCloseDate(market.close_time || market.expiration_time)}</span>
        <a href={kalshiUrl} target="_blank">
          View <ArrowUpRight size={14} />
        </a>
      </div>
    </article>
  );
}

function marketUrl(market: KalshiMarket, seriesTitle?: string, seriesTicker?: string) {
  const resolvedSeriesTicker = seriesTicker ?? market.series_ticker;
  const resolvedEventTicker = market.event_ticker ?? eventTickerFromMarketTicker(market.ticker);

  if (resolvedSeriesTicker && resolvedEventTicker && seriesTitle) {
    return `https://kalshi.com/markets/${resolvedSeriesTicker.toLowerCase()}/${slugify(seriesTitle)}/${resolvedEventTicker.toLowerCase()}`;
  }

  return `https://kalshi.com/markets/${market.ticker.toLowerCase()}`;
}

function eventTickerFromMarketTicker(ticker: string) {
  const parts = ticker.split('-');

  if (parts.length <= 2) {
    return ticker;
  }

  return parts.slice(0, -1).join('-');
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function formatDisplayTitle(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return value;
  }

  const isAllCaps = trimmed === trimmed.toUpperCase() && /[A-Z]/.test(trimmed);
  const isAllLower = trimmed === trimmed.toLowerCase() && /[a-z]/.test(trimmed);

  if (!isAllCaps && !isAllLower) {
    return preserveKnownAcronyms(trimmed);
  }

  return preserveKnownAcronyms(
    trimmed
      .toLowerCase()
      .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
      .replace(/\b(Vs)\b/g, 'vs.'),
  );
}

function preserveKnownAcronyms(value: string) {
  const replacements: Record<string, string> = {
    Ai: 'AI',
    Btc: 'BTC',
    Cpi: 'CPI',
    Ecb: 'ECB',
    Eth: 'ETH',
    Fed: 'Fed',
    Fomc: 'FOMC',
    Gdp: 'GDP',
    Imf: 'IMF',
    Ipo: 'IPO',
    Pce: 'PCE',
    Sec: 'SEC',
    Ucla: 'UCLA',
    Us: 'US',
    Usa: 'USA',
  };

  return value.replace(/\b[A-Za-z]{2,5}\b/g, (word) => replacements[word] ?? word);
}

function marketOutcomeDetail(market: KalshiMarket) {
  const detail = [
    market.subtitle,
    market.yes_sub_title,
    market.no_sub_title,
    formatStrike(market),
    market.ticker,
  ].find((value) => value && value !== market.title);

  return detail ?? market.ticker;
}

function formatStrike(market: KalshiMarket) {
  if (market.floor_strike !== undefined && market.cap_strike !== undefined) {
    return `Outcome range: ${market.floor_strike} to ${market.cap_strike}`;
  }

  if (market.floor_strike !== undefined) {
    return `Outcome above ${market.floor_strike}`;
  }

  if (market.cap_strike !== undefined) {
    return `Outcome below ${market.cap_strike}`;
  }

  if (market.custom_strike) {
    const values = Object.values(market.custom_strike).filter(Boolean);
    return values.length > 0 ? values[0] : undefined;
  }

  return undefined;
}

// Build a market signal from real per-category VADER sentiment.
// - direction: standard VADER thresholds on the mean compound score
// - edge:      compound mapped linearly to a +/- percentage-point shift
//              (compound 1.0 -> +50pp, compound -0.2 -> -10pp, etc.)
// - posts:     n_posts in that category over the collection window
// - confidence: share of non-neutral posts (polarity strength), in %
function buildSignalFromSentiment(s: CategorySentiment, category?: string): MarketSignal {
  const compound = s.mean_compound;
  const direction: SignalDirection =
    compound >= 0.05 ? 'Bullish YES' : compound <= -0.05 ? 'Bearish YES' : 'Neutral';
  const edge = Math.round(compound * 50);
  const confidence = Math.round((1 - s.neutral_share) * 100);
  const topics = [
    category ?? 'Reddit',
    `compound ${compound.toFixed(2)}`,
    `${Math.round(s.bullish_share * 100)}% bull / ${Math.round(s.bearish_share * 100)}% bear`,
  ];

  return {
    direction,
    edge,
    relatedPosts: s.n_posts,
    confidence,
    topics,
  };
}

function signalClass(direction: SignalDirection) {
  if (direction === 'Bullish YES') {
    return 'signal-bullish';
  }

  if (direction === 'Bearish YES') {
    return 'signal-bearish';
  }

  return 'signal-neutral';
}

function formatEdge(edge: number) {
  if (edge > 0) {
    return `+${edge}pp`;
  }

  return `${edge}pp`;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

async function fetchSeriesForSelection({
  tag,
  tagsByCategory,
}: {
  tag: string;
  tagsByCategory: Record<string, string[] | null>;
}) {
  if (tag) {
    return getSeriesByTag(tag);
  }

  const categoryTags = tagsByCategory[ECONOMICS_CATEGORY] ?? [];

  if (categoryTags.length === 0) {
    return [];
  }

  const seriesByTag: KalshiSeries[][] = [];

  for (const categoryTag of categoryTags) {
    try {
      seriesByTag.push(await getSeriesByTag(categoryTag));
      await delay(100);
    } catch {
      // Some Kalshi category/tag combinations can rate-limit or have no active markets.
      // Keep loading the rest of the page instead of failing the whole result set.
    }
  }

  return seriesByTag.flat();
}

function dedupeSeries(series: KalshiSeries[]) {
  return Array.from(new Map(series.map((item) => [item.ticker, item])).values());
}

function buildSeriesGroups(
  series: KalshiSeries[],
  marketsBySeries: Record<string, KalshiMarket[]>,
  loadingGroups: Set<string>,
) {
  return series.map((item) => {
    const loadedMarkets = marketsBySeries[item.ticker];
    const sortedMarkets = [...(loadedMarkets ?? [])];

    return {
      key: item.ticker,
      title: item.title,
      tags: item.tags,
      markets: sortedMarkets,
      totalVolume: sortedMarkets.reduce((sum, market) => sum + marketVolume(market), 0),
      earliestClose:
        sortedMarkets.length > 0
          ? Math.min(...sortedMarkets.map((market) => dateValue(market.close_time || market.expiration_time)))
          : Number.MAX_SAFE_INTEGER,
      isLoaded: loadedMarkets !== undefined,
      isLoading: loadingGroups.has(item.ticker) && loadedMarkets === undefined,
    };
  });
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function dateValue(value?: string) {
  return value ? new Date(value).getTime() : Number.MAX_SAFE_INTEGER;
}

function formatGroupClose(value: number) {
  if (value === Number.MAX_SAFE_INTEGER) {
    return 'No close date';
  }

  return formatCloseDate(new Date(value).toISOString());
}

function expandQuery(query: string) {
  if (!query) {
    return [];
  }

  const aliases = Object.entries(SEARCH_ALIASES).find(([key, values]) => {
    return key.includes(query) || values.some((value) => value.includes(query) || query.includes(value));
  });

  return aliases ? aliases[1] : [query];
}

function textMatchesAny(text: string, values: string[]) {
  return values.some((value) => text.includes(value));
}

export default App;
