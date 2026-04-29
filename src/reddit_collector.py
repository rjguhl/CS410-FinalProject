"""
Alpha-Seeker: Reddit Data Collector via Arctic Shift API
=========================================================
Collects Reddit posts from subreddits relevant to prediction markets
(macroeconomic and political topics) using the Arctic Shift API.
"""

import requests
import time
import csv
import os
from datetime import datetime

from categories import CATEGORIES

# Subreddits to scrape (relevant to prediction markets / macro / politics)
SUBREDDITS = [
    "economics",
    "wallstreetbets",
    "stocks",
    "politics",
    "news",
    "worldnews",
    "finance",
    "investing",
    "science",
    "technology",
]

# Keywords come from the shared category map (src/categories.py) so the
# collector, sentiment aggregation, and Kalshi pulls all line up on the
# same Kalshi Economics categories. Each query is a (category, keyword)
# pair so we can tag every saved post with its category.
QUERIES = [(cat, kw) for cat, kws in CATEGORIES.items() for kw in kws]

# Date range for collection (adjust as needed)
# Format: YYYY-MM-DD
DATE_AFTER = "2026-03-22"
DATE_BEFORE = "2026-03-29"

# Max posts per (subreddit, keyword) combo
# Arctic Shift API max per request is 100
LIMIT_PER_REQUEST = 100

# Output file
OUTPUT_FILE = "reddit_posts.csv"

# Be polite to the API - seconds between requests
DELAY_BETWEEN_REQUESTS = 1.0

# ============================================================
# Arctic Shift API base URL
# ============================================================
BASE_URL = "https://arctic-shift.photon-reddit.com"


def search_posts(subreddit: str, keyword: str, after: str, before: str, limit: int = 100) -> list:
    """
    Search for Reddit posts in a subreddit matching a keyword.
    Uses the Arctic Shift /api/posts/search endpoint.
    """
    url = f"{BASE_URL}/api/posts/search"
    params = {
        "subreddit": subreddit,
        "query": keyword,          # searches both title and selftext
        "after": after,
        "before": before,
        "limit": limit,
        "sort": "desc",            # newest first
        "fields": "id,title,selftext,author,subreddit,created_utc,score,num_comments,url,link_flair_text,over_18",
    }

    try:
        resp = requests.get(url, params=params, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        return data.get("data", [])
    except requests.exceptions.Timeout:
        print(f"  [TIMEOUT] {subreddit} / '{keyword}' - try narrowing date range")
        return []
    except requests.exceptions.RequestException as e:
        print(f"  [ERROR] {subreddit} / '{keyword}': {e}")
        return []


def unix_to_iso(ts) -> str:
    """Convert Unix timestamp to readable ISO date string."""
    if ts is None:
        return ""
    try:
        return datetime.utcfromtimestamp(int(ts)).strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, TypeError, OSError):
        return str(ts)


def collect_all_posts():
    """
    Main collection loop: iterate over all (subreddit, category, keyword)
    triples, query Arctic Shift, deduplicate, and tag each post with the
    category and keyword that first matched it.
    """
    all_posts = {}  # keyed by post ID to deduplicate (first-match wins)
    total_queries = len(SUBREDDITS) * len(QUERIES)
    query_num = 0

    print(f"Starting collection: {len(SUBREDDITS)} subreddits x {len(QUERIES)} keywords = {total_queries} queries")
    print(f"Date range: {DATE_AFTER} to {DATE_BEFORE}")
    print(f"Output file: {OUTPUT_FILE}")
    print("=" * 60)

    for subreddit in SUBREDDITS:
        for category, keyword in QUERIES:
            query_num += 1
            print(f"[{query_num}/{total_queries}] r/{subreddit} [{category}] '{keyword}'", end="")

            posts = search_posts(subreddit, keyword, DATE_AFTER, DATE_BEFORE, LIMIT_PER_REQUEST)

            new_count = 0
            for post in posts:
                post_id = post.get("id", "")
                if post_id and post_id not in all_posts:
                    # Tag with the (category, keyword) that found it first.
                    post["category"] = category
                    post["search_keyword"] = keyword
                    all_posts[post_id] = post
                    new_count += 1

            print(f" -> {len(posts)} results, {new_count} new (total: {len(all_posts)})")

            # Be polite to the free API
            time.sleep(DELAY_BETWEEN_REQUESTS)

    print("=" * 60)
    print(f"Collection complete. {len(all_posts)} unique posts collected.")
    return list(all_posts.values())


def save_to_csv(posts: list, filepath: str):
    """Save collected posts to a CSV file."""
    if not posts:
        print("No posts to save.")
        return

    fieldnames = [
        "id",
        "subreddit",
        "title",
        "selftext",
        "author",
        "created_utc",
        "created_date",
        "score",
        "num_comments",
        "url",
        "link_flair_text",
        "over_18",
        "category",          # Kalshi Economics category (the join key)
        "search_keyword",    # which keyword inside that category matched
    ]

    with open(filepath, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()

        for post in posts:
            row = {
                "id": post.get("id", ""),
                "subreddit": post.get("subreddit", ""),
                "title": post.get("title", ""),
                "selftext": (post.get("selftext", "") or "")[:5000],  # truncate very long posts
                "author": post.get("author", ""),
                "created_utc": post.get("created_utc", ""),
                "created_date": unix_to_iso(post.get("created_utc")),
                "score": post.get("score", 0),
                "num_comments": post.get("num_comments", 0),
                "url": post.get("url", ""),
                "link_flair_text": post.get("link_flair_text", ""),
                "over_18": post.get("over_18", False),
                "category": post.get("category", ""),
                "search_keyword": post.get("search_keyword", ""),
            }
            writer.writerow(row)

    file_size = os.path.getsize(filepath) / (1024 * 1024)
    print(f"Saved {len(posts)} posts to {filepath} ({file_size:.1f} MB)")


def print_summary(posts: list):
    """Print basic stats about the collected dataset."""
    if not posts:
        return

    print("\n" + "=" * 60)
    print("DATASET SUMMARY")
    print("=" * 60)

    # Posts per subreddit
    sub_counts = {}
    for p in posts:
        sub = p.get("subreddit", "unknown")
        sub_counts[sub] = sub_counts.get(sub, 0) + 1

    print(f"\nTotal posts: {len(posts)}")
    print(f"\nPosts per subreddit:")
    for sub, count in sorted(sub_counts.items(), key=lambda x: -x[1]):
        print(f"  r/{sub}: {count}")

    # Date range
    timestamps = [p.get("created_utc", 0) for p in posts if p.get("created_utc")]
    if timestamps:
        earliest = unix_to_iso(min(timestamps))
        latest = unix_to_iso(max(timestamps))
        print(f"\nDate range: {earliest} to {latest}")

    # Score stats
    scores = [p.get("score", 0) for p in posts]
    if scores:
        print(f"\nScore stats:")
        print(f"  Mean: {sum(scores) / len(scores):.1f}")
        print(f"  Max:  {max(scores)}")
        print(f"  Min:  {min(scores)}")

    # Posts per category (the Kalshi join key)
    cat_counts = {}
    for p in posts:
        cat = p.get("category", "uncategorized")
        cat_counts[cat] = cat_counts.get(cat, 0) + 1
    print(f"\nPosts per category:")
    for cat, count in sorted(cat_counts.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")

    # Posts with selftext (body content)
    with_text = sum(1 for p in posts if p.get("selftext") and len(p["selftext"].strip()) > 0)
    print(f"\nPosts with body text: {with_text}/{len(posts)} ({100 * with_text / len(posts):.1f}%)")


if __name__ == "__main__":
    posts = collect_all_posts()
    save_to_csv(posts, OUTPUT_FILE)
    print_summary(posts)
    print(f"\nDone! Your data is in: {OUTPUT_FILE}")
    print("Next steps: load this CSV in pandas for preprocessing and EDA.")
