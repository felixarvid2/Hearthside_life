#!/usr/bin/env bash
# Save what TokenEconomizer learned in this session into the repository (.tokeneconomizer/), so the next
# session - also in a fresh cloud container - starts from it. Run from the repository root just before the
# session's last commit: `bash tools/te-save.sh`, then commit .tokeneconomizer/ with the rest.
# It folds every session the plugin recorded here that is not folded yet, including the running one.
set -euo pipefail
cd "$(dirname "$0")/.."
export TOKENECONOMIZER_HOME="$PWD/.tokeneconomizer"
TE=$(ls -d "$HOME"/.claude/plugins/cache/tokeneconomizer/tokeneconomizer/*/scripts/te 2>/dev/null | sort -V | tail -1 || true)
if [ -z "$TE" ]; then echo "te-save: TokenEconomizer plugin not installed, nothing to save"; exit 0; fi
for dir in "$TOKENECONOMIZER_HOME"/repos/*/claude; do
  [ -d "$dir/sessions" ] || continue
  for f in "$dir"/sessions/*.json; do
    [ -e "$f" ] || continue
    sid=$(basename "$f" .json)
    if ! python3 -c "import json,sys; sys.exit(0 if sys.argv[1] in json.load(open(sys.argv[2])) else 1)" "$sid" "$dir/folded.json" 2>/dev/null; then
      "$TE" fold --host claude --cwd "$PWD" --session "$sid" || echo "te-save: fold of $sid failed"
    fi
  done
done
"$TE" --host claude status 2>/dev/null | head -8 || true
