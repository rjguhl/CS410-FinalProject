"""
Alpha-Seeker: Sentiment Scoring (VADER)
========================================
Scores each Reddit post in the cleaned dataset with VADER sentiment,
producing per-post compound / positive / negative / neutral scores plus
a simple bullish / bearish / neutral label.
"""

import json
import os
import pandas as pd
from vaderSentiment.vaderSentiment import SentimentIntensityAnalyzer

# ============================================================
# Config
# ============================================================
INPUT_FILE = "data/processed/reddit_posts_cleaned.csv"
OUTPUT_FILE = "data/processed/reddit_posts_sentiment.csv"
DAILY_OUTPUT_FILE = "data/processed/sentiment_daily.csv"
# Vite serves files in public/ at the dashboard's root URL,
# so the React app can fetch this directly with `fetch('/sentiment_summary.json')`.
SUMMARY_OUTPUT_FILE = "public/sentiment_summary.json"

# VADER's standard cutoff for the compound score.
# >= +0.05 -> positive, <= -0.05 -> negative, else neutral.
# We rename to bullish/bearish to match the project's market-signal framing.
POS_THRESHOLD = 0.05
NEG_THRESHOLD = -0.05

# Column to score. We deliberately use the raw full_text (title + selftext)
# rather than cleaned_text, because VADER relies on capitalization,
# punctuation, and emojis as sentiment cues.
TEXT_COLUMN = "full_text"


def score_text(analyzer: SentimentIntensityAnalyzer, text: str) -> dict:
    """Run VADER on a single string and return its 4 polarity scores."""
    if not isinstance(text, str) or not text.strip():
        return {"sent_compound": 0.0, "sent_pos": 0.0, "sent_neg": 0.0, "sent_neu": 0.0}
    s = analyzer.polarity_scores(text)
    return {
        "sent_compound": s["compound"],
        "sent_pos": s["pos"],
        "sent_neg": s["neg"],
        "sent_neu": s["neu"],
    }


def label_from_compound(compound: float) -> str:
    """Map a VADER compound score to a market-style label."""
    if compound >= POS_THRESHOLD:
        return "bullish"
    if compound <= NEG_THRESHOLD:
        return "bearish"
    return "neutral"


def add_sentiment(df: pd.DataFrame, text_column: str = TEXT_COLUMN) -> pd.DataFrame:
    """Add VADER sentiment columns and a bullish/bearish/neutral label to df."""
    if text_column not in df.columns:
        raise KeyError(
            f"Expected column '{text_column}' in input CSV. "
            f"Found: {list(df.columns)}"
        )

    analyzer = SentimentIntensityAnalyzer()
    scores = df[text_column].apply(lambda t: score_text(analyzer, t))
    score_df = pd.DataFrame(list(scores), index=df.index)

    out = pd.concat([df, score_df], axis=1)
    out["sent_label"] = out["sent_compound"].apply(label_from_compound)
    return out


def backfill_category(df: pd.DataFrame, text_column: str = TEXT_COLUMN) -> pd.DataFrame:
    """
    Best-effort: tag posts with a category by matching keywords against
    `text_column`, using the same shared keyword map (src/categories.py)
    that the collector uses. Lets us run the dashboard pipeline on data
    collected before the collector started writing the `category` column.
    First match wins, mirroring the collector's dedup logic.
    """
    from categories import keyword_to_category

    mapping = keyword_to_category()
    keywords = sorted(mapping.keys(), key=len, reverse=True)  # longest match first

    def infer(text):
        if not isinstance(text, str):
            return ""
        lower = text.lower()
        for kw in keywords:
            if kw.lower() in lower:
                return mapping[kw]
        return ""

    df = df.copy()
    df["category"] = df[text_column].apply(infer)
    return df


def aggregate_summary(df: pd.DataFrame) -> dict:
    """
    One overall-period summary per Kalshi category. Used by the dashboard
    (read from public/sentiment_summary.json) to show real sentiment
    instead of the placeholder values.
    """
    if "category" not in df.columns:
        return {}
    work = df[df["category"].notna() & (df["category"] != "")]
    out = {}
    for cat, grp in work.groupby("category"):
        labels = grp["sent_label"].value_counts(normalize=True)
        out[str(cat)] = {
            "n_posts": int(len(grp)),
            "mean_compound": round(float(grp["sent_compound"].mean()), 3),
            "bullish_share": round(float(labels.get("bullish", 0.0)), 3),
            "bearish_share": round(float(labels.get("bearish", 0.0)), 3),
            "neutral_share": round(float(labels.get("neutral", 0.0)), 3),
        }
    return out


def aggregate_daily(df: pd.DataFrame) -> pd.DataFrame:
    """
    Aggregate per-post sentiment into a daily series per Kalshi category.
    This is the shape the Kalshi/Polymarket price series will join against:
        merge(prices_daily, sentiment_daily, on=["date", "category"])

    Returns one row per (date, category) with:
        n_posts, mean_compound, bullish_share, bearish_share, neutral_share
    """
    if "category" not in df.columns:
        raise KeyError(
            "No 'category' column in input. Re-run the collector and "
            "re-run the preprocessing notebook so each post is tagged "
            "with its Kalshi category."
        )
    if "created_date" not in df.columns:
        raise KeyError("Expected a 'created_date' column from the collector.")

    work = df.copy()
    work["date"] = pd.to_datetime(work["created_date"]).dt.date

    # Drop posts that didn't get a category (e.g. legacy rows from older runs)
    work = work[work["category"].notna() & (work["category"] != "")]

    grouped = work.groupby(["date", "category"])
    daily = grouped.agg(
        n_posts=("sent_compound", "size"),
        mean_compound=("sent_compound", "mean"),
    ).reset_index()

    label_share = (
        work.groupby(["date", "category"])["sent_label"]
        .value_counts(normalize=True)
        .unstack(fill_value=0.0)
        .reset_index()
    )
    for col in ("bullish", "bearish", "neutral"):
        if col not in label_share.columns:
            label_share[col] = 0.0
    label_share = label_share.rename(columns={
        "bullish": "bullish_share",
        "bearish": "bearish_share",
        "neutral": "neutral_share",
    })

    out = daily.merge(label_share, on=["date", "category"], how="left")
    out = out.sort_values(["date", "category"]).reset_index(drop=True)
    return out


def print_summary(df: pd.DataFrame):
    """Print a quick sanity-check summary of the scored dataset."""
    print("\n" + "=" * 60)
    print("SENTIMENT SUMMARY")
    print("=" * 60)
    print(f"\nTotal posts scored: {len(df)}")

    print("\nLabel distribution:")
    counts = df["sent_label"].value_counts()
    for label, n in counts.items():
        print(f"  {label:8s}: {n} ({100 * n / len(df):.1f}%)")

    print(f"\nCompound score stats:")
    print(f"  Mean:   {df['sent_compound'].mean():+.3f}")
    print(f"  Median: {df['sent_compound'].median():+.3f}")
    print(f"  Min:    {df['sent_compound'].min():+.3f}")
    print(f"  Max:    {df['sent_compound'].max():+.3f}")

    if "subreddit" in df.columns:
        print("\nMean compound by subreddit:")
        by_sub = df.groupby("subreddit")["sent_compound"].agg(["mean", "count"])
        by_sub = by_sub.sort_values("mean", ascending=False)
        for sub, row in by_sub.iterrows():
            print(f"  r/{sub:20s} mean={row['mean']:+.3f}  n={int(row['count'])}")


def main():
    if not os.path.exists(INPUT_FILE):
        raise FileNotFoundError(
            f"Input file not found: {INPUT_FILE}\n"
            f"Run the collector + preprocessing notebook first."
        )

    print(f"Loading {INPUT_FILE} ...")
    df = pd.read_csv(INPUT_FILE)
    print(f"Loaded {len(df)} rows.")

    # Back-fill category if the input was produced before the collector
    # started tagging posts. Logs how many rows got matched so you know
    # whether to trust the per-category numbers.
    if "category" not in df.columns or df["category"].isna().all() or (df["category"] == "").all():
        print("No 'category' column populated — back-filling from text via categories.py ...")
        df = backfill_category(df)
        n_tagged = (df["category"] != "").sum()
        print(f"  Tagged {n_tagged}/{len(df)} posts ({100 * n_tagged / max(len(df), 1):.1f}%).")

    print(f"Scoring sentiment on column '{TEXT_COLUMN}' with VADER ...")
    scored = add_sentiment(df)

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    scored.to_csv(OUTPUT_FILE, index=False)
    print(f"Wrote {OUTPUT_FILE}")

    print_summary(scored)

    if "category" in scored.columns:
        print("\nAggregating daily sentiment per category ...")
        daily = aggregate_daily(scored)
        daily.to_csv(DAILY_OUTPUT_FILE, index=False)
        print(f"Wrote {DAILY_OUTPUT_FILE}  ({len(daily)} (date, category) rows)")

        summary = aggregate_summary(scored)
        os.makedirs(os.path.dirname(SUMMARY_OUTPUT_FILE), exist_ok=True)
        with open(SUMMARY_OUTPUT_FILE, "w") as f:
            json.dump(summary, f, indent=2)
        print(f"Wrote {SUMMARY_OUTPUT_FILE}  ({len(summary)} categories, for the dashboard)")
    else:
        print(
            "\nSkipping daily aggregation: no 'category' column in input. "
            "Re-run the collector to tag posts with Kalshi categories."
        )

    print("\nDone.")


if __name__ == "__main__":
    main()
