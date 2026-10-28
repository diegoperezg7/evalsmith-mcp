# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.2.0] - 2026-10-28

### Added

- `run_suite` tool: runs an `evalsmith.yaml` from the workspace like `evalsmith run`, reading only inside `EVALSMITH_ROOT`.
- `check_tool_calls` and suite traces accept Anthropic Messages, OpenAI Chat and OpenAI Responses transcripts as logged, as well as evalsmith calls.
- Self-contained HTML report (`--format html`, `-r report.html`, `--report-format html`): one file with no network access, light and dark mode, the verdict with a card per gate, retrieval metrics per k with bootstrap intervals, the configuration comparison with its intervals and winner, expected vs. actual tool calls with the matching drawn, and baseline vs. candidate cases with their failing checks. Dataset text is embedded as JSON and rendered as text under a hash-based Content-Security-Policy.
- GitHub Action (`uses: diegoperezg7/evalsmith-mcp@v0`) on `node24`, with inputs `config`, `fail-under`, `report-file`, `report-format`, `html-report` and `upload-summary`, outputs for the verdict, the main metrics and the report paths, and a Markdown job summary. It calls the core directly and suspends workflow commands while it prints dataset text.
- `check_tool_calls` returns `calls`, the tool names of the trace in order.
- `action-selftest` workflow, and a CI check that the committed action bundle matches the source.
- Descriptions for every tool parameter, and a line in each tool description on when to use it.
- Dockerfile, and a CI job that builds it and lists the tools from the container.
- Release workflow that publishes to npm with provenance, to the MCP Registry and to GitHub Releases.
- OpenSSF Scorecard and Dependabot.

### Changed

- All tools declare `destructiveHint: false`, so the four MCP tool hints are explicit.
- GitHub Actions are pinned to commit SHAs.

## [0.1.0] - 2026-10-28

First public release.

- MCP server over stdio and Streamable HTTP with five read-only tools: `evaluate_retrieval`, `compare_configs`, `check_tool_calls`, `detect_prompt_regression`, `generate_report`.
- `evalsmith` CLI with CI gates (`--fail-under`), Markdown, JSON and JUnit reports, and exit codes 0/1/2.
- Deterministic metrics: recall@k, precision@k, nDCG@k, hit rate@k, MRR and seeded paired bootstrap.
- Optional LLM judge on any OpenAI-compatible endpoint or Ollama, off by default.
- MIT license.

[Unreleased]: https://github.com/diegoperezg7/evalsmith-mcp/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/diegoperezg7/evalsmith-mcp/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/diegoperezg7/evalsmith-mcp/releases/tag/v0.1.0
