#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as app from "./app.js";
import { doctor } from "./doctor.js";
import { CodeLearnError } from "./errors.js";
import { readFileMap } from "./files.js";
import { claudeHook } from "./hook.js";
import { parseCli } from "./args.js";
import { type Host, HOSTS, init } from "./init.js";
import { parseToolList, serveMcp } from "./mcp.js";

const here = dirname(fileURLToPath(import.meta.url));
const VERSION = (JSON.parse(readFileSync(join(here, "..", "package.json"), "utf8")) as { version: string }).version;

const USAGE = `code-learn ${VERSION}: your coding agent writes the exercises, code-learn verifies, grades and tracks mastery.

Usage:
  code-learn init [--host claude|codex|cursor]...   set up this project for your agent(s)
  code-learn doctor [--fix]                          check the sandbox, micromamba and isolation
  code-learn status                                  your progress and the next step
  code-learn test [exercise]                         run the visible tests (not recorded)
  code-learn check [exercise]                        run every test and record the attempt
  code-learn skip <concept>                          come back to a concept later
  code-learn assist on|off                           let your agent edit exercise files (counts for less)
  code-learn tracks                                  list installed tracks
  code-learn track add <folder>                      install a track from a folder
  code-learn track rebuild <id@version>              reinstall a track's toolchain and re-verify its exercises
  code-learn track remove <id@version>               delete a track and its toolchain folder
  code-learn mcp [--workspace <dir>]                 run the MCP server (your agent starts this)
             [--course <c>] [--tools <a,b>] [--desktop]   bind it to one course, limit its tools, or propose tracks
             [--progress <file>]                 write which gate save_exercise runs to <file>
  code-learn hook claude [--workspace <dir>]         Claude Code practice hook (init sets this up)

Options: --workspace <dir>. Learner commands (status, test, check, skip, assist) default to the nearest folder
with code-learn.json; every other command uses the current folder. Set CODE_LEARN_HOME to move code-learn's data.`;

/** Learner commands find the nearest folder with code-learn.json; everything else uses the current folder. */
const LEARNER_COMMANDS = new Set(["status", "test", "check", "skip", "assist"]);

function workspaceFor(command: string, explicit?: string): string {
  if (explicit) return resolve(explicit);
  if (!LEARNER_COMMANDS.has(command)) return process.cwd();
  let dir = process.cwd();
  for (;;) {
    if (existsSync(join(dir, "code-learn.json"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return process.cwd();
    dir = parent;
  }
}

const print = (s: string) => process.stdout.write(`${s}\n`);

function printCheck(r: app.CheckView): void {
  for (const t of r.tests) {
    print(`  ${t.status === "pass" ? "✓" : t.status === "fail" ? "✗" : "!"} ${t.name}: ${t.status}`);
    if (t.message) print(`      ${t.message.split("\n").join("\n      ")}`);
    if (t.actual !== undefined) print(`      printed: ${JSON.stringify(t.actual.slice(0, 500))}`);
  }
  print(`${r.passed}/${r.total} passed (${r.recorded ? "recorded" : (r.note ?? "visible tests only, not recorded")})`);
}

function describeStep(step: app.NextStep): string {
  // A lesson to read comes first, on learn, practice and author alike.
  if ((step.kind === "learn" || step.kind === "practice" || step.kind === "author") && step.lesson !== undefined) {
    return step.lesson === null ? `Ask your agent for a lesson on ${step.concept}.` : `Read lesson "${step.lesson}" with your agent.`;
  }
  switch (step.kind) {
    case "learn": return `Read about ${step.concept} with your agent.`;
    case "setup": return `Ask your agent to set up ${step.track}.`;
    case "practice": return `Practice "${step.exercise}" (${step.concept}, difficulty ${step.difficulty}).`;
    case "author": return `Ask your agent for a new ${step.concept} ${step.review ? "review " : ""}exercise (difficulty ${step.difficulty}).`;
    case "stuck": return `You're stuck on ${step.concept}. Ask your agent to re-teach it.`;
    case "review": return `Review ${step.concept}: check "${step.exercise}" to keep it.`;
    case "done": return "Every concept is mastered.";
  }
}

async function main(argv: string[]): Promise<number> {
  const { command, args: rest, options } = parseCli(argv);
  const ws = workspaceFor(command, options.workspace?.[0]);

  switch (command) {
    case "init": {
      const hosts = (options.host ?? []) as Host[];
      for (const h of hosts) if (!HOSTS.includes(h)) throw new CodeLearnError(`Unknown host "${h}". Use ${HOSTS.join(", ")}.`);
      const written = await init(ws, hosts, { command: process.execPath, args: [fileURLToPath(import.meta.url)] });
      print(`Set up ${ws}:\n${written.map((f) => `  ${f}`).join("\n")}`);
      print("Next: open this folder in your agent and ask it to teach you something. Codex needs this project marked as trusted to load .codex/config.toml.");
      return 0;
    }
    case "doctor": {
      const checks = await doctor(options.fix !== undefined);
      for (const c of checks) print(`${c.ok ? "✓" : "✗"} ${c.name}: ${c.detail}`);
      return checks.every((c) => c.ok) ? 0 : 1;
    }
    case "status": {
      const p = app.progress(ws);
      print(`${p.course}: ${p.goal}${p.track ? ` (${p.track})` : ""}`);
      if (p.style === "none") {
        const lessons = app.listLessons(ws);
        for (const c of p.concepts) {
          const own = lessons.filter((l) => l.concept === c.id);
          print(`  ${c.title}: ${own.filter((l) => l.read).length} of ${own.length} lessons read`);
        }
      } else for (const c of p.concepts) print(`  ${c.mastered ? "✓" : c.stuck ? "!" : "·"} ${c.title} [${c.id}] mastery ${c.mastery.toFixed(2)}, difficulty ${c.difficulty}`);
      print(p.style === "none" && p.next.kind === "done" ? "Every concept is covered." : describeStep(p.next));
      return 0;
    }
    case "test":
      printCheck(await app.testExercise(ws, rest[0]));
      return 0;
    case "check": {
      const r = await app.checkExercise(ws, rest[0]);
      printCheck(r);
      print(describeStep(app.nextStep(ws)));
      return 0;
    }
    case "skip":
      await app.skip(ws, rest[0]!);
      print(`code-learn will come back to ${rest[0]} later.`);
      return 0;
    case "assist":
      if (rest[0] !== "on" && rest[0] !== "off") throw new CodeLearnError("Use code-learn assist on or code-learn assist off.");
      await app.setAssist(ws, rest[0] === "on");
      print(rest[0] === "on" ? "Assist mode on: your agent may edit exercise files, and these exercises count for less." : "Assist mode off.");
      return 0;
    case "tracks": {
      const tracks = app.listTracks();
      if (tracks.length === 0) print("No tracks installed yet. Ask your agent to set one up, or run code-learn track add <folder>.");
      for (const t of tracks) print(`${t.track}  styles: ${t.styles.join(", ")}  files: ${t.files.join(", ")}`);
      return 0;
    }
    case "track": {
      if (rest[0] === "add") {
        const r = await app.saveTrack(readFileMap(resolve(rest[1]!)));
        print(r.unchanged ? `${r.installed} is already installed.` : `Installed ${r.installed}.`);
        return 0;
      }
      if (rest[0] === "rebuild") {
        const r = await app.rebuildTrack(rest[1]!);
        print(`Rebuilt ${r.rebuilt}; ${r.exercises} exercise(s) re-verified.`);
        return 0;
      }
      if (rest[0] === "remove") {
        const r = await app.removeTrack(rest[1]!);
        print(`Removed ${r.removed} and its toolchain.`);
        return 0;
      }
      throw new CodeLearnError("Use code-learn track add <folder>, code-learn track rebuild <id@version> or code-learn track remove <id@version>.");
    }
    case "mcp":
      await serveMcp(ws, VERSION, {
        course: options.course?.[0],
        tools: options.tools ? parseToolList(options.tools[0]!) : undefined,
        desktop: options.desktop !== undefined,
        progress: options.progress?.[0],
      });
      return -1; // keep running
    case "hook": {
      if (rest[0] !== "claude") throw new CodeLearnError("Only `code-learn hook claude` is supported.");
      const stdin = readFileSync(0, "utf8");
      const r = claudeHook(ws, stdin);
      if (r.message) process.stderr.write(`${r.message}\n`);
      return r.exit;
    }
    case "version":
      print(VERSION);
      return 0;
    case "help":
      print(USAGE);
      return 0;
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    if (code >= 0) process.exitCode = code;
  },
  (e: unknown) => {
    if (e instanceof CodeLearnError) {
      process.stderr.write(`${e.message}\n`);
      process.exitCode = 1;
    } else {
      // Unexpected errors may carry internal data; show details only on request.
      const detail = process.env.CODE_LEARN_DEBUG === "1" ? `\n${(e as Error).stack ?? String(e)}` : " Set CODE_LEARN_DEBUG=1 for details.";
      process.stderr.write(`code-learn hit an unexpected error.${detail}\n`);
      process.exitCode = 2;
    }
  },
);
