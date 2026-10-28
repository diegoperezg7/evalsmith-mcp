# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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

[Unreleased]: https://github.com/diegoperezg7/evalsmith-mcp/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/diegoperezg7/evalsmith-mcp/releases/tag/v0.1.0
