"""
Build data/processed/reddit_posts_cleaned.csv from the raw Arctic Shift export.

Logic matches notebooks/reddit_eda.ipynb (STOP_WORDS, clean_text, short-post filter).
Run from project root with:  python src/preprocess_from_raw.py
"""

import os
import re

import pandas as pd

RAW_DEFAULT = "data/raw/reddit_posts_apr.csv"
OUT_DEFAULT = "data/processed/reddit_posts_cleaned.csv"
MIN_CLEANED_WORDS = 3

STOP_WORDS = set(
    """
a about above after again against all am an and any are arent as at be because
been before being below between both but by cant cannot could couldnt did
didnt do does doesnt doing dont down during each few for from further get
got had hadnt has hasnt have havent having he her here hers herself him
himself his how if in into is isnt it its itself lets me more most mustnt
my myself no nor not of off on once only or other ought our ours ourselves out
over own same shant she should shouldnt so some such than that the their
theirs them themselves then there these they this those through to too under
until up very was wasnt we were werent what when where which while who whom
why will with wont would wouldnt you your yours yourself yourselves
also like think get one know even really much going well say
http https www com amp removed deleted people thing make want go see still
just new way us many right back need now take time year use two every
made said come put first good may got look can day days says talks
""".split()
)


def clean_text(text: str) -> str:
    if not isinstance(text, str):
        return ""
    text = text.lower()
    text = re.sub(r"http\S+|www\.\S+", "", text)
    text = re.sub(r"[^a-zA-Z\s]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    tokens = text.split()
    tokens = [t for t in tokens if t not in STOP_WORDS and len(t) > 2]
    return " ".join(tokens)


def preprocess_raw_to_cleaned(
    raw_path: str = RAW_DEFAULT,
    out_path: str = OUT_DEFAULT,
    min_cleaned_words: int = MIN_CLEANED_WORDS,
) -> pd.DataFrame:
    if not os.path.exists(raw_path):
        raise FileNotFoundError(
            f"Raw CSV not found: {raw_path}\n"
            "Place data there or set RUN_COLLECTION in the full_pipeline notebook."
        )

    df = pd.read_csv(raw_path)
    df["selftext"] = df["selftext"].fillna("")
    df["title"] = df["title"].fillna("")
    df["full_text"] = df["title"] + " " + df["selftext"]
    df["word_count"] = df["full_text"].str.split().str.len()

    df["cleaned_text"] = df["full_text"].apply(clean_text)
    df["cleaned_word_count"] = df["cleaned_text"].str.split().str.len()

    before = len(df)
    df_clean = df[df["cleaned_word_count"] > min_cleaned_words].copy()
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    df_clean.to_csv(out_path, index=False)

    print(f"Preprocessed {before} -> {len(df_clean)} rows (min {min_cleaned_words} cleaned words).")
    print(f"Wrote {out_path}")
    return df_clean


def main():
    preprocess_raw_to_cleaned()


if __name__ == "__main__":
    main()
