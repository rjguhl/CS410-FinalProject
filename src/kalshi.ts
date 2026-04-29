export type KalshiMarket = {
  ticker: string;
  event_ticker?: string;
  series_ticker?: string;
  title?: string;
  subtitle?: string;
  yes_sub_title?: string;
  no_sub_title?: string;
  strike_type?: string;
  floor_strike?: number;
  cap_strike?: number;
  custom_strike?: Record<string, string>;
  status?: string;
  category?: string;
  yes_bid?: number;
  yes_ask?: number;
  yes_bid_dollars?: string;
  yes_ask_dollars?: string;
  last_price?: number;
  last_price_dollars?: string;
  volume?: number;
  volume_dollars?: string;
  volume_fp?: string;
  volume_24h?: number;
  volume_24h_dollars?: string;
  volume_24h_fp?: string;
  liquidity?: number;
  liquidity_dollars?: string;
  liquidity_fp?: string;
  open_interest?: number;
  open_interest_fp?: string;
  close_time?: string;
  expiration_time?: string;
};

export type KalshiSeries = {
  ticker: string;
  title: string;
  category?: string;
  tags?: string[];
};

type TagsByCategoriesResponse = {
  tags_by_categories: Record<string, string[] | null>;
};

type MarketsResponse = {
  markets: KalshiMarket[];
  cursor?: string;
};

type SeriesResponse = {
  series: KalshiSeries[];
};

const API_BASE = import.meta.env.VITE_KALSHI_API_BASE || '/api/kalshi';
const responseCache = new Map<string, unknown>();

async function kalshiGet<T>(path: string, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);

  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });

  const cacheKey = url.toString();

  if (responseCache.has(cacheKey)) {
    return responseCache.get(cacheKey) as T;
  }

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Kalshi request failed: ${response.status}`);
  }

  const data = (await response.json()) as T;
  responseCache.set(cacheKey, data);

  return data;
}

export async function getTagsByCategories() {
  const data = await kalshiGet<TagsByCategoriesResponse>('/search/tags_by_categories');
  return data.tags_by_categories;
}

export async function getMarkets(params: {
  limit?: number;
  cursor?: string;
  seriesTicker?: string;
  status?: 'open' | 'closed' | 'settled';
} = {}) {
  const data = await kalshiGet<MarketsResponse>('/markets', {
    status: params.status ?? 'open',
    limit: params.limit ?? 100,
    cursor: params.cursor,
    series_ticker: params.seriesTicker,
  });

  return data;
}

export async function getSeriesByTag(tag: string) {
  const data = await kalshiGet<SeriesResponse>('/series', { tags: tag });
  return data.series;
}

export function marketProbability(market: KalshiMarket) {
  const cents = market.yes_ask ?? market.yes_bid ?? market.last_price;
  const dollarValue =
    market.yes_ask_dollars ?? market.yes_bid_dollars ?? market.last_price_dollars;

  if (typeof cents === 'number') {
    return cents > 1 ? cents : cents * 100;
  }

  if (dollarValue) {
    return Number.parseFloat(dollarValue) * 100;
  }

  return null;
}

export function formatMoney(value?: number) {
  if (!value || Number.isNaN(value)) {
    return '$0';
  }

  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(1)}K`;
  }

  return `$${value.toFixed(0)}`;
}

export function marketVolume(market: KalshiMarket) {
  return firstNumber([
    market.volume,
    market.volume_24h,
    market.volume_dollars,
    market.volume_24h_dollars,
    market.volume_fp,
    market.volume_24h_fp,
    market.open_interest_fp,
  ]);
}

export function marketLiquidity(market: KalshiMarket) {
  return firstNumber([market.liquidity, market.liquidity_dollars, market.liquidity_fp]);
}

function firstNumber(values: Array<number | string | undefined>) {
  for (const value of values) {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const parsed = Number.parseFloat(value.replace(/[$,]/g, ''));

      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

export function formatCloseDate(value?: string) {
  if (!value) {
    return 'No close date';
  }

  return new Intl.DateTimeFormat('en', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(value));
}
