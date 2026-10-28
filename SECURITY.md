# Security policy

## Reporting a vulnerability

Please report vulnerabilities privately through
[GitHub security advisories](https://github.com/diegoperezg7/evalsmith-mcp/security/advisories/new)
rather than in a public issue. You should get a reply within a week.

## Scope

evalsmith only reads the inputs it is given. Every MCP tool is read-only and
non-destructive, and nothing leaves the machine unless the optional LLM judge
is enabled, in which case case outputs are sent to the endpoint configured in
`EVALSMITH_JUDGE_BASE_URL`. The Streamable HTTP transport binds to
`127.0.0.1` by default and has no authentication: put it behind your own proxy
before exposing it.
