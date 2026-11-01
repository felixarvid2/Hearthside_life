#!/usr/bin/env bash
# Run a headless Claude Code agent on DeepSeek (OpenScale, Anthropic-compatible API) instead of the Claude quota.
# usage: tools/ds-agent.sh <prompt-file> <log-file> [max-turns]
# The OpenScale key is read at run time from $OPENSCALE_KEY_FILE (default /home/user/apis/Deepseek2,
# the user's felixarvid2/apis repo). It is never printed or written anywhere.
set -euo pipefail
PROMPT_FILE=$1
LOG=$2
TURNS=${3:-400}
KEY_FILE=${OPENSCALE_KEY_FILE:-/home/user/apis/Deepseek2}
MODEL=${DS_MODEL:-deepseek/deepseek-v4.1-flash}
REPO=$(cd "$(dirname "$0")/.." && pwd)
DSHOME=${DS_HOME:-/tmp/ds-agent-home}
mkdir -p "$DSHOME"
KEY=$(tr -d ' \n\r' < "$KEY_FILE")
cd "$REPO"
env -i PATH="$PATH" HOME="$DSHOME" LANG=C.UTF-8 \
  HTTPS_PROXY="${HTTPS_PROXY:-}" HTTP_PROXY="${HTTP_PROXY:-}" NO_PROXY="${NO_PROXY:-}" \
  PLAYWRIGHT_BROWSERS_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}" NODE_EXTRA_CA_CERTS="${NODE_EXTRA_CA_CERTS:-/root/.ccr/ca-bundle.crt}" SSL_CERT_FILE="${SSL_CERT_FILE:-/root/.ccr/ca-bundle.crt}" \
  ANTHROPIC_BASE_URL=https://api.openscale.so ANTHROPIC_API_KEY="$KEY" \
  ANTHROPIC_MODEL="$MODEL" ANTHROPIC_SMALL_FAST_MODEL="$MODEL" \
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 \
  claude -p "$(cat "$PROMPT_FILE")" --permission-mode acceptEdits \
    --allowedTools "Read,Edit,Write,Glob,Grep,Bash(npm run:*),Bash(npm test:*),Bash(npx tsc:*),Bash(npx vitest:*),Bash(node tests/e2e/*),Bash(flock /tmp/hearthside-browser.lock node:*),Bash(ls:*),Bash(cat:*),Bash(grep:*),Bash(head:*),Bash(tail:*),Bash(wc:*)" \
    --disallowedTools "Bash(git:*),Bash(curl:*),Bash(rm:*)" --max-turns "$TURNS" \
    --output-format stream-json --verbose < /dev/null > "$LOG" 2>&1
