CATEGORIES = {
    "Growth": [
        "recession",
        "economic growth",
        "slowdown",
    ],
    "Inflation": [
        "inflation",
        "CPI",
        "rising prices",
    ],
    "Jobs & Economy": [
        "jobs report",
        "unemployment",
        "layoffs",
        "hiring",
    ],
    "Oil and energy": [
        "oil prices",
        "gas prices",
        "energy prices",
        "crude oil",
    ],
    "Fed": [
        "Fed",
        "interest rates",
        "rate cut",
        "rate hike",
        "Powell",
    ],
    "GDP": [
        "GDP",
    ],
    "Global Central Banks": [
        "central bank",
        "monetary policy",
        "ECB",
    ],
    "Housing": [
        "housing market",
        "mortgage rates",
        "home prices",
    ],
    "Econ Daily": [
        "economy",
        "stock market",
        "treasury yields",
    ],
}


def keyword_to_category() -> dict:
    """Reverse lookup: keyword -> category. First-match wins on duplicates."""
    out = {}
    for cat, kws in CATEGORIES.items():
        for kw in kws:
            out.setdefault(kw, cat)
    return out


def all_keywords() -> list:
    """Flat list of every keyword across all categories."""
    return [kw for kws in CATEGORIES.values() for kw in kws]
