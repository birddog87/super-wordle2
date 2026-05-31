#!/usr/bin/env bash
# Rebuilds the four word-data files in ../words/ from public sources.
#
# Design: two-list system (same as NYT Wordle)
#   answers_N.txt  -> curated COMMON words that can be the secret word (no weird/obscure answers)
#   guesses_N.txt  -> large dictionary of valid words you may TYPE (superset of answers)
#
# Sources:
#   5-letter answers : cfreshman "wordle-answers-alphabetical" (~2,315 curated NYT answers)
#   5-letter guesses : tabatkins/wordle-list (~14,855 accepted words)
#   6-letter dict    : dwyl/english-words words_alpha.txt (filtered to length 6)
#   6-letter common  : first20hours/google-10000-english (usa, no-swears) filtered to length 6
#   proper-noun strip: /usr/share/dict/words capitalizes proper nouns, so we keep only
#                      words present as a LOWERCASE entry (drops Nevada, Andrea, etc.)
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p words
T=$(mktemp -d)

curl -fsSL "https://gist.githubusercontent.com/cfreshman/a03ef2cba789d8cf00c08f767e0fad7b/raw/5d752e5f0702da315298a6bb5a771586d6ff445c/wordle-answers-alphabetical.txt" -o "$T/ans5.txt"
curl -fsSL "https://raw.githubusercontent.com/tabatkins/wordle-list/main/words" -o "$T/guess5.txt"
curl -fsSL "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt" -o "$T/alpha.txt"
curl -fsSL "https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-usa-no-swears.txt" -o "$T/freq.txt"

# common-noun dictionary (lowercase-only entries = excludes proper nouns)
grep -xE '[a-z]+' /usr/share/dict/words | sort -u > "$T/lc.txt"

# 5-letter
tr 'A-Z' 'a-z' < "$T/ans5.txt"   | grep -xE '[a-z]{5}' | sort -u > words/answers_5.txt
tr 'A-Z' 'a-z' < "$T/guess5.txt" | grep -xE '[a-z]{5}' | cat - words/answers_5.txt | sort -u > words/guesses_5.txt

# 6-letter
tr 'A-Z' 'a-z' < "$T/alpha.txt" | grep -xE '[a-z]{6}' | sort -u > "$T/dict6.txt"
tr 'A-Z' 'a-z' < "$T/freq.txt"  | grep -xE '[a-z]{6}' | sort -u > "$T/freq6.txt"
grep -Fxf "$T/dict6.txt" "$T/freq6.txt" | grep -Fxf "$T/lc.txt" | sort -u > words/answers_6.txt
cat "$T/dict6.txt" words/answers_6.txt | sort -u > words/guesses_6.txt

rm -rf "$T"
wc -l words/answers_5.txt words/guesses_5.txt words/answers_6.txt words/guesses_6.txt
