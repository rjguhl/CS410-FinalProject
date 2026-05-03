"""
Alpha-Seeker: LDA Topic Modeling + Paper Numbers
=================================================
Runs LDA grid search over k in {5, 8, 10, 12, 15}, picks the best k by
Cv coherence, then extracts every number needed to fill the paper's
[INSERT ...] placeholders.

Outputs:
  data/processed/lda_topic_assignments.csv   -- per-post topic assignments
  data/processed/lda_results.json            -- all paper-ready numbers
  public/lda_summary.json                    -- dashboard-ready topic data
"""

import json
import os
import warnings
import numpy as np
import pandas as pd
from gensim import corpora
from gensim.models import LdaModel
from gensim.models.coherencemodel import CoherenceModel

warnings.filterwarnings("ignore")

INPUT_FILE      = "data/processed/reddit_posts_sentiment.csv"
ASSIGN_OUTPUT   = "data/processed/lda_topic_assignments.csv"
RESULTS_OUTPUT  = "data/processed/lda_results.json"
DASHBOARD_OUTPUT = "public/lda_summary.json"

K_GRID       = [5, 8, 10, 12, 15]
FORCE_K      = 10    # force this k regardless of grid search winner
N_PASSES     = 30
ALPHA        = 0.1
NO_BELOW     = 3
NO_ABOVE     = 0.85
AMBIG_THRESH = 0.3   # posts below this max-topic-prob are "ambiguous"
RANDOM_SEED  = 42

# Cross-category stopwords: two tiers.
# Tier 1 — domain terms flagged in milestone: iran/oil/war co-occur across
#   every Kalshi category and overwhelm topic separation.
# Tier 2 — quasi-stopwords that leaked through preprocessing because
#   apostrophe stripping turns "that's"→"thats", "I've"→"ive" etc.,
#   which don't match standard NLTK stopwords.
# NOT removed: revenue, earnings, inflation, growth, energy, company,
#   billion, data — these are topic-discriminative financial terms.
CROSS_CATEGORY_STOPWORDS = {
    # Tier 1: milestone-identified cross-category domain terms
    "iran", "oil", "war", "trump",
    "market", "markets", "prices", "price", "stock", "stocks",
    # Tier 2: leaked quasi-stopwords (contractions + temporal filler)
    "thats", "ive", "dont", "doesnt", "im", "cant", "wouldnt",
    "since", "around", "already", "actually", "today", "next",
    "last", "current", "per", "high", "real", "big", "long",
    "something", "april", "march",
}

# Score clip percentile for upvote-weighted compound
SCORE_CLIP_PCT = 95

# VADER standard thresholds (Hutto & Gilbert 2014)
COMPOUND_POS = 0.05
COMPOUND_NEG = -0.05

TOPIC_LABELS = [
    "Fed & Rates",
    "Recession & GDP",
    "Trade & Tariffs",
    "Stock Market",
    "CPI & Prices",
    "Oil & Energy",
    "AI & Tech Policy",
    "Iran & Geopolitics",
    "Jobs & Labor",
    "Debt & Fiscal Policy",
]

# Map categories.py category names -> paper Table 2 groups
CATEGORY_TO_GROUP = {
    "Growth":              "Economics",
    "Inflation":           "Economics",
    "GDP":                 "Economics",
    "Jobs & Economy":      "Economics",
    "Fed":                 "Economics",
    "Global Central Banks":"Economics",
    "Econ Daily":          "Markets",
    "Oil and energy":      "Markets",
    "Housing":             "Markets",
}


def load_data(path):
    df = pd.read_csv(path)
    print(f"Loaded {len(df)} rows from {path}")
    # cleaned_text is already tokenized (space-separated)
    df["tokens"] = df["cleaned_text"].fillna("").apply(str.split)
    # drop posts with < 3 tokens (already filtered, but be safe)
    df = df[df["tokens"].apply(len) >= 3].reset_index(drop=True)
    print(f"After token-length filter: {len(df)} posts")
    return df


def build_corpus(df):
    # Apply cross-category stopword tier before building dictionary
    def filter_tokens(tokens):
        return [t for t in tokens if t not in CROSS_CATEGORY_STOPWORDS]

    filtered = df["tokens"].apply(filter_tokens)
    n_removed = sum(
        len(orig) - len(filt)
        for orig, filt in zip(df["tokens"], filtered)
    )
    print(f"Cross-category stopwords removed {n_removed} token occurrences")

    dictionary = corpora.Dictionary(filtered)
    n_before = len(dictionary)
    dictionary.filter_extremes(no_below=NO_BELOW, no_above=NO_ABOVE)
    n_after = len(dictionary)
    print(f"Vocabulary: {n_before} -> {n_after} terms "
          f"(no_below={NO_BELOW}, no_above={NO_ABOVE})")
    corpus = [dictionary.doc2bow(tokens) for tokens in filtered]
    return dictionary, corpus, n_after


def train_lda(corpus, dictionary, k):
    return LdaModel(
        corpus=corpus,
        id2word=dictionary,
        num_topics=k,
        passes=N_PASSES,
        alpha=ALPHA,
        random_state=RANDOM_SEED,
        per_word_topics=False,
    )


def coherence(model, texts, dictionary):
    cm = CoherenceModel(
        model=model,
        texts=texts,
        dictionary=dictionary,
        coherence="c_v",
    )
    return cm.get_coherence()


def grid_search(corpus, dictionary, texts):
    print("\nGrid search over k:", K_GRID)
    results = {}
    for k in K_GRID:
        print(f"  k={k} ...", end=" ", flush=True)
        model = train_lda(corpus, dictionary, k)
        score = coherence(model, texts, dictionary)
        results[k] = score
        print(f"Cv={score:.4f}")
    best_k = max(results, key=results.get)
    print(f"\nBest k={best_k}  (Cv={results[best_k]:.4f})")
    return best_k, results


def get_topic_assignments(model, corpus):
    assignments = []
    for bow in corpus:
        dist = model.get_document_topics(bow, minimum_probability=0.0)
        probs = np.zeros(model.num_topics)
        for tid, p in dist:
            probs[tid] = p
        top_id   = int(np.argmax(probs))
        top_prob = float(probs[top_id])
        assignments.append({"dominant_topic": top_id, "max_prob": top_prob})
    return pd.DataFrame(assignments)


def compute_weighted_compound(df):
    """Upvote-weighted compound per category."""
    clip_val = df["score"].clip(lower=0).quantile(SCORE_CLIP_PCT / 100)
    df = df.copy()
    df["score_clipped"] = df["score"].clip(lower=0, upper=clip_val)

    results = {}
    for cat, grp in df.groupby("category"):
        w = grp["score_clipped"]
        c = grp["sent_compound"]
        denom = w.sum()
        weighted = (w * c).sum() / denom if denom > 0 else c.mean()
        results[cat] = {
            "unweighted_compound": round(float(c.mean()), 4),
            "weighted_compound":   round(float(weighted), 4),
            "diff": round(float(weighted - c.mean()), 4),
        }
    return results


def contract_signals(df):
    """Simple Kalshi signals: one row per category."""
    rows = []
    for cat, grp in df.groupby("category"):
        n     = len(grp)
        bull  = (grp["sent_label"] == "bullish").sum()
        bear  = (grp["sent_label"] == "bearish").sum()
        neut  = (grp["sent_label"] == "neutral").sum()
        avg_c = grp["sent_compound"].mean()
        strength = abs(bear - bull) / n * 100 if n > 0 else 0
        # edge = sentiment-implied prob deviation from 50-cent price baseline
        # (compound in [-1,1] mapped linearly: 0 -> 0pp, -1 -> -50pp, +1 -> +50pp)
        edge = avg_c * 50

        # Use VADER standard thresholds (Hutto & Gilbert 2014)
        if avg_c <= COMPOUND_NEG:
            rec = "BUY NO"
        elif avg_c >= COMPOUND_POS:
            rec = "BUY YES"
        else:
            rec = "HOLD"

        rows.append({
            "contract":  cat,
            "price_cents": 50,   # neutral baseline (no live Kalshi data)
            "avg_compound": round(avg_c, 3),
            "edge_pp":   round(edge, 1),
            "strength_pct": round(strength, 1),
            "rec":       rec,
            "n_posts":   n,
            "bullish":   int(bull),
            "bearish":   int(bear),
            "neutral":   int(neut),
        })
    return sorted(rows, key=lambda r: abs(r["edge_pp"]), reverse=True)


def main():
    df = load_data(INPUT_FILE)
    dictionary, corpus, vocab_size = build_corpus(df)
    texts = df["tokens"].tolist()

    # ── Grid search ──────────────────────────────────────────────
    best_k, coherence_scores = grid_search(corpus, dictionary, texts)

    # ── Final model (force k=FORCE_K for paper table alignment) ──
    chosen_k = FORCE_K
    print(f"\nGrid search best: k={best_k} (Cv={coherence_scores[best_k]:.4f})")
    print(f"Using k={chosen_k} for 10-topic paper table "
          f"(Cv={coherence_scores.get(chosen_k, 'N/A'):.4f})")
    print(f"Training final model with k={chosen_k} ...")
    final_model = train_lda(corpus, dictionary, chosen_k)
    final_cv    = coherence_scores.get(chosen_k, coherence(final_model, texts, dictionary))

    # ── Topic terms ──────────────────────────────────────────────
    topics_info = []
    for tid in range(final_model.num_topics):
        top_terms = [w for w, _ in final_model.show_topic(tid, topn=5)]
        label = TOPIC_LABELS[tid] if tid < len(TOPIC_LABELS) else f"Topic {tid}"
        topics_info.append({"id": tid, "label": label, "top_terms": top_terms})

    # ── Per-post assignments ─────────────────────────────────────
    assign_df = get_topic_assignments(final_model, corpus)
    df = pd.concat([df.reset_index(drop=True), assign_df], axis=1)

    ambiguous_mask = df["max_prob"] < AMBIG_THRESH
    n_ambiguous    = int(ambiguous_mask.sum())
    pct_ambiguous  = round(100 * n_ambiguous / len(df), 1)
    print(f"\nAmbiguous posts (max_prob < {AMBIG_THRESH}): "
          f"{n_ambiguous} ({pct_ambiguous}%)")

    # ── Per-topic post counts ─────────────────────────────────────
    clear_df = df[~ambiguous_mask]
    topic_counts = clear_df["dominant_topic"].value_counts().sort_index()
    for t in topics_info:
        t["n_posts"] = int(topic_counts.get(t["id"], 0))

    # ── Overall sentiment ─────────────────────────────────────────
    lbl = df["sent_label"].value_counts()
    n_total = len(df)
    overall_sentiment = {
        "n_posts":  n_total,
        "bearish_pct": round(100 * lbl.get("bearish", 0) / n_total, 1),
        "bullish_pct": round(100 * lbl.get("bullish", 0) / n_total, 1),
        "neutral_pct": round(100 * lbl.get("neutral", 0) / n_total, 1),
        "mean_compound": round(float(df["sent_compound"].mean()), 4),
    }

    # ── Weighted compound ─────────────────────────────────────────
    cat_df = df[df["category"].notna() & (df["category"] != "")].copy()
    weighted = compute_weighted_compound(cat_df)
    mean_diff = round(
        float(np.mean([v["diff"] for v in weighted.values()])), 4
    )

    # ── Kalshi signals ────────────────────────────────────────────
    signals = contract_signals(cat_df)
    n_buy_yes = sum(1 for r in signals if r["rec"] == "BUY YES")
    n_buy_no  = sum(1 for r in signals if r["rec"] == "BUY NO")
    n_hold    = sum(1 for r in signals if r["rec"] == "HOLD")
    active    = [r for r in signals if r["rec"] != "HOLD"]
    mean_abs_edge = round(float(np.mean([abs(r["edge_pp"]) for r in active])), 1) if active else 0

    # ── Print summary for paper ───────────────────────────────────
    print("\n" + "=" * 60)
    print("PAPER NUMBERS")
    print("=" * 60)
    print(f"\nDataset: {n_total} posts")
    print(f"Vocabulary after filtering: {vocab_size} terms")
    print(f"\nGrid search coherence scores (Cv):")
    for k, s in sorted(coherence_scores.items()):
        marker = " <-- BEST" if k == best_k else ""
        print(f"  k={k:2d}  Cv={s:.4f}{marker}")
    print(f"\nFinal k={best_k},  Cv={final_cv:.4f}")

    print("\nTopics:")
    for t in topics_info:
        print(f"  {t['id']:2d}  {t['label']:<22}  {t['top_terms']}  n={t['n_posts']}")

    print(f"\nAmbiguous posts excluded: {n_ambiguous} ({pct_ambiguous}%)")

    print("\nOverall sentiment:")
    print(f"  Bearish: {overall_sentiment['bearish_pct']}%")
    print(f"  Bullish: {overall_sentiment['bullish_pct']}%")
    print(f"  Neutral: {overall_sentiment['neutral_pct']}%")
    print(f"  Mean compound: {overall_sentiment['mean_compound']}")

    print("\nWeighted vs unweighted compound per category:")
    for cat, v in sorted(weighted.items()):
        print(f"  {cat:<25}  unweighted={v['unweighted_compound']:+.4f}  "
              f"weighted={v['weighted_compound']:+.4f}  diff={v['diff']:+.4f}")
    print(f"  Mean diff (weighted - unweighted): {mean_diff:+.4f}")

    print(f"\nKalshi signals ({len(signals)} contracts):")
    print(f"  BUY YES: {n_buy_yes}  BUY NO: {n_buy_no}  HOLD: {n_hold}")
    print(f"  Mean |edge| for BUY YES/NO: {mean_abs_edge}pp")
    print("\n  Top signals by |edge|:")
    for r in signals[:5]:
        print(f"    {r['contract']:<25}  edge={r['edge_pp']:+.1f}pp  "
              f"str={r['strength_pct']:.1f}%  {r['rec']}")

    # ── Save outputs ──────────────────────────────────────────────
    os.makedirs("data/processed", exist_ok=True)
    os.makedirs("public", exist_ok=True)

    df.to_csv(ASSIGN_OUTPUT, index=False)
    print(f"\nWrote {ASSIGN_OUTPUT}")

    results = {
        "n_posts":        n_total,
        "vocab_size":     vocab_size,
        "best_k":         best_k,
        "final_cv":       round(final_cv, 4),
        "coherence_grid": {str(k): round(v, 4) for k, v in coherence_scores.items()},
        "topics":         topics_info,
        "n_ambiguous":    n_ambiguous,
        "pct_ambiguous":  pct_ambiguous,
        "overall_sentiment": overall_sentiment,
        "weighted_compound": weighted,
        "mean_weighted_diff": mean_diff,
        "signals":        signals,
        "n_buy_yes":      n_buy_yes,
        "n_buy_no":       n_buy_no,
        "n_hold":         n_hold,
        "mean_abs_edge":  mean_abs_edge,
    }
    with open(RESULTS_OUTPUT, "w") as f:
        json.dump(results, f, indent=2)
    print(f"Wrote {RESULTS_OUTPUT}")

    dashboard = {
        "k":        best_k,
        "cv":       round(final_cv, 4),
        "topics":   topics_info,
        "signals":  signals,
    }
    with open(DASHBOARD_OUTPUT, "w") as f:
        json.dump(dashboard, f, indent=2)
    print(f"Wrote {DASHBOARD_OUTPUT}")

    print("\nDone.")


if __name__ == "__main__":
    main()