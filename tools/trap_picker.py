"""
Trap word picker — browse words with count <= MAX_COUNT and choose which ones
to add to TRAP_WORDS in game/game.js.

Usage:
    python3 tools/trap_picker.py

Commands while running:
    <number>    Toggle the word at that position on/off
    /<text>     Filter list to words containing <text>  (e.g. /sher)
    /           Clear filter
    n / p       Next / previous page
    a           Select all words on the current page
    c           Clear all selections
    q           Save to game.js and quit
    x           Quit without saving
"""

import json
import os
import re
import sys
from pathlib import Path

BASE_DIR   = Path(__file__).parent.parent
WORDS_FILE = BASE_DIR / "data" / "words.json"
GAME_JS    = BASE_DIR / "game" / "game.js"
MAX_COUNT  = 50
PAGE_SIZE  = 30


# ── Load data ──────────────────────────────────────────────────────────────────

all_words = [w for w in json.load(open(WORDS_FILE)) if w["count"] <= MAX_COUNT]
all_words.sort(key=lambda w: -w["count"])  # highest count first

# ── Read current TRAP_WORDS from game.js ──────────────────────────────────────

js_content = GAME_JS.read_text(encoding="utf-8")
trap_match = re.search(r"const TRAP_WORDS\s*=\s*\[(.*?)\];", js_content, re.DOTALL)
current_traps = set()
if trap_match:
    current_traps = set(re.findall(r"['\"]([^'\"]+)['\"]", trap_match.group(1)))

selected = set(current_traps)


# ── Helpers ────────────────────────────────────────────────────────────────────

def clear():
    os.system("clear" if os.name == "posix" else "cls")


def filtered(query: str) -> list:
    q = query.lower()
    return [w for w in all_words if q in w["word"].lower()] if q else all_words


def display(page: int, query: str) -> list:
    """Render current page, return the visible word list."""
    clear()
    view = filtered(query)
    total_pages = max(1, (len(view) - 1) // PAGE_SIZE + 1)
    page = max(0, min(page, total_pages - 1))

    start = page * PAGE_SIZE
    chunk = view[start : start + PAGE_SIZE]

    filter_label = f'  filter: "{query}"' if query else ""
    print(f"── Trap picker  (words with count ≤ {MAX_COUNT}){filter_label}")
    print(f"   Page {page + 1}/{total_pages}  ·  {len(view)} words shown  ·  {len(selected)} selected\n")

    for i, w in enumerate(chunk):
        abs_i   = start + i
        marker  = "✓" if w["word"] in selected else " "
        is_orig = " *" if w["word"] in current_traps else ""
        print(f"  [{marker}] {abs_i + 1:>4}.  {w['word']:<22}  {w['count']:>3}{is_orig}")

    print()
    sel_preview = sorted(selected - current_traps)[:8]
    removed     = sorted(current_traps - selected)[:8]
    if sel_preview:
        more = f" +{len(selected - current_traps) - len(sel_preview)} more" if len(selected - current_traps) > len(sel_preview) else ""
        print(f"  + adding:   {sel_preview}{more}")
    if removed:
        print(f"  - removing: {removed}")
    print()
    print("  <number> toggle  |  /text filter  |  / clear  |  n/p page  |  a sel-all  |  c clear  |  q save  |  x abort")
    return chunk, page, total_pages


# ── Main loop ──────────────────────────────────────────────────────────────────

def main():
    page  = 0
    query = ""

    while True:
        chunk, page, total_pages = display(page, query)

        try:
            cmd = input("\n> ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nAborted.")
            sys.exit(0)

        if not cmd:
            continue

        # Filter
        if cmd.startswith("/"):
            query = cmd[1:].strip()
            page  = 0

        # Navigate
        elif cmd in ("n", "N"):
            if page < total_pages - 1:
                page += 1

        elif cmd in ("p", "P"):
            if page > 0:
                page -= 1

        # Select all on page
        elif cmd in ("a", "A"):
            for w in chunk:
                selected.add(w["word"])

        # Clear all
        elif cmd in ("c", "C"):
            selected.clear()

        # Quit + save
        elif cmd in ("q", "Q"):
            _save()
            break

        # Abort
        elif cmd in ("x", "X"):
            print("No changes made.")
            sys.exit(0)

        # Toggle by number
        elif cmd.isdigit():
            idx = int(cmd) - 1
            view = filtered(query)
            if 0 <= idx < len(view):
                word = view[idx]["word"]
                if word in selected:
                    selected.discard(word)
                else:
                    selected.add(word)
            else:
                input(f"  ✗ No word at position {idx + 1}. Press Enter.")

        # Toggle by typing the word directly
        else:
            matches = [w for w in all_words if w["word"] == cmd.lower()]
            if matches:
                w = matches[0]["word"]
                if w in selected:
                    selected.discard(w)
                    print(f"  Removed '{w}'")
                else:
                    selected.add(w)
                    print(f"  Added '{w}'")
            else:
                input(f"  ✗ '{cmd}' not found in ≤{MAX_COUNT} list. Press Enter.")


def _save():
    global js_content

    # Build the replacement TRAP_WORDS array
    # Keep any existing words NOT in the ≤50 list (high-freq traps like 'bruh')
    high_freq_keep = current_traps - {w["word"] for w in all_words}
    final = sorted(high_freq_keep | selected)

    items   = ", ".join(f"'{w}'" for w in final)
    new_arr = f"const TRAP_WORDS = [{items}];"

    new_js = re.sub(
        r"const TRAP_WORDS\s*=\s*\[.*?\];",
        new_arr,
        js_content,
        flags=re.DOTALL,
    )

    if new_js == js_content:
        print("  No changes to write.")
        return

    GAME_JS.write_text(new_js, encoding="utf-8")
    added   = selected - current_traps
    removed = current_traps - selected
    print(f"\n  ✓ game.js updated")
    if added:
        print(f"    Added:   {sorted(added)}")
    if removed:
        print(f"    Removed: {sorted(removed)}")
    print(f"    Total TRAP_WORDS: {len(final)}")
    print("\n  Don't forget to commit + push, then redeploy the edge function:")
    print("    git add game/game.js && git commit -m 'Update trap words' && git push")
    print("    supabase functions deploy validate-score --no-verify-jwt")


if __name__ == "__main__":
    main()
