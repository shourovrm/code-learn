# code-learn: instructions for agents working on this repository

code-learn is a harness: the learner's coding agent writes tracks, roadmaps and exercises, and code-learn verifies, grades and tracks mastery. `docs/DESIGN.md` is the authoritative spec. Read it before changing behavior.

## Invariants (never break these)

- **code-learn ships no languages.** No code may dispatch on a language, runtime or framework name, and no track or toolchain may ship in the package.
- **code-learn never calls a model** and never reads or stores credentials.
- **Untrusted code runs only in a sandbox:** bubblewrap inside a systemd user scope, through `src/sandbox.ts` (every sandbox gets the full flag set, DESIGN §4.6), and installs only through `src/toolchain.ts`'s install sandbox. Never add a path that runs agent or learner code on the host.
- **Hidden data never leaves code-learn through code-learn's own outputs (tools, CLI, IPC and diagnostics).** An agent with file access can read code-learn's files; code-learn removes that access where the agent allows. Hidden inputs, expected outputs, test names, messages and output must not appear in tool output, CLI output, IPC or gate diagnostics. Hidden results show an index and a status only.
- **Infrastructure failures record nothing.** Learner-caused outcomes (build errors, timeouts, crashes, output floods) are graded as `error` and recorded.
- **Persistence:**
  - The event log is append-only.
  - Writes to code-learn's files are atomic (temp folder or file, then rename).
  - Mutations hold the course, track or workspace lock.
  - code-learn-owned records carry `format_version`.
- **Subprocesses** use argument arrays, never a host shell.

## How to work

- **Test-first.** For a behavior change, write a failing test, make it pass simply, then refactor with tests green.
- **Keep it small.** KISS, YAGNI and single responsibility: prefer deleting to adding, and put anything not needed now in DESIGN §2 "Deferred".
- **One job per module:**

  | Module | Job |
  |---|---|
  | `files` | input validation |
  | `toolchain` | a track's toolchain: install with micromamba, commit, remove |
  | `schemas` | formats |
  | `grading` | pure grading |
  | `sandbox` | the bubblewrap sandbox and its requirements |
  | `judge` | running test sets |
  | `program` | Run: the learner's program, interactively |
  | `gates` | verification |
  | `learner` | pure learner rules |
  | `store` | persistence |
  | `app` | use cases (`src/app/`, one file per section behind the `app.ts` barrel) |

  `cli`, `mcp`, `init`, `hook` and `doctor` are thin entry points.
- **Never vendor AGPL code.** Exercism's test runners are AGPL-3.0.

## Commands

```bash
npm ci
npm run typecheck
npm run build
npm test              # everything; sandbox tests run when bubblewrap and a systemd user session are here
npm run test:unit     # without the native integration suite
npm run test:native   # the integration suite (real sandboxes, fake micromamba)
```

Set `CODE_LEARN_REQUIRE_SANDBOX=1` so sandbox tests fail instead of skipping, and `CODE_LEARN_REAL_MICROMAMBA=1` to run the tests that install real conda-forge packages (slow, needs network).

## Handoff

For substantial sessions, append to `docs/handoff/YYYY-MM-DD.md`: what changed, how it was verified, and what's next.
