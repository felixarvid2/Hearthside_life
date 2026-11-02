# Hearthside Life

Start with `docs/CONTINUATION.md` (handover note: state, checks, next steps, conventions).

- Before the last commit of every session, run `bash tools/te-save.sh` and commit `.tokeneconomizer/` with the rest
  (TokenEconomizer's learned state lives in the repository).
- Never print or commit API keys (`/home/user/apis/*`); scan for them before each commit.
- Never wrap `tests/e2e/*.mjs` in `flock`; they take `/tmp/hearthside-browser.lock` themselves.
- Merge pull requests only after the user approves.
