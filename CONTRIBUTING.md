# Contributing

Thanks for helping. code-learn stays small on purpose, so read [AGENTS.md](AGENTS.md) for the invariants and [docs/DESIGN.md](docs/DESIGN.md) for the spec before you start.

## Set up

You need Linux with Node.js 22+, bubblewrap 0.9+ and a systemd user session for the full suite, and micromamba 2 to install real tracks.

```bash
npm ci
npm run typecheck
npm test
```

`npm run test:unit` skips the sandbox integration suite in `test/native/`.

## Layout

```
src/        the CLI, MCP server and core modules
test/       unit tests; test/native/ runs real sandboxes
test/fixtures/
  tracks/      shell-script tracks used only by code-learn's own tests
  exercises/   fixture exercises for the gates
docs/       design and security
```

## Pull requests

- Write the test first, and keep each PR to one change.
- Run `npm run typecheck` and `npm test` (and in `desktop/`, `npm run typecheck` and `npm test`) before you push.
- If you change a format or a gate, update `docs/DESIGN.md` in the same PR.
- Security issues: please report them privately to the maintainers rather than in a public issue.
