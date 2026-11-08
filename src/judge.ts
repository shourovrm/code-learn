import { join } from "node:path";
import { CodeLearnError, infraError } from "./errors.js";
import { type FileMap, writeFileMap } from "./files.js";
import {
  CASE_OUTPUT_BYTES, type CaseFrames, type Expectation, type Frame, frameProgress, FrameReader, gradeRuns, type IoRun, type RawCase, type Runs, type TestResult, type TestSet, type UnitRun,
} from "./grading.js";
import { stageRunFolder } from "./runs.js";
import { lostRun, OUTPUT_CAP, sandboxDown, startSandboxed, toolchainMounts } from "./sandbox.js";

/** Where an installed toolchain is on this computer (DESIGN §4.6): its conda environment and its track files. */
export type ToolchainFolders = { env: string; track: string };

/** What the judge needs from an installed track: its toolchain's folders and variables, its commands and limits. */
export type JudgeTrack = {
  folders: ToolchainFolders;
  vars: Record<string, string>;
  build?: string | undefined;
  run?: string | undefined;
  test?: string | undefined;
  limits: { time_ms: number; memory_mb: number };
};
/**
 * `onProgress`: "built" when the build is done, then how many io cases have finished, as each does (for progress,
 * never grading). `onCase` hands over each io case as it finishes: pass it only for visible tests. `stopAtError` ends
 * an io set at its first case that errors (a crash, a timeout, a failed input generator): for gate runs that only ask
 * whether everything passes, so a slow wrong solution costs one time limit, not one per case.
 */
export type RunOptions = {
  timeMs?: number; deadlineMs?: number; onProgress?: (milestone: "built" | number) => void; onCase?: (c: CaseFrames) => void; stopAtError?: boolean;
  /** How long each input generator may run (default GENERATOR_SECONDS); the gates' fast run gives it a third. */
  generatorMs?: number;
};


export const BUILD_SECONDS = 60;
/** How long a test's input generator (`NN.gen`) may run, before and outside the program's time limit. */
export const GENERATOR_SECONDS = 30;
const SLACK_MS = 30_000;
/** What the driver needs besides `sh`. They come from this computer's /usr, which every sandbox mounts. */
export const DRIVER_TOOLS = ["timeout", "sleep", "head", "wc", "cat", "basename"];
/** `timeout` and `sleep` take seconds; busybox and coreutils both accept decimals. */
export const seconds = (ms: number) => Math.max(0.1, ms / 1000).toFixed(3);
/** The time limit, which the watchdog enforces, and \`timeout\`'s backstop a second later. */
const timeEnv = (ms: number) => ({ CODE_LEARN_TIME_S: seconds(ms), CODE_LEARN_BACKSTOP_S: seconds(ms + 1000) });

// The driver is PID 1 of the sandbox (bubblewrap's --as-pid-1). Program output only leaves the sandbox inside a length-framed
// record, and `kill -9 -1` clears leftover processes between cases. Every command the track or learner
// supplies starts with $OOM, which makes it the out-of-memory killer's first choice (raising
// oom_score_adj needs no privilege), so a program that runs out of memory usually dies instead of the
// driver. It's best effort: the program could lower its score back to 0. If the write fails, nothing changes.
// Shell functions share variables, so emit() keeps its own (size) apart from the loop's case name (n).
// watch() makes a time-out the driver's own statement, as Run's driver does (program.ts): both kinds of \`timeout\`
// exit 137 on one, as a memory kill does. At the limit a watchdog writes /tmp/t, then \`kill -9 -1\` stops everything
// but the driver (PID 1). \`timeout\` only backs it up, a second later. The watchdog starts before the program, so the
// program's own forks can't stop it; \`kill -9 -1\` after each case stops it if the case ends first.
// A 137 without that mark may be a memory kill, which the kernel counts in the sandbox's cgroup, and the cgroup is
// gone once the driver exits. So the driver sets k and, on exit, waits a second first, while the host reads the count.
const EMIT = `OOM='{ echo 1000 > /proc/self/oom_score_adj; } 2>/dev/null || :; '
k=; trap '[ -z "$k" ] || sleep 1' EXIT
emit() { size=$(($(wc -c < "$4"))); printf '\\n@@code-learn %s %s %s %s\\n' "$1" "$2" "$3" "$size"; cat "$4"; }
watch() { : > /tmp/t; ( sleep "$CODE_LEARN_TIME_S" 2>/dev/null && { echo t > /tmp/t; kill -9 -1 2>/dev/null; } ) & }
for u in ${DRIVER_TOOLS.join(" ")}; do command -v "$u" >/dev/null 2>&1 || { echo "no '$u'" > /tmp/m; emit fatal tools 1 /tmp/m; exit 0; }; done`;

const IO_DRIVER = `${EMIT}
if [ -n "\${CODE_LEARN_BUILD:-}" ]; then
  timeout -s KILL ${BUILD_SECONDS} sh -c "$OOM$CODE_LEARN_BUILD" > /tmp/b 2>&1; c=$?
  head -c 16384 /tmp/b > /tmp/bc; emit build build "$c" /tmp/bc
  [ "$c" = 0 ] || exit 0
fi
for f in /work/tests/*; do
  case "$f" in
    *.in) n=$(basename "$f" .in); i=$f ;;
    *.gen)
      n=$(basename "$f" .gen); i=/tmp/in
      timeout -s KILL "$CODE_LEARN_GEN_S" sh -c "$OOM"'exec sh "$0"' "$f" > /tmp/in 2>/dev/null; c=$?
      kill -9 -1 2>/dev/null
      if [ "$c" != 0 ]; then rm -f /tmp/in; emit gen "$n" "$c" /dev/null; [ -n "\${CODE_LEARN_STOP:-}" ] && exit 0; continue; fi ;;
    *) continue ;;
  esac
  watch
  timeout -s KILL "$CODE_LEARN_BACKSTOP_S" sh -c "$OOM$CODE_LEARN_RUN" < "$i" > /tmp/o 2> /tmp/e; c=$?
  kill -9 -1 2>/dev/null
  head -c 4096 /tmp/e > /tmp/ec
  if [ $(($(wc -c < /tmp/o))) -gt ${CASE_OUTPUT_BYTES} ]; then : > /tmp/oc; emit big "$n" "$c" /tmp/oc; s=big; else emit case "$n" "$c" /tmp/o; s=$c; fi
  emit stderr "$n" "$c" /tmp/ec
  [ -s /tmp/t ] && emit timeout "$n" "$c" /dev/null
  [ "$c" = 137 ] && [ ! -s /tmp/t ] && k=1
  rm -f /tmp/in
  [ -n "\${CODE_LEARN_STOP:-}" ] && [ "$s" != 0 ] && exit 0
done
exit 0`;

const UNIT_DRIVER = `${EMIT}
watch
TESTS=/work/tests OUT=/tmp/report.json timeout -s KILL "$CODE_LEARN_BACKSTOP_S" sh -c "$OOM$CODE_LEARN_TEST" > /tmp/o 2>&1; c=$?
kill -9 -1 2>/dev/null
if [ -f /tmp/report.json ] && [ $(($(wc -c < /tmp/report.json))) -le 1048576 ]; then emit report report "$c" /tmp/report.json; else : > /tmp/r; emit report report "$c" /tmp/r; fi
head -c 4096 /tmp/o > /tmp/oc; emit log log "$c" /tmp/oc
[ -s /tmp/t ] && emit timeout report "$c" /dev/null
[ "$c" = 137 ] && [ ! -s /tmp/t ] && k=1
exit 0`;

/**
 * Runs the driver in one sandbox and reads its frames as they stream (`onFrame` hears each). `outputCap` bounds the
 * stream: an io set's is sized to its cases, since each may print up to CASE_OUTPUT_BYTES.
 */
async function runDriver(
  track: JudgeTrack, script: string, env: Record<string, string>, src: FileMap, tests: FileMap, deadlineMs: number,
  outputCap: number, maxFrames: number, onFrame?: (f: Frame) => void,
): Promise<{ frames: Frame[]; flooded: boolean; outOfMemory?: boolean; memoryKill?: boolean }> {
  const reader = new FrameReader(onFrame, maxFrames);
  const run = stageRunFolder();
  const dir = run.dir;
  try {
    writeFileMap(join(dir, "src"), src);
    writeFileMap(join(dir, "tests"), tests);
    const started = startSandboxed({
      command: ["/bin/sh", "-c", script],
      // The track's variables first: the schema keeps them off the driver's own names.
      env: { ...track.vars, ...env },
      mounts: [
        ...toolchainMounts(track.folders),
        { host: join(dir, "src"), container: "/work/src" },
        { host: join(dir, "tests"), container: "/work/tests" },
      ],
      memoryMb: track.limits.memory_mb,
      deadlineMs,
      outputCap,
    }, { stdout: (chunk) => reader.push(chunk) });
    const result = await started.done;
    // A flood is the program's doing and is graded, even when stopping its sandbox was slow.
    if (result.flooded) return { frames: [], flooded: true };
    // The driver stops every case at its limit, so only a busy computer reaches the host deadline.
    if (result.timedOut) throw infraError("The check didn't finish in time, so nothing was recorded. This computer may be busy: wait a minute, then retry.", "check-timeout");
    if (result.cleanupFailed) throw infraError("A check's sandbox couldn't be stopped, so nothing was recorded. Run `code-learn doctor --fix`, then retry.", "scope-stop");
    // The driver always ends with exit 0. Anything else means it was killed or the sandbox failed, whatever was
    // printed so far. Only a memory-limit kill is the program's doing; everything else records nothing.
    if (result.exit !== 0) {
      if (result.oomKilled) return { frames: [], flooded: false, outOfMemory: true };
      const down = await sandboxDown();
      if (down) throw lostRun(down, ", so it wasn't counted");
      // The sandbox's own stderr is never shown: code that had already started can write there too.
      throw infraError("The sandbox failed during the run, so it wasn't counted. Run `code-learn doctor`, then retry.", "sandbox-failed");
    }
    const frames = reader.frames;
    // A working driver always reports at least one frame. None means the sandbox failed, not the learner's code.
    if (frames.length === 0) throw infraError("The sandbox failed during the run, so it wasn't counted. Run `code-learn doctor`, then retry.", "sandbox-failed");
    // Never echo a fatal frame's body: code in the sandbox could forge one (DESIGN §4.2).
    if (frames.some((f) => f.kind === "fatal")) throw new CodeLearnError(`This computer is missing a tool code-learn needs: sh, ${DRIVER_TOOLS.join(", ")} (from coreutils).`);
    // A case or runner killed with 137 that the watchdog didn't mark as a time-out may have hit the memory limit while
    // the driver went on: only the kernel's count says so (DESIGN §4.6).
    const marked = new Set(frames.filter((f) => f.kind === "timeout").map((f) => f.name));
    const memoryKill = frames.some((f) => f.exit === 137 && (f.kind === "case" || f.kind === "report") && !marked.has(f.name)) && (await started.hadOomKill());
    return { frames, flooded: result.flooded, ...(memoryKill ? { memoryKill } : {}) };
  } finally {
    run.remove();
  }
}

/** Runs one io test set. `inputs` holds `NN.in` files. Case names come back as `<set>/NN`. */
export async function runIo(track: JudgeTrack, set: TestSet, src: FileMap, inputs: FileMap, opts: RunOptions = {}): Promise<IoRun> {
  if (!track.run) throw new CodeLearnError("This track has no run command, so it can't run io exercises.");
  const timeMs = opts.timeMs ?? track.limits.time_ms;
  const generated = Object.keys(inputs).filter((p) => p.endsWith(".gen")).length;
  const caseCount = Object.keys(inputs).filter((p) => p.endsWith(".in")).length + generated;
  const generatorMs = opts.generatorMs ?? GENERATOR_SECONDS * 1000;
  const deadline = opts.deadlineMs ?? BUILD_SECONDS * 1000 + caseCount * (timeMs + 1000) + generated * generatorMs + SLACK_MS;
  const env: Record<string, string> = { CODE_LEARN_RUN: track.run, CODE_LEARN_GEN_S: seconds(generatorMs), ...timeEnv(timeMs) };
  if (track.build) env.CODE_LEARN_BUILD = track.build;
  if (opts.stopAtError) env.CODE_LEARN_STOP = "1";
  // Each case frames at most CASE_OUTPUT_BYTES of output and 4 KB of errors; the rest of the stream is small.
  const outputCap = OUTPUT_CAP + caseCount * (CASE_OUTPUT_BYTES + 8192);
  const progress = (opts.onProgress || opts.onCase) ? frameProgress(opts.onProgress ?? (() => undefined), opts.onCase) : undefined;
  // The driver frames at most a build, a fatal and three per case (output, stderr, timeout).
  const { frames, flooded, outOfMemory, memoryKill } = await runDriver(track, IO_DRIVER, env, src, inputs, deadline, outputCap, 3 * caseCount + 8, progress);

  const buildFrame = frames.find((f) => f.kind === "build");
  const stderrOf = new Map(frames.filter((f) => f.kind === "stderr").map((f) => [f.name, f.body]));
  const timedOut = new Set(frames.filter((f) => f.kind === "timeout").map((f) => f.name));
  const cases = frames
    .filter((f) => f.kind === "case" || f.kind === "big" || f.kind === "gen")
    .map((f): RawCase => ({
      name: `${set}/${f.name}`, exit: f.exit, stdout: f.body, stderr: stderrOf.get(f.name) ?? "", big: f.kind === "big",
      ...(f.digest ? { digest: f.digest, bytes: f.bytes } : {}), ...(f.kind === "gen" ? { generator: true } : {}), ...(timedOut.has(f.name) ? { timedOut: true } : {}),
    }));
  const limits = { time_ms: timeMs, memory_mb: track.limits.memory_mb };
  return { ...(buildFrame ? { build: { exit: buildFrame.exit, output: buildFrame.body } } : {}), cases, flooded, limits, ...(outOfMemory ? { outOfMemory } : {}), ...(memoryKill ? { memoryKill } : {}) };
}

/** Runs one unit test set: the track's `test` command against `tests`. */
export async function runUnit(track: JudgeTrack, src: FileMap, tests: FileMap, opts: RunOptions = {}): Promise<UnitRun> {
  if (!track.test) throw new CodeLearnError("This track has no test command, so it can't run unit exercises.");
  const timeMs = opts.timeMs ?? track.limits.time_ms;
  const deadline = opts.deadlineMs ?? timeMs + SLACK_MS;
  const env = { CODE_LEARN_TEST: track.test, ...timeEnv(timeMs) };
  const { frames, flooded, outOfMemory, memoryKill } = await runDriver(track, UNIT_DRIVER, env, src, tests, deadline, OUTPUT_CAP, 8);
  const report = frames.find((f) => f.kind === "report");
  const log = frames.find((f) => f.kind === "log");
  const limits = { time_ms: timeMs, memory_mb: track.limits.memory_mb };
  const timedOut = frames.some((f) => f.kind === "timeout" && f.name === "report");
  return { report: { exit: report?.exit ?? -1, body: report?.body ?? "", log: log?.body ?? "", ...(timedOut ? { timedOut } : {}) }, flooded, limits, ...(outOfMemory ? { outOfMemory } : {}), ...(memoryKill ? { memoryKill } : {}) };
}

/** Runs each given test set, visible first, each in its own sandbox. `onSet` is told as a set starts and may return its options (progress). */
export async function runSets(
  track: JudgeTrack, style: "io" | "unit", src: FileMap, sets: Partial<Record<TestSet, FileMap>>,
  opts: { timeMs?: number; generatorMs?: number; stopAtError?: boolean; onSet?: (set: TestSet) => RunOptions | void } = {},
): Promise<Runs> {
  const runs: Runs = {};
  for (const set of ["visible", "hidden"] as const) {
    const tests = sets[set];
    if (!tests) continue;
    const { onSet, ...shared } = opts;
    const o: RunOptions = { ...shared, ...onSet?.(set) };
    runs[set] = style === "io" ? await runIo(track, set, src, tests, o) : await runUnit(track, src, tests, o);
  }
  return runs;
}

/** Runs the given test sets and grades them. */
export async function judgeSets(
  track: JudgeTrack, style: "io" | "unit", src: FileMap, sets: Partial<Record<TestSet, FileMap>>, exp: Expectation,
  opts: { timeMs?: number; onSet?: (set: TestSet) => RunOptions | void } = {},
): Promise<TestResult[]> {
  const runs = await runSets(track, style, src, sets, opts);
  // Each generator passed the gates three times, so one failing now is this computer (a slow moment) or the program
  // filling /tmp before it: not grounds for a grade either way, so nothing is recorded (DESIGN §4.3).
  if (generatorFailed(runs)) throw new CodeLearnError("A test's input couldn't be generated, so nothing was recorded. Retry; if it keeps happening, ask code-learn for a new exercise.");
  return gradeRuns(style, runs, exp);
}

/** Whether a test's input generator failed in any of these runs. */
export const generatorFailed = (runs: Runs) => Object.values(runs).some((r) => r !== undefined && "cases" in r && r.cases.some((c) => c.generator));
