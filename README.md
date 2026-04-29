# Alpha-Seeker

A text-mining pipeline for alpha discovery in prediction markets (Kalshi & Polymarket).

**CS 410: Text Information Systems — Spring 2026, UIUC**

## Team
- Lawrence Wang (lw41@illinois.edu)
- Youngbo Sohn (yssohn2@illinois.edu)
- RJ Guhl (richardjohnguhl@gmail.com)

## Overview

Alpha-Seeker retrieves and analyzes Reddit discussions related to macroeconomic and political events, then aligns extracted sentiment and topic signals with prediction market contract prices to identify potential mispricings.

## Data Collection

We use the [Arctic Shift API](https://arctic-shift.photon-reddit.com/) to collect archived Reddit posts. No API key required.

```bash
python src/reddit_collector.py
```

This collects posts from relevant subreddits (r/economics, r/wallstreetbets, r/politics, etc.) matching keywords related to Kalshi/Polymarket contracts (Fed rate, CPI, inflation, election, etc.).

## Pipeline

1. **Data Collection** — Retrieve Reddit posts via Arctic Shift API
2. **Preprocessing** — Tokenization, stopword removal, lemmatization
3. **Topic Modeling** — LDA via gensim to discover latent themes
4. **Sentiment Scoring** — VADER sentiment analysis on post text
5. **Market Alignment** — Compare signals with Kalshi contract prices
6. **Dashboard** — Streamlit visualization of signals vs. prices
