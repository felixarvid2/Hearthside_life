# Hearthside Life

Start with `docs/CONTINUATION.md` (handover note: state, checks, next steps, conventions).

- Before the last commit of every session, run `bash tools/te-save.sh` and commit `.tokeneconomizer/` with the rest
  (TokenEconomizer's learned state lives in the repository).
- Never print or commit API keys (`/home/user/apis/*`); scan for them before each commit.
- Never wrap `tests/e2e/*.mjs` in `flock`; they take `/tmp/hearthside-browser.lock` themselves.
- Standing approval from the user: once all checks on a pull request pass (typecheck, test, content:check, build, e2e,
  e2e:creator, acceptance in all three viewports), mark it ready and merge it into `main` with a merge commit, without
  asking first.
