# Hearthside Life

Start with `docs/CONTINUATION.md` (handover note: state, checks, next steps, conventions).

- Before the last commit of every session, run `bash tools/te-save.sh` and commit `.tokeneconomizer/` with the rest
  (TokenEconomizer's learned state lives in the repository).
- Never print or commit API keys (`/home/user/apis/*`); scan for them before each commit.
- Never wrap `tests/e2e/*.mjs` in `flock`; they take `/tmp/hearthside-browser.lock` themselves.
- Standing approval from the user: once all checks on a pull request pass (typecheck, test, content:check, build, e2e,
  e2e:creator, acceptance in all three viewports), mark it ready and merge it into `main` with a merge commit, without
  asking first.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.
The graph is not committed (`graphify-out/` is gitignored). In a fresh container, install the CLI with
`uv tool install graphifyy` (double y), then build the graph with `GRAPHIFY_BACKEND=none graphify update .`.
The build is code-only (tree-sitter, no LLM, nothing leaves the machine) and takes about 1.5 minutes.
`.graphifyignore` keeps assets, generated shots, `android/` and the authoring data files out of the graph.
The hooks in `.claude/settings.json` do nothing when graphify is not installed.

Rules:
- When graphify-out/graph.json exists, run `graphify query "<question>"` before your first grep, search or source-file read for a codebase question, and put this rule in every subagent prompt that explores code. Read raw files only for lines the graph or an earlier read already located. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. When the answer is under a Markdown heading, `graphify section "<heading>"` prints that section's text, so the .md need not be opened. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
