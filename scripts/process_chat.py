"""
Phase 1: Process Discord chat export → data/words.json

Input:  "../Direct Messages - Waweed [784654765580877824].json"
Output: "../data/words.json"
"""

import json
import re
import ssl
from collections import Counter
from pathlib import Path

import nltk

# Fix macOS SSL issue for nltk downloads
try:
    _create_unverified = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified

nltk.download("stopwords", quiet=True)
from nltk.corpus import stopwords

# ── Config ────────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).parent.parent
INPUT_FILE = BASE_DIR / "Direct Messages - Waweed [784654765580877824].json"
OUTPUT_FILE = BASE_DIR / "data" / "words.json"

MIN_OCCURRENCES = 21  # "above 20 mentions"

STOPWORDS = stopwords.words("english")

# Discord-specific noise to strip on top of standard stopwords
EXTRA_STOPWORDS = {
    "im", "ive", "id", "ur", "u", "r", "ok", "okay", "yeah", "yea",
    "nah", "na", "ye", "ya", "ah", "oh", "uh", "um", "hm", "hmm",
    "lmao", "lmfao", "omg", "wtf", "tbh", "ngl", "imo", "idk",
    "gonna", "wanna", "gotta", "kinda", "sorta", "tryna",
    "tho", "thats", "theres", "theyre", "youre", "youve", "youll",
    "dont", "doesnt", "didnt", "cant", "wont", "wouldnt", "shouldnt",
    "couldnt", "isnt", "arent", "wasnt", "werent", "havent", "hasnt",
    "hadnt", "let", "lets", "get", "got", "like", "go", "going",
    "said", "say", "know", "think", "want", "see", "come", "came",
    "one", "two", "three", "also", "just", "even", "still", "already",
    "back", "way", "thing", "things", "time", "day", "good", "well",
    "really", "actually", "basically", "literally", "probably",
    "something", "anything", "nothing", "everything", "someone",
    "anyone", "everyone", "somewhere", "anywhere", "somehow",
    "bit", "lot", "bit", "much", "many", "more", "most", "last",
    "first", "next", "every", "around", "always", "never",
}

ALL_STOPWORDS = set(STOPWORDS) | EXTRA_STOPWORDS

# Matches URLs, Discord mentions/channels/emotes, and markdown
_URL_RE = re.compile(r"https?://\S+|www\.\S+")
_DISCORD_RE = re.compile(r"<[^>]+>")  # <@id>, <#id>, <:emoji:id>
_NON_ALPHA_RE = re.compile(r"[^a-z\s]")


def tokenise(text: str) -> list[str]:
    text = text.lower()
    text = _URL_RE.sub(" ", text)
    text = _DISCORD_RE.sub(" ", text)
    text = _NON_ALPHA_RE.sub(" ", text)
    return text.split()


def is_valid(token: str) -> bool:
    return (
        len(token) >= 2
        and not token.isdigit()
        and token not in ALL_STOPWORDS
    )


def main() -> None:
    print(f"Loading {INPUT_FILE.name} …")
    with open(INPUT_FILE, encoding="utf-8") as f:
        data = json.load(f)

    messages = data.get("messages", [])
    print(f"  {len(messages):,} messages found")

    USER_TYPES = {"Default", "Reply"}

    counter: Counter = Counter()
    for msg in messages:
        if msg.get("type") not in USER_TYPES:
            continue
        content = msg.get("content", "")
        if not content:
            continue
        for token in tokenise(content):
            if is_valid(token):
                counter[token] += 1

    print(f"  {len(counter):,} unique tokens before filtering")

    # Drop rare words (keep everything with count > 20)
    counter = Counter({w: c for w, c in counter.items() if c >= MIN_OCCURRENCES})
    print(f"  {len(counter):,} tokens with count > 20")

    top = counter.most_common()
    print(f"  Total words included: {len(top)}")

    output = [{"word": word, "count": count, "categories": []} for word, count in top]

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"\nWrote {OUTPUT_FILE}")
    print("\nTop 20 words:")
    for i, entry in enumerate(output[:20], 1):
        print(f"  {i:>2}. {entry['word']:<20} {entry['count']:>6}")


if __name__ == "__main__":
    main()
