# code-learn 1.0 design

Status: revised after two Astra design reviews (§13). The longer illustrated design, with research sources and the competitor survey, is the "code-learn Harness" design doc (v0.4, 17 Oct 2026). This file is the authoritative spec for the core that 1.0 ships. The desktop app that bundles it, and the core features the app needs, are specified in [desktop/DESIGN.md](desktop/DESIGN.md). For diagrams of how the parts and the files fit together, see [architecture.md](architecture.md).

## 1. What code-learn is

code-learn is an open-source, local-first harness for graded coding practice. It is a **wrapper that ships no languages**. The learner's own coding agent (Claude Code, Codex or Cursor, with the learner's own account) writes everything:

- the environment for a language or framework (a **track**),
- the **roadmap** (a concept graph),
- the **exercises**.

code-learn runs the sandbox, checks each piece with deterministic gates, grades the learner's attempts and keeps per-concept mastery. code-learn launches the learner's own agent CLI (in the desktop app); it never calls a model API, and it never reads, stores or asks for credentials.

**What the gates guarantee:** each exercise is internally consistent and its hidden tests can tell the reference from plausible wrong answers. They do **not** prove that the statement matches the tests. A wrong reference with matching tests passes. Statement quality is the learner's and reviewer's call; an automated independent-solve check is deferred.

## 2. 1.0 scope

### Release requirements (acceptance criteria)

Each item is verified by an automated test unless marked *journey*. Journeys run with real agents before the merge, and their evidence goes in the release notes.

| # | Requirement |
|---|---|
| A1 | code-learn ships no tracks or toolchains. The packed npm artifact contains only `dist/`, `README.md`, `LICENSE` and `package.json`, and no code dispatches on a language or framework name. |
| A2 | `save_track` / `code-learn track add` installs `<id>@<version>` only after the track gates pass. The install is atomic and records the image ID. A conflicting `id@version` with different files is rejected. |
| A3 | Code and quiz activities work end to end. Quiz runs without a track or sandbox (§6). Both code test styles work end to end. `io`: stdin/stdout, with expected outputs written by code-learn from the reference. `unit`: the track's runner writes a results report checked against a fixed test inventory. |
| A4 | `save_roadmap` enforces the roadmap schema and replacement rules (§5). |
| A5 | `save_exercise` runs the exercise gates (§6). On success it commits the exercise to the store, then writes only learner-side files to the workspace. Solutions, mutants, hidden tests and expected hidden outputs never reach the workspace or any tool output. The learner may open a code exercise's solution in the desktop app, once it has three recorded checks or one that passed: only its learner files come back, and opening it records an `assist`, so later checks count as assisted. Quizzes have none. The agent never sees it. |
| A6 | The judge reports `pass`/`fail`/`error` per test for wrong output, crashes, timeouts, build failures, missing tests and malformed reports. Output is capped while running. |
| A7 | Judge containers run through one function with every flag in §4.3 and are cleaned up on timeout. Adversarial tests prove: no network (with a positive control), no writes to mounted input, process and memory limits hold, output floods are capped, and no owned containers survive a timeout. |
| A8 | Learner rules (§7) are pure functions of the event log, including repeated-pass, assistance and infrastructure-error rules. |
| A9 | CLI: `init`, `doctor`, `track add`, `track rebuild`, `tracks`, `test`, `check`, `status`, `skip`, `assist on|off`, `mcp [--course] [--tools] [--desktop]`, `hook claude`, `--version`. Parsing is strict per command: unknown options, missing values and wrong argument counts are errors. |
| A10 | The MCP server (stdio) exposes `list_tracks`, `save_track`, `save_roadmap`, `get_roadmap`, `next_step`, `save_exercise`, `get_exercise`, `check`, `progress`, `save_lesson`, `get_lesson` and `mark_lesson_read`. A test spawns the **packed** CLI as a real stdio server and calls the tools, with and without `--tools`. |
| A11 | `code-learn init [--host claude|codex|cursor]...` sets up the chosen hosts, all three by default (§9). It is idempotent and preserves unrelated config. |
| A12 | Practice mode blocks Claude Code's `Edit`, `Write`, `MultiEdit` and `NotebookEdit` under `exercises/` unless assist mode is on. Elsewhere it is advisory, and the docs say so. |
| A13 | v1 is removed, along with its config and conflicting docs. Build, type check and all tests pass locally and in CI. Version is `1.0.0`. README, migration guide (with tested v1 rollback steps) and release notes are updated. |
| A14 | *Journey:* starting from an empty code-learn home, an agent installs C, Java (JUnit), Python (pytest) and React (Vitest) tracks through code-learn, and at least one exercise per track passes the gates. Each statement is checked against its tests by a reviewer other than its author. A person's spot-check is a release step before publishing, not a merge requirement, because the gates explicitly don't guarantee statement quality (§1). |
| A15 | *Journey:* a learner gets an exercise, runs `test`, fails then passes `check`, and mastery, difficulty and `next_step` change as §7 says. |
| A16 | *Journey:* Claude Code and Codex each complete an author round trip: tutor, then author subagent, then `save_exercise`, then the subagent replies to the tutor with the id only. Cursor is attempted; if it can't be run here, it's marked experimental. |

### Supported matrix

- **Desktop app:** Linux x86_64 with a systemd user session and bubblewrap 0.9 or later, as an AppImage (§4.6).
- **Terminal:** the same Linux computers, with Node.js 22 or later and micromamba 2.
- **Agents:** Claude Code and Codex; Cursor and pi are experimental. The desktop runs pi with only code-learn's tools (`--no-builtin-tools`, `--no-extensions -e builtin:mcp`, `--tools mcp__code_learn__…`), its server in the job folder's `.pi/mcp.json` with `direct` exposure, and suggests `openrouter/anthropic/claude-haiku-5.5`. pi has no web tools, so research and setup with pi run on the model's own knowledge.

### Deferred (not needed for 1.0)

- The full cross-host model bench, including the desktop's per-job flow.
- Independent-solve gate, placement quiz, per-test concept tags.
- Practice hooks for Codex and Cursor in the terminal; protection is advisory there.
- Multi-container tracks, course sharing, watch mode.
- For heavy tests: per-exercise time limits (the track's `time_ms` applies to every exercise), running a check's test sets in parallel, a runner that stays warm across io cases (each case starts `run` afresh), and a unit `build` step timed apart from `test`.
- Publishing to npm. GitHub releases are built as drafts, and only the owner publishes them.

## 3. Files and ids

```
$CODE_LEARN_HOME (default ~/.code-learn)
  tracks/<id>@<version>/            installed track files + track.json (image id, styles)
  proposals/<id>@<version>/<digest>/  a track proposed in the desktop app, awaiting consent (§4.6) + proposal.json
  courses/<course>/
    course.json                     { format_version, title?, goal, track, style, concepts }
    exercises/<slug>/               full exercise + exercise.json (inventory, expected io outputs)
    lessons/<id>/                   lesson.json, lesson.md (never changed after saving, but a rebuild removes it), notes.md (the learner's)
    events.jsonl                    append-only learner events (check, skip, assist, retry, read, rebuild)
    .lock                           held while mutating this course

<workspace>/                        --workspace if given; otherwise learner commands use the nearest folder with
                                    code-learn.json, and every other command (init included) uses the current folder
  code-learn.json                       { format_version, course, current, assist }
  exercises/<course>/<slug>/        README.md, learner files, tests/ (visible only)
```

- **Ids.** Track ids, versions, courses, slugs and concept ids match `^[a-z0-9][a-z0-9._-]{0,63}$`, and versions are positive integers. No path is ever built from an unvalidated id.
- **Format versions.** Only the files code-learn writes (`course.json`, `exercise.json`, `track.json`, `lesson.json`, `proposal.json`, `events.jsonl` records, `code-learn.json`) carry `format_version: 1`, except a mixed course's `course.json`, which carries 2 so that a version 1 app refuses it, and `lesson.json`, which carries 2 since a lesson's goal and self-check became fields (version 1 lessons still load, marked `outdated`). Loaders reject unknown versions.
- **File maps.** Author input is a file map: `{ "relative/path": "text" }` over MCP, or a directory for the CLI.
  - Paths must be relative, `/`-separated, with no `.` or `..` parts.
  - Track and exercise paths may not contain `:` or have a name ending in `.` or a space (`assertPortablePaths`). These are the cases that break a checkout on Windows; other names Windows rejects are not checked.
  - At most 256 files and 1 MB in total.
  - Directory input may not contain symlinks or special files.
  - Roadmap YAML may be at most 64 KB and 200 concepts.
- **Writing.** code-learn writes only into fresh temp folders that it then renames into place. The exception is workspace materialization: it refuses any path whose existing components include a symlink, and it never overwrites an existing learner file.
- **Subprocesses** always take argument arrays. code-learn never interpolates into a host shell.
- **Known limitation: symlink race.** Node has no directory-anchored, no-follow traversal (`openat`). code-learn checks every ancestor with `realpath` and opens files with `O_NOFOLLOW` and `O_EXCL`. A local process that swaps a parent folder for a symlink in the microseconds between the check and the write could still redirect one write. Such a process already has the learner's own permissions, so it gains nothing.

## 4. Tracks and the judge

### 4.1 Track contract

```
track.yaml
Dockerfile
...files the Dockerfile copies (test scripts, report converters)
probe/<style>/pass/    a correct solution
probe/<style>/fail/    a wrong solution
probe/<style>/tests/   io: NN.in + NN.out (hand-written) · unit: test files
```

```yaml
id: python
version: 1
styles: [io, unit]
files: [main.py]            # learner-editable files
build: "..."                # io only, optional: run once before the cases
run: "..."                  # io: required; reads stdin, writes stdout
test: "..."                 # unit: required; see 4.2
limits: { time_ms: 2000, memory_mb: 256 }   # optional; clamped to the host ceilings in 4.3
```

### 4.2 Running a check

- **One container per test set.** Visible and hidden tests run in separate containers, so code running against visible tests can never read hidden ones. Learner or reference files are copied into a fresh host folder (a run folder, §4.3) mounted read-only at `/work/src` (the working directory). That set's tests are mounted read-only at `/work/tests`. The only writable location is a size-capped tmpfs at `/tmp`, and `HOME=/tmp`.
- **No output mount.** The driver writes results to stdout as length-framed records (`@@code-learn <kind> <name> <exit> <bytes>` followed by exactly that many bytes). The host parses them sequentially and stops reading past the cap.
- **The driver** is a POSIX `sh` script, written by code-learn and run as PID 1 with the entrypoint overridden. It first checks for `sh`, `timeout`, `head`, `wc` and `cat`; a missing utility is a track error.
- **io:**
  1. Run `build` once, with a 60 s limit.
  2. A generated input (`NN.gen`, §6) is written first: the driver runs the script with `sh`, at most 30 s and outside the case's time limit, into `/tmp/in`, which is removed after the case. If a generator fails, the program doesn't run. Gate 2 reports it, and the reference's fast run (gate 3) gives each generator a third of its 30 s, so a later run has room. A failure in any later run isn't the solution's doing: gates 4 to 7 fail the save rather than count a mutant as caught, and a check or test records nothing (§4.3).
  3. Run `run` per input with `timeout`, capturing stdout to `/tmp`. Output longer than 32 MB is an `error` ("printed more than 32 MB"), never a comparison of the first 32 MB, and a reference that does this fails the gates.
  4. Run `kill -9 -1` after each case so leftover processes can't affect the next one.
  5. Expected outputs never enter the container. The host compares output after converting CRLF to LF and removing trailing whitespace per line and at the end. It reads the frames as they stream and keeps only the first 64 KB of each case's output, for messages and Results; the comparison uses the SHA-256 of all of it, normalized, hashed as it comes (only a line's trailing whitespace waits), so a long output is never held whole. It reads at most three frames per case plus two; more were forged and are ignored. An expected output over 64 KB is recorded the same way: its digest, its size and its first 64 KB.
- **unit:**
  1. Run `test` with `TESTS=/work/tests` and `OUT=/tmp/report.json`, in that set's own container.
  2. `test` must exit 0 whenever it wrote a valid report, including when tests fail. A non-zero exit or an invalid report is `error`.
  3. A report is `{ "tests": [ { "name", "status": "pass"|"fail"|"error", "message"? } ] }`. It must be non-empty, with unique names.
- **Unit inventory.** When an exercise is verified, code-learn records the reference's test names for each set. At check time, a test missing from the learner's report counts as `error`, and unknown extra names are ignored, so the denominator never shrinks.
- **Known limitation: results can be forged from inside.** The driver (PID 1) holds the container's output stream on a saved descriptor while a case runs. A program running as the same user could write forged frames to it through `/proc/1/fd`. This doesn't weaken host isolation, but it does mean grading is honor-system, consistent with §1 and §2. Tamper-proof grading would need a separate trusted grader and is out of scope for 1.0.
- **Progress.** `testExercise` and `checkExercise` take an optional callback with `{ phase, done, total }`:
  - `phase` is `building`, `visible` or `hidden`;
  - io reports the build, then each visible test as it finishes, counted from the frames as they stream;
  - each visible io test also arrives with its result (`test`: name, status, message and output, graded as Results grades it), so the app can print it as it finishes. Only visible cases are handed over; hidden ones only count. The final grade still decides: an output flood or a memory kill afterwards makes every test an error;
  - hidden tests, and unit tests (whose runner reports at the end), report their phase once with `total` 0, so nothing per hidden test, not even timing, leaves;
  - a listener that throws is dropped, and the check goes on.
  Code in the container could print extra frames, but that can only move progress, never a grade.
- **Learner-facing words.** Messages name the learner's files as they know them (`/work/src/main.py` is `main.py`, `/work/tests/x` is `tests/x`), in results and in Run's streamed errors, and say how a program ended in words ("It stopped with an error", "The build failed"), never an exit code. Gate diagnostics for authors keep exit codes.
- **Disclosure.** Visible results include messages and program output. Hidden results include only an index and a status (`{ name: "hidden #2", index: 2, status }`, built in one place, `grading.redact`): no messages, output or names leave code-learn, in tool output, CLI output or gate diagnostics. The reference is hidden code too, so its gate diagnostics carry no build output, errors or test messages (§6). That costs authors detail by design: in the desktop an author job has only code-learn's tools and can't build the reference itself, so each reference failure says which phase and which visible tests failed, and what to check.

### 4.3 Host-owned sandbox settings

> The container flags below are replaced by bubblewrap and a systemd user scope (§4.6), flag for flag; the run folders, time and output ceilings and the limits table still hold.

Every judge container gets:

- `--rm`, a unique `--name` and the label `code-learn=1`;
- `--network none`;
- `--read-only` and `--tmpfs /tmp:rw,exec,nosuid,nodev,size=256m`;
- `--memory`, with an equal `--memory-swap`, from `min(limits.memory_mb, 2048)`;
- `--cpus 2` and `--pids-limit 256`;
- `--security-opt no-new-privileges` and `--cap-drop ALL`;
- `--user <uid>:<gid>` on POSIX, and `--user 65534:65534` (the unprivileged "nobody") on Windows, which has no uid;
- `--entrypoint /bin/sh`, `--no-healthcheck`, and `--log-opt max-size=1m`.

**Run folders.** The files a container mounts (the learner's or reference files, the tests) are staged on the host before it starts.
- **Where:** `<real path of $CODE_LEARN_HOME>/runs/<pid>-<random>`, one folder per container run, made by `stageRunFolder` (`src/runs.ts`). The OS temp folder is never used. Engines that run in a VM share only the home folder with it by default (Colima, Rancher Desktop, Podman), not macOS's `/var/folders`, so a bind mount from there fails with exit 125 ("the container couldn't start") while the self-test, which mounted nothing, passed.
- **The real path** (`realpathSync.native`) is what the engine is asked to mount, so a linked home, a Windows short name (`JOHNSM~1`) and a non-ASCII user folder are mounted by the name that exists.
- **Created and removed by the run that owns it.** `mkdtemp` makes the folder, empty and private, and it is filled before the container starts. The run removes it when the container is gone, whatever the result. A removal that fails (Windows, while the engine lets go) is retried and then left, never a failure of the run.
- **Leftovers.** The folder's name is `<pid>-<six letters or digits>`, so it carries its owner's PID. A run first removes the folders of that name, and that are real folders (not files or links), whose owner process is gone, as `doctor --fix` removes containers whose owner is gone (§10). A live process's folders are never touched, and neither is anything else in `runs/`.
- **Hidden data.** A run folder holds hidden tests while its check runs (after a crash, until the next run removes it), and only under `$CODE_LEARN_HOME`, where hidden data already lives. The desktop's agent has no file access, and a terminal agent that does is under the same advisory limits as for the rest of code-learn's files (§1).
- A `$CODE_LEARN_HOME` that the engine can't see (outside its shared folders) fails the self-test below, with the folder to share, instead of every check.

Other ceilings:

- **Time:** `time_ms` is capped at 120 s per io case or per unit test run (the whole `test` command, compiling included). The host kills the whole set at `build + Σ cases + Σ generators + 30 s`, then runs `docker rm -f <name>`.
- **Output:** inside the container, program stdout and stderr go to `/tmp` and only bounded slices are framed out. Outside, the host counts stdout and stderr of the container process together; past 4 MB, plus 32 MB per io case, it kills the container.

**Limits on the heavy path** (big io, slow tests, heavy stacks). Each is kept, raised or the track's to set, within a bound:

| Limit | Value | Who sets it |
|---|---|---|
| A track's files, an exercise's files (MCP or CLI) | 256 files, 1 MB | fixed; big inputs come from `NN.gen` generators instead |
| Probe example (pass probe + tests) | 64 KB per style | fixed: every author reads it |
| `time_ms` | 100 ms to 120 s, default 2 s: per io case, or a whole unit run | the track |
| `memory_mb` | 64 to 2048 MB, default 256; `/tmp` (256 MB) counts toward it | the track |
| io build, Run's build | 60 s | fixed |
| Input generator | 30 s, outside `time_ms`; a third of it in the reference's fast run | fixed |
| Reference speed (gates) | must pass in a third of `time_ms`; a new track's pass probe in a sixth (a third at the ceiling), so every reference has twice the probe's time; at the ceiling the gate says to make the probe faster | fixed |
| Output per io case | 32 MB; the first 64 KB is kept and shown | fixed |
| Stream per container | 4 MB, plus 32 MB per io case | fixed |
| Unit report | 1 MB; runner log shown 4 KB; each message 2000 characters | fixed |
| Processes, CPUs | 256 PIDs (a JVM build tool with a forked test JVM uses about 20), 2 CPUs | fixed |
| Track build | 10 minutes; 5 GB free to install in the app | fixed |
| Gate runs | one container per test set, sets one after another; the starter, mutant and earlier-solution runs stop an io set at its first error | fixed |
| Run | 120 s, 4 MB of output, typed input 64 KB per write and 1 MB unread | fixed |
| Tool output | a visible test's output and an expected output show at most 64 KB | fixed |

**Termination reasons** decide whether a run counts:

| What happened | Result | Recorded as an attempt |
|---|---|---|
| A case times out (the driver's watchdog, with `timeout` as a backstop), crashes, exits non-zero or prints more than 32 MB | that test is `error` | yes |
| A test's input generator fails during a check (it passed the gates, so this is a slow moment or a program that filled `/tmp` first) | the command fails ("couldn't be generated") | no |
| Learner code fails to build | every test is `error` | yes |
| The stream cap is hit | every test in that set is `error` ("output limit exceeded") | yes |
| The memory limit kills the driver instead of the program: the container exits 137 and the runtime recorded an `oom` event for it | every test in that set is `error` ("memory limit exceeded") | yes |
| The host deadline for the whole set passes, the runtime is missing or stops during the run, the container is killed from outside (any other non-zero exit), or the image is missing or changed | the command fails with an infrastructure error | no |
- **Memory:** every track or learner command first raises its own `oom_score_adj`, so the kernel kills the program rather than the driver, and that case is an `error`. If the driver dies anyway, the runtime's `oom` event tells a memory kill from an outside one. Newer engines (Docker 29) can publish that event a few seconds after the exit, so when the first query finds none, code-learn asks once more 2 s later; only a suspected kill waits. The runtime can still miss the event when a container exits quickly, and then the check counts as an infrastructure failure: nothing is recorded, never a wrong attempt.
- **Why a case was killed:** both kinds of `timeout` exit 137 on a time-out, as a memory kill does, so the exit code can't say which. So a watchdog beside each case (and the unit runner) enforces the limit, as Run's does: it marks the time-out, then `kill -9 -1` stops everything but the driver, and the result says "took longer than N ms". `timeout` backs it up a second later. A 137 without that mark says "ran out of memory (memory_mb N)" when the runtime recorded an `oom` event for the container, else "was killed". The runtime records the event from the container's cgroup a moment after the kill and loses it if the container has already exited, so after such a 137 the driver waits 1 s before it exits. The wording never changes the grade.
- **Volumes:** images that declare `VOLUME` are rejected at install.

**Run (interactive).** `runInteractive` runs the learner's io program once, for the app's Run button. It is never graded or recorded.
- **Sandbox:** the same `startSandboxed` path and every flag above. The only addition is `-i`, which keeps stdin open, so typed lines reach the program.
- **What's mounted:** only the learner's files, at `/work/src`. No tests.
- **Driver:** the build, if the track has one (60 s), then the run command, with stdout and stderr streamed as they come.
- **How it ended:** the driver writes short markers to stderr when each stage starts and how it ended, then exits 0. The host strips the markers from what the learner sees. The first start marker of each stage is reported once, with that stage's limit, so the app can count down.
  - An end marker means the driver finished, so the program's own exit code and output are reported as they are, even when they look like Docker's.
  - **Time limits:** 120 s for the run, because a person is typing, and 60 s for the build. Each stage runs in the foreground, keeping stdin, with a watchdog beside it. At the limit the watchdog writes a timeout marker, then `kill -9 -1` stops everything but the driver, which stays PID 1. A timeout is therefore the driver's own statement: it is never read from an exit code or guessed from timing, and it doesn't depend on which `timeout` tool the image has. The watchdog fires only after `sleep` succeeds; if it can't, the host deadline stops the run. Grading checks the image has `sleep`, so installed tracks have it. No shell reports the kill ("Killed"): a shell writes that on the stderr it gave the killed command, so the program takes the real stderr back itself while the driver's goes to `/dev/null`, and the app's own "time's up" is the only word on it.
  - **Memory:** a stage that ends with 137 and didn't time out is checked against the runtime's memory-kill events, so a program killed for memory says so even though the driver went on.
  - No end marker means code-learn stopped it (the learner, the host deadline or the 4 MB cap), the runtime killed it for memory, or Docker failed. Only that last case is an infrastructure failure.
  - A program could forge markers, but only about its own unrecorded run.
- **Input:** typed input is bounded: one write is at most 64 KB, and at most 1 MB may wait unread. Beyond that, and after the end, input is dropped.
- **Failures:** if Docker's connection drops (exit 125), the container is removed with a checked command.
- **Unit tracks:** they have no run command, so they have no Run.

`code-learn doctor` checks the container CLI and daemon, then runs the self-test (`networkIsolation`, also Check this computer's last row) in this order:
1. **The test image.** A pinned Alpine image, pulled if it isn't there. A pull that fails because the network is down or blocked (DNS, a blocked or slow connection, a proxy, TLS interception, Docker Hub's rate limit) is reported with `kind: "offline"` and its own words (Docker Hub's limit, an intercepting proxy, a plain network failure), not as "inconclusive". A broken credential helper is `kind: "docker"` with its own words; code-learn's 3-minute deadline and a stopped Podman machine stay inconclusive. An out-of-space pull is `kind: "disk"`; any other failure stays inconclusive, with `kind: "docker"`.
2. **A mount, as a check does it.** A container started through the same sandbox (every flag above) with a staged run folder mounted read-only at `/work/src`, which reads a file back. An engine that can't start it, or can't read the file (a folder it can't see arrives empty), fails here with its own words and the folder to share, `kind: "docker"`, instead of failing every check later. If code-learn can't stage the folder (the home isn't writable), that row fails with that reason and the rest of `doctor` still runs.
3. **Isolation.** A test server runs in an ordinary container, and `--network none` must block it while an ordinary container reaches it. A sandboxed container that never ran its test (the engine refused, or 30 s passed) is inconclusive with the engine's words, never "the sandbox reached the network".

`Check` is `{ name, ok, detail, kind? }`: `kind` (`offline`, `disk`, `docker`) is the cause on this computer, as an error's kind is (§10), so a caller acts on it without reading the words.

### 4.6 The native engine (code-learn, Linux)

code-learn runs on Linux only, with one native engine in place of a container engine. A track's language is installed on the learner's computer into its own folder, `$CODE_LEARN_HOME/envs/<id>@<version>/`, by micromamba from conda-forge, and every check runs in a bubblewrap sandbox. Removing a track deletes that folder and nothing else on the computer changes.

**Why these tools.**
- micromamba is one static binary that installs conda packages into any folder without root. conda-forge has prebuilt interpreters, compilers and test tools for most languages (Python, Node, Java, GCC, Rust, Go, Ruby and their test runners), so one package manager serves every track, and code-learn still ships no languages: the track names its packages.
- bubblewrap (`bwrap`) is the sandbox Flatpak uses. It runs as the learner with Linux user namespaces, so it needs no daemon and no root. It gives a check what a judge container had: a private process namespace, no network, read-only mounts and a size-capped `/tmp`.
- `systemd-run --user --scope` puts each sandbox in its own cgroup, which caps memory, processes and CPU as Docker's `--memory`, `--pids-limit` and `--cpus` did.

**Computer requirements.** `doctor` checks each one, and a check fails with an infrastructure error naming the missing one:
- Linux x86_64, not running as root (a sandbox run as root would own every mounted file);
- `bwrap` 0.9 or later (for `--size`), with unprivileged user namespaces enabled;
- a systemd user session that delegates the `memory`, `pids` and `cpu` controllers (the default on current desktop distributions);
- `/usr/bin/sh` with `timeout`, `sleep`, `head`, `wc`, `cat` and `basename` (the driver's tools, §4.2);
- micromamba 2: the path in `CODE_LEARN_MICROMAMBA`, else `micromamba` on `PATH`. The desktop app bundles a pinned micromamba and passes `CODE_LEARN_MICROMAMBA`.

**Track contract.** A `toolchain` block replaces the Dockerfile:

```
track.yaml
...other files: copied to /opt/track with probe/ (test scripts, report converters, package.json)
probe/<style>/pass/ · probe/<style>/fail/ · probe/<style>/tests/   (as §4.1)
```

```yaml
id: python
version: 1
styles: [io, unit]
files: [main.py]
run: "python main.py"
test: "python /opt/track/run_tests.py"
limits: { time_ms: 2000, memory_mb: 256 }
toolchain:
  packages: ["python=3.13", "pytest=9"]   # conda-forge match specs
  setup: "pip install --no-deps pytest-json-report==1.5.0"   # optional
  env: { PYTHONDONTWRITEBYTECODE: "1" }   # optional
```

- `packages`: 1 to 64 conda match specs, each 1 to 100 characters from `A-Z a-z 0-9 _ . - = < > ! , *`, starting with a letter or digit. code-learn passes them to micromamba as separate arguments, with `--override-channels -c conda-forge`, so a track can't name another channel.
- `setup`: optional, at most 4 KB. It runs once at install, after the packages, as `/bin/sh -c`, with network, in `/opt/track`. It is for what conda-forge doesn't package, such as `npm ci` or a `pip install`.
- `env`: optional, at most 32 names matching `^[A-Z_][A-Z0-9_]*$`, each value at most 1 KB. Names the sandbox sets itself (`PATH`, `HOME`, `TRACK`, `TESTS`, `OUT` and every `CODE_LEARN_*`) are refused.
- A track with a `Dockerfile` or a `wasi` block is refused, saying to write a `toolchain` block.

**Installing a track.** The probes and gates of §6 follow.
1. Check that 5 GB is free under `$CODE_LEARN_HOME`.
2. Make a staging folder `$CODE_LEARN_HOME/envs/.staging-<pid>-<random>/` with `env/` and `track/`, and copy the track's files (all but `track.yaml`) into `track/`. The probes are included, so `setup` can run the track's own build once on the pass probe to cache its dependencies; every author receives the probes anyway.
3. Run micromamba in an install sandbox: the sandbox below, but with the network shared, `/etc/resolv.conf`, `/etc/hosts`, `/etc/nsswitch.conf` and the system certificate folders mounted read-only, staging `env/` writable at `/opt/env`, staging `track/` writable at `/opt/track`, the package cache `$CODE_LEARN_HOME/pkgs` writable at `/opt/pkgs`, and micromamba read-only at `/opt/micromamba`. Command: `/opt/micromamba create -y -p /opt/env --override-channels -c conda-forge <packages...>` with `MAMBA_ROOT_PREFIX=/opt/pkgs`.
4. Run `setup`, if any, in the same install sandbox.
5. Steps 3 and 4 share one 10 minute limit (the track install limit in §4.3), 4 GB of memory and 1024 processes. Their log is streamed as build progress and capped as a Docker build's was.
6. Rename the staging folder to `envs/<id>@<version>/`. A rebuild renames the old folder aside first (`.discard-<pid>-<random>`), then removes it.
7. `track.json` records `toolchain: { packages, setup, env, resolved }`, where `resolved` is the sorted list of installed package file names from `env/conda-meta/` (for example `python-3.13.9-h9e4cba3_100_cp313`). It takes the place of the image ID.

The environment is always mounted at `/opt/env`, both at install and when checks run, because conda packages store their install path inside some files. That is why the staging folder can be renamed: the path inside the sandbox never changes.

**Running a check.** The command is an argument array. `--expand-environment=no` (systemd 254 and later; older systemd-run doesn't expand) stops systemd-run replacing `$NAME` and `$$` in the driver, which is shell code for the sandbox.

```
systemd-run --user --scope --quiet --collect --unit=code-learn-<pid>-<random> --slice=app.slice --expand-environment=no
  -p MemoryMax=<memory_mb>M -p MemorySwapMax=0 -p TasksMax=256 -p CPUQuota=200% -p OOMPolicy=continue
  -- bwrap <flags> /bin/sh -c <driver>
```

| Docker flag (§4.3) | bubblewrap equivalent |
|---|---|
| `--network none` | `--unshare-all` (network, PID, IPC, UTS, cgroup and user namespaces); only loopback exists |
| `--read-only`, tmpfs `/tmp` 256 MB | `--ro-bind` for every mount, `--size 268435456 --tmpfs /tmp` |
| `--memory`, `--memory-swap` | `MemoryMax`, `MemorySwapMax=0` |
| `--cpus 2`, `--pids-limit 256` | `CPUQuota=200%`, `TasksMax=256` |
| `--cap-drop ALL`, `no-new-privileges` | bubblewrap drops capabilities and always sets `no_new_privs` |
| `--user <uid>:<gid>` | the learner's own uid; `/etc/passwd` and `/etc/group` are generated with one entry each |
| `--rm`, label `code-learn=1` | `--die-with-parent`; scopes are named `code-learn-<pid>-…` |
| PID 1 driver | `--as-pid-1`: the driver is PID 1, so a program inside can't kill it, and its `kill -9 -1` spares it |

The sandbox sees only these paths:
- `/usr` read-only, with `/bin`, `/sbin`, `/lib` and `/lib64` made as the host has them (links into `/usr` on merged-usr systems, read-only binds otherwise);
- from `/etc`, only `ld.so.cache`, `localtime` and the generated `passwd`, `group` and `hosts` (`127.0.0.1 localhost`);
- `/proc`, `/dev` (bubblewrap's minimal set) and `/tmp`;
- the environment at `/opt/env` and the track's files at `/opt/track`, read-only;
- the run folder's `src` at `/work/src` (the working directory) and the set's `tests` at `/work/tests`, read-only.

The learner's home folder, `$CODE_LEARN_HOME` and the rest of the computer are not visible. The environment is `--clearenv`, then `HOME=/tmp`, `PATH=/opt/env/bin:/usr/bin:/bin`, `TRACK=/opt/track`, `LANG=C.UTF-8`, the track's `env`, and the driver's own variables.

- **Driver.** The io and unit drivers of §4.2 run unchanged, so frames, grading, digests and disclosure are unchanged.
- **Time.** The host deadline of §4.3 kills bubblewrap with `SIGKILL`, which ends its PID namespace and every process in it. Then `systemctl --user stop <scope>` runs as a backstop.
- **Memory.** A program over `MemoryMax` is killed with exit 137 while the driver goes on (`OOMPolicy=continue`). The kernel counts the kill in the scope's `memory.events`. The host reads the scope's `ControlGroup` once the scope exists, and reads `oom_kill` from `memory.events` when a 137 frame arrives that has no time-out mark. The driver waits a second before it exits in that case (§4.2), so the scope is still there. If the driver itself was killed and an `oom_kill` count was seen, the run is `outOfMemory`; otherwise it is the infrastructure error `runtime-failed`.
- **Leftovers.** Run folders are swept as in §4.3. `doctor --fix` stops scopes named `code-learn-<pid>-…` whose owner process is gone.

**Run** (the learner's program, interactively) uses the same sandbox with Run's driver and limits.

**Removing a track.** `code-learn track remove <id>@<version>`, and the matching desktop action, delete the track's record and its `envs/` folder under the track lock. It is refused while a course uses the track, and the message names those courses by title (by id when a course has none). The package cache `pkgs/` holds only downloads. Deleting it frees space and never breaks an installed track. Deleting `$CODE_LEARN_HOME` removes everything code-learn installed.

**Renaming and deleting a course.** `renameCourse` changes only `title` in the course's `course.json`, under the course lock. `deleteCourse` (the desktop's Courses page) removes the course's folder under its course lock: roadmap, lessons, exercises and `events.jsonl`, so the attempts and mastery go with it. This relaxes the append-only log for a deleted course, as the learner approved. It also removes the learner's `exercises/<course>/` folder and clears the workspace's pointers to the course. The course's toolchain stays installed. A folder without `course.json` is not a course, so a lock taken after a delete leaves no ghost course behind.

**Security compared with Docker.**
- The program shares the host kernel, as a container does.
- It can read the host's `/usr`, where a container saw only its image. `/usr` holds system programs and libraries, not personal data.
- It can't see home folders, other users' files, the network, hidden tests of another set, or code-learn's store.
- §4.2's known limitation stays: a program can forge frames through `/proc/<driver>/fd`. Grading remains honor-system.
- The install sandbox has network access and runs the track's `setup` and the packages' own install scripts. It can write only the staging folder and the package cache. The learner's consent before an install (§4.6) is still the trust point.

**The desktop app on Linux.** The app is Linux x86_64 only, shipped as an AppImage. Its Docker Desktop, WSL, macOS and Windows code is removed. The changes to its API (`desktop/src/shared/api.ts`):
- "Check this computer" has two checks in order: `sandbox` (bubblewrap 0.9 or later and a reachable systemd user session, core `sandboxDown`) and `isolation` (core doctor's self-test). A failed `sandbox` check carries core's message and, when bubblewrap is missing, the install command for this distribution, read from `ID` and `ID_LIKE` in `/etc/os-release`: `sudo pacman -S bubblewrap` (Arch and derivatives), `sudo apt install bubblewrap` (Debian, Ubuntu), `sudo dnf install bubblewrap` (Fedora), `sudo zypper install bubblewrap` (openSUSE). The app runs no command as root. `Computer` is `{ checks, ready }`; `installDocker`, `openDocker`, `openWindowsUpdate` and `restartWindows` are removed, and so is the WASI fallback.
- The bundled micromamba (pinned by SHA-256, from the micromamba-releases project on GitHub) replaces the bundled wasmtime. The app passes `CODE_LEARN_MICROMAMBA` to its core and to every MCP server it starts.
- "Not counted" reasons and setup problems use core's kinds: `sandbox`, `sandbox-busy` (`check-timeout`), `disk` and `offline`. The Docker and WASI reasons are removed.
- Tracks gains a **Remove** action (core `removeTrack`), refused with core's message while a course uses the track.
- Automatic updates are off until code-learn publishes its own releases; without a configured feed the update check contacts nothing.

**Phases.** Each phase keeps the build, type check and tests green:
1. The native engine in the core, with tests that run real bubblewrap.
2. Remove the Docker and WASI engines and their tests from the core, in the same change as phase 1: Docker can't be tested on a computer without it, so the two engines never coexist.
3. Name everything code-learn: the `code-learn` command, `CODE_LEARN_*` variables, `~/.code-learn`, the `code-learn` MCP server, and code-learn as the desktop app's name. (Done before phase 1.)
4. Desktop: Linux only (AppImage); drop Docker Desktop, WSL and the macOS and Windows code; bundle micromamba; a computer check for the requirements above; a Remove action for tracks.
5. Journey: a real agent installs a Python and a Java track and passes an exercise in each, from the packaged app.

## 5. Roadmaps (courses)

```yaml
title: "React"              # optional: the course's name in a few plain words, at most 60 characters
goal: "Components and state in React"
track: react@1              # absent for quiz, optional for none; may not be installed yet
style: unit                 # io or unit offered by the track, quiz, both (code and quizzes), or none for lessons only
concepts:
  - { id: react.jsx, title: "JSX", requires: [] }
  - id: react.state
    title: "State with hooks"
    requires: [react.jsx]
    practice: "Fix a component that stores a derived value instead of calculating it"
    pitfalls: ["Duplicating state that can be calculated from existing state"]
    refs: [0]
sources:                    # optional: the roadmaps and docs the agent used, at most 10
  - { title: "React docs: Thinking in React", url: "https://react.dev/learn/thinking-in-react" }
practice_note: "..."        # optional: why code exercises may not fit the subject, at most 300 characters
```

- **First save** creates the course. Concept order in the file is the tie-break order.
- **Title** is optional: the course's name as the learner would say it, which the desktop app shows (desktop §4.13). Blank space around it is dropped. A course without one is named by its goal.
- **Sources** are optional: at most 10, each a `title` of at most 120 characters and an https `url` with no credentials. The app shows them and opens them only in the learner's browser.
- **Practice and pitfalls** are optional on each concept: `practice` is trimmed, 1 to 300 characters; `pitfalls` has at most 5 strings, each 1 to 200 characters. They are checked for structure only.
- **Lessons only.** In a course with `style: none` nothing is graded. `practice` says what the learner will be able to do or explain after the lesson, and no concept is folded away for lacking a graded activity.
- **Practice note** is optional, at most 300 characters: the planner's note, when code practice was asked for, that code exercises may not fit the subject, and what fits better. It changes no rule; the desktop app shows it before approval.
- **Refs** are optional on each concept: at most 10 distinct nonnegative integer indexes into `sources`, starting at 0. Every ref must be in range. When sources are nonempty, a concept with `practice` or nonempty `pitfalls` must have at least one ref.
- **Lessons only.** `style: none` needs no track. `CourseStyle` is `ExerciseStyle | "none" | "both"`; `ExerciseStyle` is `Style | "quiz"`. `Style` stays `io | unit` for tracks and lesson examples. A course may keep its track when activities are off. Exercise saves, `get_exercise`, `check` and `test` are refused; lessons, notes and reads still work. Examples need an installed track.
- **Quiz.** `style: quiz` has no track. It needs no setup, Docker or WASI. Tracks cannot offer quiz. Quiz and lessons only can switch both ways without changing history. A quiz course with exercises cannot become a code course, since that would change its track.
- **Mixed.** `style: both` needs a track, like io or unit, and holds code exercises and quizzes. A code exercise's `exercise.yaml` leaves `style` out (or repeats the track's style); a quiz says `style: quiz`. Code runs in the track's first style (`codeStyleOf`), so a track offering both io and unit gives io. Each exercise is gated and graded in its own style. Its `course.json` is format 2. A mixed course can't become io or unit while it has quiz exercises. Like a quiz course, a stuck concept starts fresh when its lesson is read. Examples in its lessons run in the track's first style.
- **A draft track.** The track may not be installed yet. Then `next_step` returns `setup` until it is. Proposing or installing a track that a course names but whose styles lack that course's coding style is refused, so a course can't be stranded; an install checks this under the track lock, which roadmap saves also take (after the course lock). `next_step` fails with "Edit the roadmap's style" if an installed track still doesn't offer it. Exercises, `get_exercise` and `check` need the installed track.
- **Re-saving** an existing course may change `title`, `goal`, concept titles and order, add concepts, and change `requires` while staying acyclic. Edits keep concept ids, so renaming changes only the title. It may change `track` while the course has no exercises. Switching activities off or on is an ordinary re-save of `style`; turning them off keeps the track. The event log, exercises, mastery and lesson reads stay unchanged. Without a track, a save takes only the course lock; with one, it also takes the track lock.
- **Re-saving is rejected** if it changes `track` after exercises exist, or removes a concept that an exercise, event or lesson uses.
- **A fresh start.** When a re-save adds a prerequisite to a stuck concept, code-learn appends a `retry` event for it (§7).
- **Saving makes it active:** it sets the course in `code-learn.json` for the bound workspace.
- Course ids are global within `$CODE_LEARN_HOME`, so the same course can be opened from any workspace.

### Lessons

- **Saving.** `save_lesson { id, concept, title, markdown, goal, selfCheck, examples? }`: the id is new in the course, the concept is in the roadmap, and the Markdown is at most 64 KB. `goal` is what the learner will be able to do (at most 300 characters); `selfCheck` holds 1 to 3 self-check questions, each with its answer. The app shows the goal above the text, the self-check after it with each answer closed, and the concept's sources (its `refs` into the roadmap's `sources`) last, so every lesson is framed the same way. The text itself has no required outline: a fixed list of headings made every lesson the same recipe whatever its subject needed. `get_lesson` returns the goal, the self-check and the sources; a lesson saved before these were fields has none, and is marked `outdated` so the learner can rebuild its topic. `get_roadmap` also lists the course's lessons (id and concept), so a lesson's writer can read the ones its topic requires. A lesson without examples needs the course, not an installed track.
- **Examples.** A lesson may carry up to 5 runnable examples, each a file map of at most 64 KB:
  - Each holds exactly the installed track's learner files; for a unit course, it adds test files under `tests/`.
  - The Markdown places example N as an unindented fence (``` or ~~~) whose info string is `example`, then one line holding N, then the closing fence. A fence inside another fence (which may be indented up to 3 spaces) is shown, never run. Every example is placed, and every placement names an example. Examples hold at most 250 files in all.
  - The lesson records the track and style its examples were checked with, and they always run with those. In a lessons-only course, new examples use the retained track's first offered style; `get_roadmap` returns that contract too.
  - The gate: under the course lock, then the track lock, each example runs in the track's image exactly as a check runs code, with the same sandbox and limits. io runs the build and run commands once, with empty input; unit runs the test command on the example's tests. Each must exit 0 within the limits. A runtime failure is infrastructure and saves nothing.
  - Examples need the installed track, and `get_roadmap` over MCP includes the track's contract once it's installed.
- **Running.** `runExample(ws, lesson, n)` runs a saved example the same way and returns its exit code, output (capped at 16 KB) and errors (capped at 4 KB). It is never recorded. `runExampleLive(ws, lesson, n, bound, output)` runs an io example interactively instead, as Run does for an activity (`runProgram`): its output streams, and the learner's typed input reaches its stdin. It checks the files against the recorded track first, and is never recorded either. A unit example has no live run.
- **Diagrams.** The Markdown may hold diagrams and charts: top-level fenced blocks (``` or ~~~) whose info string is `mermaid` (flowcharts, sequence, state and class diagrams, pie and xy charts). The text is still checked for structure only: core accepts any fence, never parses or draws one, and a diagram is not an example. The app draws it (desktop §4.3).
- **Storage.** `lesson.md` never changes after saving: the only change is a rebuild, which removes it and its exercises (below). The learner's `notes.md` (at most 64 KB) sits beside it. Writes are atomic and hold the course lock.
- **Rebuild.** `rebuildTopics(ws, course, concepts, { replace })` (`src/app/rebuild.ts`) asks for fresh content on some topics. Every id must be in the roadmap, and at least one is needed. With `replace`, under the course lock, the chosen topics' lessons go, and so do the exercises whose concepts are all chosen, with their learner files. Then a `rebuild` event (§7) restarts those topics' progress. The log itself is never edited. Without `replace`, nothing changes on disk. Either way the agent then writes new lessons and exercises, and their ids and slugs are new: a removed id or slug is never reused, since its events stay in the log.
- **Reading.** `get_lesson` returns the text, the notes and the examples, and records nothing. A lesson with examples also names their `style`, which says how they run. Only an acknowledgement records a read: `mark_lesson_read` appends a `read` event the first time.

## 6. Exercises and gates

```
exercise.yaml                { slug, style?, concepts, difficulty (1..3), hint? }
README.md
starter/<files>              must contain every file in track.files
solution/<files>
mutants/<name>/<files>       2 to 4 wrong solutions
tests/visible/...            io: NN.in, or NN.gen (a POSIX sh script whose output is the input) · unit: test files
tests/hidden/...
```

A failure goes back to the caller with the failing gate and capped output. Hidden inputs and expected outputs never appear in diagnostics returned to tools. Neither does anything the reference or a mutant printed, since building or running them runs hidden code: a reference failure names its phase, exit codes and statuses: visible tests by name (io cases only by the inputs the author gave), hidden ones by number, and a failed build by the track's build command and what to check. A unit reference whose runner reported no test (it shows as `report`) is told why from what code-learn knows: a time, memory or output limit stopped it, or else the tests or the reference didn't load, with what to check, still without its output. A track gate's failure shows the last lines of what the track's own build or probes printed (track files only, never an exercise's), and that output never sets the failure's kind.

**Track gates:**
1. The files are valid, each style's pass probe and probe tests total at most 64 KB (authors receive them as the track's example), and `id@version` is either new or identical to the installed one, in which case the install is a no-op.
2. The image builds and declares no volumes.
3. For each style, the pass probe passes everything.
4. For each style, the fail probe gets at least one `fail` and no `error`.
5. The pass probe passes again with a sixth of the time limit, half of what every exercise's reference gets (gate 3 below), and gives identical results. A probe that only fit a third left tracks whose framework starts once per io case flaky at every exercise's speed gate. At the `time_ms` ceiling, which can't be raised, and on a rebuild (an installed track's files can't change), it keeps a third. A track that fails here is told to raise `limits.time_ms` or `limits.memory_mb`, or, when `time_ms` is already at its ceiling, to make the command faster (cache everything at build time, and call the compiler and test runner directly rather than a build tool).

**Roadmap gate:** the schema and §5 rules hold, there are no unknown prerequisites, and there are no cycles (Kahn's algorithm). Every concept ref is in range of `sources`; when sources are nonempty, each concept with `practice` or nonempty `pitfalls` has at least one ref.

**Exercise gates:**
1. **Valid:**
   - the schema validates and the slug is new in the course;
   - the style (defaulting to the course's) is one the track offers;
   - the concepts exist in the roadmap;
   - the learner files are present in starter, solution and every mutant;
   - there are at least 1 visible and 2 hidden tests, and 2 to 4 mutants;
   - io tests are `NN.in` or `NN.gen`, never both for one `NN`, and no `.out` files.
2. **Reference passes:**
   - io: no `error` on any input, and identical output on two runs, which becomes the expected output;
   - unit: everything passes on two runs with identical results, which becomes the inventory.
3. **Reference is fast:** it still passes with a third of the time limit.
4. **Starter is unsolved:** the starter does not pass everything.
5. **Mutants are caught:** each mutant fails or errors on at least one hidden test. A copy of the reference is caught by this gate too.
6. **Hidden tests matter:** at least one mutant passes every visible test.
7. **New task:** no earlier exercise's solution on the same track passes every visible test. To bound the wait, it compares at most 3 earlier exercises on a shared concept and the 3 most recent others: at most 6 runs of the visible tests. The author sees the earlier exercises' titles and first lines in `next_step`'s `earlier`, never their solutions or tests. It also sees `taught`, the titles of the roadmap's topics before its own, so the task uses nothing from a later topic.

Gates 4 to 7 only ask whether everything passes, so their io runs stop a set at its first error: a slow wrong solution costs one time limit per set, not one per case.

**Quiz gates.** A quiz has exactly `exercise.yaml` (`style: quiz`), `README.md` (the scenario) and `quiz.yaml`. The latter holds `questions`, each with `text` and `choices`. Each choice has `text`, optional `correct: true`, and `why` for a wrong choice. It stays in the store.

1. The schema validates, the slug is new and the concepts exist.
2. There are 5 to 10 questions, each with 3 to 5 choices, exactly one marked correct and a nonempty `why` on every wrong choice. Question text is at most 1000 characters, choice text 300 and `why` 500; invalid quiz diagnostics list the limits without quoting private content.
3. Choice texts within a question differ, ignoring case and spacing.
4. No question repeats another in this quiz or one from an earlier quiz in the course, ignoring case and spacing. Rewordings can pass; the gates do not prove the key is right.

These replace the code gates and run without a sandbox, under the course lock only. Once they pass, each question's choices are shuffled once with Fisher–Yates using `node:crypto`'s `randomInt`, independently of the public slug, and stored through the same atomic commit. That stored order is the only order; reads never shuffle again. The workspace receives only `README.md` and `answers.yaml`, with each question number mapped to null initially. The learner replaces null with a choice number; both start at 1.

**Quiz grading.** Grading is pure: `passed` counts right answers and `total` counts questions. Missing or null answers are wrong. Invalid question or choice numbers are refused. Each result shows right or wrong; a wrong answer includes only the picked choice's `why`. It never identifies the right choice or shows an unpicked explanation. Test is refused with "A quiz has no practice run. Check it when you're ready." Run is unavailable.

**Commit point.** After the gates pass, the exercise folder is renamed into the store under the course lock. Learner files are then materialized into the workspace. `get_exercise`, `test` and `check` re-materialize any missing learner files, so a crash between the two steps is recoverable.

## 7. Learner model

`events.jsonl` is the only learner state. It holds `check`, `skip`, `assist`, `retry`, `read` and `rebuild` events, and everything below is recomputed by replaying them in order.

- **`check` event:** `{ kind: "check", at, exercise, concepts, difficulty, passed, total, assisted, missed? }`. `missed` is `{ visible: string[], hidden: number[] }`: tests that didn't pass, with visible names and 1-based hidden indexes exactly as `check` shows them. Each list keeps its first 50 entries. Hidden names, inputs, messages and outputs are never recorded in it. A perfect check omits `missed`; older events without it still parse. It is recorded only when grading completed. Infrastructure failures record nothing: no container runtime, a missing image, or a host-side kill of the whole check. Learner-caused outcomes are graded, as `error`: build failures, timeouts and output floods. A check whose learner files are byte-identical to the starter is graded and shown but no `check` event is recorded (`recorded: false`): it isn't an attempt, so it can't count toward the fail streak, lower mastery or take the first try. Assistance and the current exercise are still updated as for any check.
- **Quiz checks.** A quiz is checked only when every question is answered: grading one answer at a time would reveal the key, as Test would. Only the first check is recorded; later ones are graded with `recorded: false`, and the course lock makes concurrent checks obey the same rule. `missed.visible` holds wrong question numbers as strings, and `missed.hidden` is empty. A recorded quiz check changes mastery, difficulty, reviews and stuck state by the same rules as code.
- **`skip` event:** `{ kind: "skip", at, concept }`. "Come back later": it defers the concept until a `check` of an exercise written for it (the exercise's first concept, the one `next_step` asked for) and never changes mastery. A check of a later concept's exercise that also lists it ends nothing. While deferred, the concept counts as met for unlocking the concepts that require it, so a learner whose activity can't be written still moves on; it never counts as mastered, so it never finishes a course, and it comes back once nothing else is open.
- **`retry` event:** `{ kind: "retry", at, concept }`. It resets the concept's fail streak, so a stuck concept isn't stuck, and leaves mastery and difficulty unchanged (§5).
- **`read` event:** `{ kind: "read", at, lesson, concept }`. The learner acknowledged a lesson. It never changes mastery.
- **`rebuild` event:** `{ kind: "rebuild", at, concepts }`. The topics were rebuilt with replacement (§5). Each listed concept's state starts afresh from here: mastery, difficulty, streaks, attempts, deferral and review schedule. Earlier events stay in the log and still count for other concepts.
- **`assist` event:** `{ kind: "assist", at, exercise }`. It marks that exercise as assisted for good, in every workspace.

For each `check`, in order, for each concept it lists:

1. **First try:** the first `check` of this exercise.
2. **Repeat pass:** a perfect check on an exercise that already has a perfect check. It changes nothing (no mastery, no difficulty, no streak), so re-checking a solved exercise can't inflate mastery.
3. **Mastery** moves only on an exercise's first check, or when its score beats that exercise's best so far. Re-running the same partial solution adds nothing. On those checks, `m += 0.3 × w × (s − m)`, where `s = passed/total`, `w` is 1, or 0.25 if assisted, and m starts at 0.5. A concept is mastered at `m ≥ 0.85`.
4. **Perfect check:** sets `failStreak = 0`. If it was the first try and unassisted, difficulty goes up by 1 (max 3, starting at 1).
5. **Otherwise:** `failStreak += 1`. If `failStreak ≥ 2` and difficulty > 1, difficulty goes down by 1 and `failStreak` resets to 0.
6. **Stuck:** a concept is stuck while difficulty is 1 and `failStreak ≥ 2`.

**Assistance.** A check is assisted if assist mode is on in the workspace, or the course log has an `assist` event for that exercise. While assist mode is on, code-learn records an `assist` event for every exercise that becomes current (`get_exercise`) or is checked, unless that exercise already has one. Turning assist mode off doesn't remove them.

**Reviews.** When a check first makes a concept mastered, its first review is due 1 day later. The first check of that concept at or after the due time is the review:

- a perfect check moves to the next interval: 3, then 7, 21 and 60 days after that check. After the 60-day review there are no more;
- any other check lowers mastery below the threshold (to at most 0.75), so the concept is practised again, and mastering it again starts over at 1 day.

Checks before the due time are ordinary checks. A concept that drops below mastery any other way loses its review too.

**Next step for courses with activities**, in order:

1. For code, if the roadmap's track isn't installed, return `setup` with the track. Quiz skips this step.
2. If a mastered concept's review is due, the earliest due first: return `review` with the concept, its difficulty and an exercise of that concept at that difficulty the learner has never checked; if there is none, return `author` with `review: true`.
3. Candidates are concepts that aren't mastered and whose prerequisites are each mastered or deferred (skipped since a check of an exercise written for them), in topological order with ties broken by roadmap order.
4. Among candidates that aren't deferred, take the lowest mastery; the first in order wins ties. If every candidate is deferred, take the first in order.
5. If that concept is stuck, return `stuck`. The tutor re-teaches; in a quiz or mixed course, acknowledging a lesson for that concept (including re-acknowledging an older lesson) appends the existing `retry` event under the course lock, the smallest way to reset its streak without changing learner rules or recording another check on a quiz.
6. Otherwise, if an exercise exists for that concept at its current difficulty with no perfect check, return `practice`. The earliest-created such exercise wins. Before applying these rules, `pickFor` leaves out every quiz with a recorded check, including failed ones. It therefore asks for a new quiz rather than offering an unrecordable retry forever. Two failed quizzes at difficulty 1 make the concept stuck, just like two failed code checks.
7. Otherwise return `author` with the concept, difficulty and the course style.
8. If there are no candidates, return `done`. A review can still come due later.

`practice` and `author` carry a `lesson` field: `null` when the concept has no lesson yet, the id of the earliest unread lesson, or absent once every lesson for the concept is read. The tutor teaches first until it is absent. Lessons never change mastery.

**Corrupt log.** A truncated final line, from a crash mid-append, is ignored when reading. Before the next append, the log is backed up to `events.jsonl.bak-<time>` and the torn line is removed. Any other invalid line makes state-changing commands fail with the line number until it's repaired.

### Lessons-only progression

`nextLesson(roadmap, log, lessons)` is separate from `nextStep` and `replay`. It has no mastery, difficulty, reviews or stuck state.

- A concept is covered when it has at least one lesson and every lesson for it has a `read` event.
- Candidates are concepts not covered whose prerequisites are each covered or skipped. Their order is topological, with ties broken by roadmap order.
- A skipped concept waits while any other candidate is open, then returns at the end. Reading one of its lessons ends its skip in this mode. A skip unlocks later concepts but never covers a concept.
- Return `{ kind: "learn", concept, lesson }` for the first candidate. `lesson` is `null` when it has no lesson yet, otherwise the earliest unread lesson's id.
- Return `{ kind: "done" }` when every concept is covered.

A lessons-only course uses this step without looking up a track. `code-learn status` shows lessons read instead of mastery. Switching back to coding keeps mastery and reads; reading never changes mastery.

## 8. Interfaces

The MCP tools and CLI commands are thin calls into one application module.

| Tool | Input | Output |
|---|---|---|
| `list_tracks` | — | installed tracks: id, version, styles |
| `save_track` | `files` | `{ installed: "id@v" }` or diagnostics; with `--desktop`, `{ proposed: "id@v", note }` (§4.6) |
| `save_roadmap` | `course`, `roadmap` (YAML text) | ok or errors |
| `get_roadmap` | — | `{ course, title?, goal, track?, style, concepts, sources? }`; concepts have `id`, `title`, `requires` and optional `practice`, `pitfalls`, `refs` |
| `next_step` | — | `setup` / `review` / `practice` / `author` / `learn` / `stuck` / `done`; `learn` carries `concept` and `lesson` (null or the earliest unread id); `author` carries the concept's `title`, optional `practice` and `pitfalls`, `style`, and for code `track` and the track's `contract` (learner `files`, the `build`/`run` or `test` command, `limits`, and `examples`: the track's passing probe solution and its tests), and, when there are any, `lessonText` (the concept's lessons, newest first, at most 32 KB) and `last` (the learner's last check on the concept as its `exercise`, `passed`, `total`, `assisted` and optional `missed`: visible names and hidden indexes, as in §7) |
| `save_exercise` | `files` | `{ exercise: slug }` only, or diagnostics |
| `get_exercise` | `slug?` | statement, learner file paths, visible tests, hint; for quiz, questions and stored choices with only text, never `correct` or `why`; and for io the track's run command; a generated visible input shows its generator (`generated: true`), and a long expected output its first 64 KB with `expectedBytes` |
| `check` | `slug?` | per-test results (hidden tests: index and status only), `recorded`, `note?` |
| `progress` | — | course style, mastery and difficulty per concept (with `reviewDue` for a mastered concept whose review is scheduled), `covered` (at least one lesson, all read), next step |
| `save_lesson` | `id`, `concept`, `title`, `markdown` | `{ lesson: id }` or errors |
| `get_lesson` | `id` | `{ id, concept, title, markdown, notes, examples, style? }`; records nothing |
| `mark_lesson_read` | `id` | ok; records a `read` event once |

**Quiz disclosure.** The tutor never says which choice is right, only why a picked choice is wrong. This is an author/tutor rule, not a guarantee against paraphrases from the reply filter. No code-learn output returns the key. Quiz authors receive `style: "quiz"` and no track contract. `code-learn check` reads `answers.yaml`; `code-learn test` refuses a quiz.

**Per-job servers.** `code-learn mcp --course <course>` makes course-scoped tools use that course instead of the workspace's active one, and `save_roadmap` may save only that course. `--tools <a,b>` registers only the listed tools. With neither option the server behaves as above. `--progress <file>` (an absolute path) makes `save_exercise` write which gate is running, `{ "format_version": 1, "gate": "reference" | "starter" | "mutants" }`, replacing the file atomically as each starts, so the desktop app can show it (`saveExercise`'s optional `onProgress` hears the same). Only the gate's name is written.

**Failure codes.** An error for this computer's problem carries a stable code (`src/errors.ts` `INFRA`) and the kind that follows from it: Docker missing or not running (`no-runtime`, `runtime-down`, `runtime-paused`, `socket-permission`, `runtime-context`), up but not answering (`runtime-busy`, `check-timeout`, `container-remove`), answering but failing (`windows-containers`, `credentials`, `container-start`, `docker-cpus`, `docker-log-driver`, `docker-file-sharing`, `runtime-failed`, `image-id`, `image-inspect`, `container-list`), Docker's disk or this computer's (`docker-disk`, `host-disk`), or the network (`offline`, `rate-limit`, `tls`, `network-timeout`). Every failed tool result starts with code-learn's own line, `code-learn:<code, kind or error>`, so nothing a message quotes (a build log, a runner, a program, the agent's own files) can stand there. A write that runs out of space reaches the agent as `host-disk`, not as an unexpected error.

**App functions without tools** (the desktop app calls them in-process): `listLessons`, `saveNotes`, `listExercises`, `listProposals`, `installProposal`, `dropProposal`, `readLearnerFiles` and `writeLearnerFile`. `writeLearnerFile(ws, slug, path, text, digest)` accepts only the exercise's track files, or `answers.yaml` for a quiz, holds the workspace lock, refuses symlinked paths, and replaces the file through a temp file and a rename only if its current digest is the one the editor loaded ("Changed outside code-learn").

## 9. Host setup (`code-learn init`)

`init` writes only the files for the selected hosts, under the workspace lock.

- **Merging:** it merges with existing files, replacing only code-learn's own entries and sections. In a shared hook group it removes only code-learn's own hook entry. TOML is parsed and the result re-validated.
- **Writes:** every file is prepared and validated before any is written. Each is then replaced atomically, never through a symlink.
- **Launch commands** use absolute paths and pass `--workspace <abs>`.

| File | Contents |
|---|---|
| `AGENTS.md` | A marked code-learn section with tutor rules: never write the learner's solution, use the tools, author through the subagent, and report only the exercise id. |
| `CLAUDE.md` | Claude Code: create it if needed and make sure it has an `@AGENTS.md` import line. Claude Code prefers `CLAUDE.md` files, including ones in parent folders, over `AGENTS.md`. |
| `.claude/agents/code-learn-author.md` | The author instructions. Cursor reads it, and the `AGENTS.md` section tells Codex to spawn a subagent with them. |
| `.mcp.json` | Claude Code's MCP config. |
| `.claude/settings.json` | Claude Code's `PreToolUse` hook on `Edit|Write|MultiEdit|NotebookEdit`, running `code-learn hook claude`. |
| `.codex/config.toml` | Codex's `[mcp_servers.code-learn]` block, with `tool_timeout_sec = 1800`: Codex's 60-second default is shorter than a track build (up to 10 minutes) or the exercise gates, which on a heavy track (a JVM build tool, `time_ms` near its 120 s ceiling) can pass 15 minutes. Codex needs the project to be trusted. |
| `.cursor/mcp.json` | Cursor's MCP config. |

**The hook:**
- It reads Claude Code's hook JSON from stdin and resolves `tool_input.file_path` against the workspace.
- If the path is under `exercises/` and assist mode is off, it exits 2 with a message telling the agent to give hints instead.
- Malformed input is allowed through (exit 0) with a warning. The hook is a practice aid, not a security boundary.

## 10. Failure handling

- **No container runtime:** commands that need one fail and say what to do on that OS. When none is installed, they say what to install (`runtimeHelp`): Docker Desktop on macOS; Docker Desktop with the WSL 2 backend set to Linux containers on Windows; Docker Engine on Linux. When one is installed but not running, they say how to start it (`startHelp`). A Docker Desktop running Windows containers is reported as such. `doctor` says which part failed.
- **A busy runtime:** `docker info` gets 20 s. An engine that gives no answer, or answers that it isn't ready (a server error or a dropped connection, as Docker Desktop gives while it starts or resumes), is asked once more, a few seconds later, for 60 s. One that still gives no real answer counts as not answering ("may be busy"), never as stopped: under load (a large build, CPU-heavy checks, Docker Desktop resuming from Resource Saver) it can be that slow. An engine that answers, even to refuse, is read at once. A check that reaches the host's deadline, or whose runtime stops answering mid-run, says it may be busy too, and so does the slow answer a memory kill waits on (60 s).
- **A runtime that isn't running** is named from what its CLI said: a paused Docker Desktop, a user without access to the socket, or a CLI context that points at another runtime or doesn't exist. "Stopped" is said only when the runtime itself says so (`runtimeDown`): a container that couldn't start, a run the runtime failed, or a list or inspect that failed while it answers is Docker failing, worded as "try again, and restart Docker if it happens again".
- **A container the runtime refused** (`docker run` exit 125) is named in code-learn's own words from the CLI's error: fewer CPUs than the check's 2, a logging driver that refuses the log options, a folder Docker Desktop doesn't share, Docker's disk, the network. The error text itself never leaves, since code that had started can write to the same stream. Exit 126 or 127 before the driver printed anything is the track image's: it can't run `/bin/sh`.
- **A flood** is graded even when removing its container was slow.
- **Locks** (per course and per track): the file is created exclusively and records the owner's PID. A lock whose PID is no longer running is stale and removed. A second writer waits up to 10 minutes, then gets "Course is busy; retry."
- **Leftover sandboxes:** each scope is named `code-learn-<owner pid>-<random>`. `doctor --fix` stops the scopes whose owner process is gone, and every install removes staging folders (`envs/.staging-<pid>-…`) whose owner is gone (§4.6).
- **Reading Docker's answers.** code-learn reads Docker's records (`image inspect`, `inspect`) as JSON (`--format '{{json .}}'`) and picks fields in code, never with a template that names a key: Docker versions leave out empty keys (Docker 29 drops `Config.Volumes` when an image declares none), and a template that names a missing key fails. One reader (`inspectRecord`) takes Docker's and newer Podman's one-line record and Podman 4.3's indented array. CI runs the Docker tests on the runner's Docker and on the newest Docker Engine.
- **`doctor`'s network check** passes only when an ordinary container reaches the test server and the sandbox doesn't. The test server runs in an ordinary container, not on the host, so a host firewall (on by default on many Macs, and asking on Windows) never decides the result. Before that, the test image must download (offline is `kind: "offline"`) and a staged run folder must mount and read back (§4.3). Anything else is reported as a failure ("inconclusive"), never as success.
- **Unexpected errors** reach tools and the CLI only as a generic message; details appear with `CODE_LEARN_DEBUG=1`. Damaged records are reported by file name, never by content.

## 11. Compatibility, migration and rollback

- **v1 data.** 1.0 shares no code or data with v1 and never touches v1's data:
  - v1 kept its database at `<workspace>/.code-learn/code-learn.db`, or at the path in its workspace override.
  - It fell back to Electron's userData folder, where it also kept encrypted API keys.
- **No migration.** v1 progress is not imported: v1 concepts were free-text tags, and 1.0 concepts are roadmap ids.
- **Coexistence.** 1.0 writes `code-learn.json` and `exercises/` in a workspace and `~/.code-learn/{tracks,courses}`. None of these collide with v1's files.
- **Rollback.** `docs/MIGRATION.md` gives tested steps to run v1 from commit `5e3f3a7` in a separate checkout (`git worktree add`, `npm ci`, `npm run dev`). The repo-level rollback is reverting the 1.0 merge commit.
- **Future format changes** must migrate forward and keep a backup of the original files.

## 12. Tests

- **Unit (vitest):**
  - file and id validation; schemas;
  - output normalization and frame parsing;
  - learner rules; roadmap rules;
  - init merging; hook decisions; lock behavior.
- **Docker integration**, with a POSIX-shell fixture track in both styles:
  - the judge, every gate, and the adversarial sandbox cases in A7;
  - heavy tests: a million generated numbers in and out, seconds of CPU per case, and a Maven + JUnit track that builds its cache into the image and runs offline (its image is about 600 MB, so it runs only with `CODE_LEARN_BIG_IMAGES=1`, which CI sets);
  - atomic install and recovery;
  - these run in CI on Linux and locally where Docker is available.
- **Packaging:** `npm pack`, then install the tarball into a temp folder, run `code-learn --version`, and spawn `code-learn mcp` as a real stdio server and call its tools.
- **Journeys A14 to A16**, with real agents.

## 13. Review log

**Astra (gpt-6-astra), design review, 17 Oct 2026.** Verdict: "not ready for implementation as written". All findings were accepted and resolved in this document:

| Finding | Resolution |
|---|---|
| F01 build security | §4.6 trust boundary, staged context, no secrets, timeout; build resource limits listed as a known limitation |
| F02 symlinks and paths | §3 no symlinks in input, fresh temp folders, guarded materialization; §4.2 no output mount |
| F03 resource exhaustion | §4.2 and §4.3 host ceilings, capped streaming output, log cap, input size limits |
| F04 image behavior | §4.2 entrypoint override, utility check, `kill -9 -1` between cases; §4.3 no healthcheck, volumes rejected, host deadline |
| F05 unit grading | §4.2 report contract, exit-code rule, fixed inventory |
| F06 reproducibility | §4.6 pinned image ID and explicit rebuild; §5 courses pin `track@version` |
| F07 atomicity and concurrency | §6 commit point and re-materialization; §10 locks |
| F08 roadmap contract | §5 schema and replacement rules |
| F09 event semantics | §7 `check`/`skip` events and ordered rules; stuck before practice |
| F10 mastery inflation | §7 repeat passes earn nothing |
| F11 assistance | §7 sticky per exercise |
| F12 errors versus outcomes | §7 infrastructure failures record nothing; corrupt-log rules |
| F13 hook claims | A12 narrowed; §9 |
| F14 host setup | §9 `CLAUDE.md` import, explicit workspace, per-host init |
| F15 verification claims | §1 narrowed guarantee; A14 manual statement check |
| F16 sandbox acceptance | A7 adversarial tests with a positive network control |
| F17 support claims | A10 packed-artifact stdio test; A16 per-host journeys; §2 supported matrix |
| F18 v1 migration | §11 all v1 locations, tested rollback; A13 removes conflicting docs and config |
| Cuts | The vocabulary blacklist, strictly increasing versions and versioning of agent-authored files were dropped; `init --host` was added |

**Astra re-check, 17 Oct 2026.** 9 resolved, 9 partly resolved, 2 new major issues. Resolutions:

| Item | Resolution |
|---|---|
| F03 build allowance, output cap | §4.2 60 s build limit; §4.3 kill and error at 4 MB |
| F04 unit set transition | §4.2 one container per test set |
| F06 rebuild | §4.6 rebuild re-validates every stored exercise before recording the new image |
| F07 track locks, lock expiry | §4.6 per-track lock; §10 PID-based staleness instead of age |
| F10 identical partial retries | §7 mastery moves only on a first check or an improved best score |
| F11 assistance across workspaces | §7 `assist` events in the course log |
| F12 torn final line | §7 back up and repair before the next append |
| F14 ancestor `CLAUDE.md` | §9 always ensure a workspace `CLAUDE.md` with the import |
| New: truncated output false pass | §4.2 output over 64 KB is an error |
| New: hidden tests leaking through visible diagnostics | §4.2 separate containers per set and a disclosure policy |

**Astra final review, 17 Oct 2026.** No correctness or security blockers; CI green on the exact head commit. Two acceptance gaps were fixed:

- **A9:** the `--version` and `--help` aliases are now validated like other commands.
- **A15:** the recorded journey now includes `code-learn test`.

The independent statement review of six agent-written exercises found five consistent and one minor gap in an example. Evidence: `docs/release-evidence-1.0.md`.

**Astra entry-point and integration reviews, 17 Oct 2026.** Resolved:

- unexpected-error and record-error sanitizing;
- atomic, locked, symlink-safe and fully pre-validated `init`, with structural TOML editing and per-entry hook removal;
- owner-aware, verified `doctor` with inconclusive network checks;
- a strict CLI parser and the cwd binding for `init`;
- canonical, component-wise hook paths with a shape warning;
- hidden-path redaction in validation errors;
- case-insensitive name collisions;
- atomic no-clobber learner files;
- infrastructure failures (no frames or runtime connection errors) recorded as nothing;
- assist evidence before permission;
- one version bound;
- a full eight-tool stdio round trip;
- precise rollback claims.

A14's person-check became a release step (above).

**Astra second re-check, 17 Oct 2026.** Five narrow gaps, no new major issues. Resolutions:

| Item | Resolution |
|---|---|
| F03 stderr outside the limit | §4.3 stdout and stderr counted together; container output is framed and bounded |
| F06 rebuild could keep a weakened exercise | §4.6 rebuild re-runs exercise gates 2 to 6 |
| F07 rebuild racing an exercise save | §4.6 exercise saves hold the track lock |
| F11 assist across exercise switches | §7 an `assist` event for every exercise made current or checked while assist mode is on |
| F12 contradictory classification | §4.3 termination-reason table |
