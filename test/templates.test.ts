import { describe, expect, it } from "vitest";
import { AGENTS_SECTION, AUTHOR_AGENT, JOB_BRIEFS, type JobKind } from "../src/templates.js";

// Each rule below closes a failure the cross-model bench observed (docs/bench/results.md).
describe("tutor instructions (AGENTS.md section)", () => {
  it("forbids the solution in chat as well as in files, and asks for a hint about the actual exercise", () => {
    expect(AGENTS_SECTION).toMatch(/not in chat/i);
    expect(AGENTS_SECTION).toMatch(/first call `get_exercise` yourself \(don't ask which exercise\) and read their code\. Then give one hint/);
  });

  it("defines a good hint: name the one problem, ask one question, never state the fix", () => {
    expect(AGENTS_SECTION).toMatch(/name the one thing that's missing or wrong/);
    expect(AGENTS_SECTION).toMatch(/ask one question/);
    expect(AGENTS_SECTION).toMatch(/Don't state the fix, write the code or list the steps/);
  });

  it("keeps a plain tone in every tutor brief: no praise or cheerleading, just what's right or wrong and the next step", () => {
    for (const text of [AGENTS_SECTION, JOB_BRIEFS.tutor]) {
      expect(text).toMatch(/Keep a plain tone: no praise or cheerleading/);
      expect(text).toMatch(/say what's right or wrong and the next step/);
    }
  });

  it("says which tools the tutor calls itself and which go through the author subagent", () => {
    expect(AGENTS_SECTION).toMatch(/Only `save_track` and `save_exercise` go through the `code-learn-author` subagent/);
  });

  it("tells a track author its pass probe must pass within a sixth of time_ms", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.setup]) expect(text).toMatch(/pass probe must also pass within a sixth of `time_ms`/);
  });

  it("tells a track author how heavy toolchains run offline, within the time limit", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.setup]) {
      expect(text).toMatch(/`time_ms` is per io case, or for a unit track's whole `test` command, compiling included, and at most 120000/);
      expect(text).toMatch(/for `setup` to run the track's own build and test commands once, on a copy of the pass probe/);
      // Codex cached with Maven's dependency:go-offline, then built offline, and the build missed dependencies twice.
      expect(text).toMatch(/with the network on/);
      expect(text).toMatch(/misses plugins and transitive dependencies/);
      expect(text).toMatch(/must work on a copy in `\/tmp`/);
      expect(text).toMatch(/calling the compiler and test runner directly/);
    }
  });

  it("tells an exercise author to generate big io inputs with NN.gen, seeded", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.author]) {
      expect(text).toMatch(/write `NN.gen` instead of `NN.in`, a POSIX `sh` script whose output is input NN/);
      expect(text).toMatch(/fixed seed/);
      expect(text).toMatch(/up to 32 MB/);
    }
  });

  it("tells a track author that files is a list and each save sends the whole track", () => {
    // Sonnet sent files as a map, then only the files it changed.
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.setup]) {
      expect(text).toMatch(/`files` \(a list of the paths the learner edits\)/);
      expect(text).toMatch(/Each `save_track` call sends every file of the track, not only the ones you changed/);
    }
  });

  it("tells a track author to ship its scripts as track files, not write them in setup", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.setup]) {
      expect(text).toMatch(/code-learn copies them, and `probe\/`, to `\/opt\/track`/);
      expect(text).toMatch(/never create files inside `setup` with heredocs or long `echo` chains/i);
    }
  });

  it("asks every author for a task unlike the course's earlier ones, with its own title", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.author]) {
      expect(text).toMatch(/`earlier` lists the exercises this course already has/);
      expect(text).toMatch(/a different problem, not one of them renamed/);
      expect(text).toMatch(/title must differ from the concept's title/);
    }
    expect(AGENTS_SECTION).toMatch(/contract, earlier exercises, topics taught, lesson text and last result from `next_step`/);
  });

  it("shows how a roadmap pins its track", () => {
    expect(AGENTS_SECTION).toMatch(/exactly as `list_tracks` shows it/);
  });
});

describe("author instructions (code-learn-author subagent)", () => {
  it("tells a unit track to find its tests in $TESTS and never hide its runner's failure, without naming a language", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.setup]) {
      expect(text).toMatch(/find the test files in `\$TESTS`/);
      expect(text).toMatch(/Never hide the runner's own failure, such as finding no test files: a report that lists no tests fails/);
      // Exiting 0 with a report is required, so the rule can't also forbid what does that.
      expect(text).not.toMatch(/\|\| true/);
      expect(text).toMatch(/a report that lists no tests fails/);
    }
  });

  it("says the sandbox's own /usr gives only sh and basic tools, so every compiler and interpreter comes from the toolchain", () => {
    expect(AUTHOR_AGENT).toMatch(/every compiler, interpreter and test tool the commands use must come from `toolchain.packages` or `setup`, never from `\/usr`/);
  });

  it("asks for conda-forge packages it knows exist, from conda-forge only", () => {
    expect(AUTHOR_AGENT).toMatch(/Only conda-forge is used, so never name another channel/);
    expect(AUTHOR_AGENT).toMatch(/Use only package names you know conda-forge has/);
  });

  it("keeps a retry limit: without one, haiku made about 65 track attempts in one run", () => {
    expect(AUTHOR_AGENT).toMatch(/up to 3 tries, then report what still fails/);
  });

  it("shows a valid unit report and the exact statuses", () => {
    expect(AUTHOR_AGENT).toContain('{"tests":[{"name":"test_sum.test_basic","status":"pass"}');
  });

  it("explains how to write a mutant the visible tests miss, and that io output ignores trailing whitespace", () => {
    expect(AUTHOR_AGENT).toMatch(/edge cases .* hidden tests/);
    expect(AUTHOR_AGENT).toMatch(/trailing whitespace/);
  });

  it("lists exercise.yaml's only keys, so the track isn't written into it", () => {
    // Codex added `track:` to exercise.yaml after reading "use the ... track exactly as you were given them".
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.author]) {
      expect(text).toMatch(/`exercise.yaml` holds only/);
      expect(text).not.toMatch(/track exactly as/);
    }
  });

  it("tells an exercise author that each save sends the whole exercise", () => {
    // Codex re-sent only the file it changed after a gate failure (Angular): "exercise.yaml is missing".
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.author]) expect(text).toMatch(/Each `save_exercise` call sends every file of the exercise, not only the ones you changed/);
  });

  it("asks for the concept it was given first in exercise.yaml: a skipped topic's lock follows each exercise's own topic", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.author]) expect(text).toMatch(/`concepts` \(ids from the roadmap, the one you were given first\)/);
  });

  it("starts track versions at 1", () => {
    expect(AUTHOR_AGENT).toMatch(/starting at 1/);
  });
});

describe("activities that fit the concept", () => {
  // In real runs, "Bootstrapping a Spring Boot app" became "Extracting Initials from a Name", and "Project and app
  // structure" became "Triple Sum View": the author picked a toy program, and the track gave it one source file.
  it("asks for the kind of task that fits the concept, and a setup task for setup and configuration", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.author]) {
      expect(text).toMatch(/kind of task that fits the concept: write code, set up or configure/);
      expect(text).toMatch(/fix a bug the starter has, or extend code the starter gives/);
      expect(text).toMatch(/project structure, setup or configuration gets a setup task/);
    }
  });

  it("shows what a mutant of a setup task looks like", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.author]) expect(text).toMatch(/for a setup task, a plausible wrong configuration/);
  });

  it("says what each difficulty means for the task's scope and the starter's scaffolding", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.author]) {
      expect(text).toMatch(/difficulty 1, one small change in one file/);
      expect(text).toMatch(/2, one feature across the files the concept touches/);
      expect(text).toMatch(/3, a small realistic task that combines this concept with earlier ones/);
    }
  });

  it("asks a framework track for the project files a learner changes, unit tests through the framework's own client, and the course's dependencies", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.setup]) {
      expect(text).toMatch(/for a framework, the project files a learner changes/);
      expect(text).toMatch(/framework's unit tests go through its own test client/);
      expect(text).toMatch(/every dependency the course's concepts will use/);
      // A Django track with 15 learner files made every save carry 80 to 97 files, and Codex dropped or added some.
      expect(text).toMatch(/keep the list to the files activities change/);
      // The style is the roadmap's: a unit-only track for an io course left the course unable to go on.
      expect(text).not.toMatch(/For a framework, use `unit`/);
    }
  });

  it("asks research to prefer unit style for a framework, unless an installed track it uses offers only io", () => {
    expect(JOB_BRIEFS.research).toMatch(/For a framework, prefer `unit`.*unless an installed track you use offers only `io`/);
  });
});

describe("activities built on the lesson and the learner's last result", () => {
  it("asks the author to practise the lesson's own ideas, terms and code, and to adapt to the last result", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.author]) {
      expect(text).toMatch(/Practise what the concept's lesson teaches \(`lessonText`\): its ideas, terms and code/);
      expect(text).toMatch(/`last`/);
      // Proposal §3.3: what the learner missed reaches the author, hidden tests by number only.
      expect(text).toMatch(/`missed`: the visible tests they failed, by name, and the hidden ones, by number/);
      // The misses are named within that exercise, which `earlier` lists.
      expect(text).toMatch(/`last` is the learner's last graded attempt on this concept: its `exercise`, from `earlier`/);
      expect(text).toMatch(/find the mistake from what they missed, and write the next activity at it/);
    }
  });

  it("has the terminal tutor pass the lesson text and last result to the author subagent", () => {
    expect(AGENTS_SECTION).toMatch(/contract, earlier exercises, topics taught, lesson text and last result from `next_step`/);
  });
});

describe("the 1.0 learning flow in the tutor instructions", () => {
  it("handles setup, and teaches the lesson before the activity", () => {
    expect(AGENTS_SECTION).toMatch(/`setup`: the roadmap's track isn't installed yet/);
    expect(AGENTS_SECTION).toMatch(/`save_lesson`.*`get_lesson`.*call `mark_lesson_read` only after the learner says they've read it/s);
  });

  // Lessons only (proposal §3.5): a course with style `none` has no track and no exercises.
  it("teaches a lessons-only course through the learn step, and lets a roadmap choose it", () => {
    expect(AGENTS_SECTION).toMatch(/`learn`: the course has lessons only/);
    expect(AGENTS_SECTION).toMatch(/On `practice`, `author` and `learn`, a `lesson` field means teach first/);
    for (const text of [AGENTS_SECTION, JOB_BRIEFS.research, JOB_BRIEFS.roadmap]) expect(text).toMatch(/`none` when they want lessons only; `quiz` and `none` have no `track`/);
  });

  // Mixed course (style `both`): code and quizzes in one course, with a track.
  it("teaches a mixed course: the roadmap names both, and the author chooses per concept", () => {
    for (const text of [AGENTS_SECTION, JOB_BRIEFS.research, JOB_BRIEFS.roadmap]) expect(text).toMatch(/`both` when they want code and quizzes together/);
    expect(JOB_BRIEFS.research).toMatch(/set `style: both` and `track`/);
    expect(JOB_BRIEFS.author).toMatch(/A mixed course \(`style: both`\) takes both kinds: choose per concept/);
  });
});

describe("desktop job briefs (docs/desktop/DESIGN.md §3.2, §8)", () => {
  const kinds = Object.keys(JOB_BRIEFS) as JobKind[];

  // The desktop checks each brief against its job's tools (desktop/src/main/agent/briefs.test.ts).
  it("has a brief for every job in the spec", () => {
    expect(kinds.sort()).toEqual(["author", "lesson", "research", "review", "roadmap", "setup", "tutor"]);
  });

  // Setup carries both engines' track contracts: Docker's, and WASI's for computers without one (DESIGN §4.5).
  it.each(kinds)("keeps the %s brief within 25 lines (setup 32)", (kind) => {
    expect(JOB_BRIEFS[kind].split("\n").length).toBeLessThanOrEqual(kind === "setup" ? 32 : 25);
  });

  it("gives setup and author the same bench-checked rules as the terminal subagent", () => {
    expect(JOB_BRIEFS.setup).toMatch(/Use only package names you know conda-forge has/);
    expect(JOB_BRIEFS.setup).toMatch(/only proposes/);
    expect(JOB_BRIEFS.author).toMatch(/edge cases .* hidden tests/);
    expect(JOB_BRIEFS.author).toMatch(/reply with only the exercise id/);
  });

  it("sends a fresh author to next_step for the exact target and the track's contract", () => {
    expect(JOB_BRIEFS.author).toMatch(/`contract\.files`/);
    expect(JOB_BRIEFS.author).toMatch(/`contract\.examples`/);
    expect(AGENTS_SECTION).toMatch(/start the subagent with the concept, title, practice, pitfalls, difficulty, style, track, contract, earlier exercises, topics taught, lesson text and last result from `next_step`/);
  });

  it("asks the research job for its sources, and a roadmap change to keep them and the title", () => {
    expect(JOB_BRIEFS.research).toMatch(/`sources`/);
    expect(JOB_BRIEFS.roadmap).toMatch(/Keep `title` and `sources` unless asked/);
  });

  it("keeps the tutor's hint rule and keeps it away from saves", () => {
    expect(JOB_BRIEFS.tutor).toMatch(/not in chat/);
    expect(JOB_BRIEFS.tutor).toMatch(/Don't state the fix, write the code or list the steps/);
  });
});

describe("roadmap granularity", () => {
  it.each([
    ["the research brief", () => JOB_BRIEFS.research],
    ["the roadmap-change brief", () => JOB_BRIEFS.roadmap],
    ["the terminal tutor", () => AGENTS_SECTION],
  ])("%s makes each concept one skill, with specific prerequisites", (_label, text) => {
    expect(text()).toMatch(/One concept is one skill: what one short lesson teaches and a few small graded exercises cover/);
    expect(text()).toMatch(/"useEffect dependency arrays" and "useEffect cleanup", not "useEffect"/);
    expect(text()).toMatch(/`requires` names the specific earlier skills/);
  });

  it("asks research for the course's name in plain words", () => {
    expect(JOB_BRIEFS.research).toMatch(/`title` \(the course's name in a few plain words, at most 60 characters\)/);
  });

  it("sets 15 to 30 concepts as the default for a course, unless the learner asks for another depth, and checks real curricula", () => {
    expect(JOB_BRIEFS.research).toMatch(/about 15 to 30 concepts for a language or framework course, unless the learner asks for a different depth/);
    expect(JOB_BRIEFS.research).toMatch(/Split anything that needs more than one lesson/);
    expect(JOB_BRIEFS.research).toMatch(/real curricula or the official docs/);
  });
});

describe("diagrams in lessons", () => {
  it("tells the lesson writer when a picture helps and how to draw it, short and without naming a language", () => {
    const brief = JOB_BRIEFS.lesson;
    expect(brief).toMatch(/Add a diagram only when a picture teaches better than words/);
    expect(brief).toMatch(/control flow, a data structure, the steps of an algorithm or how cost grows/);
    expect(brief).toMatch(/fenced block with info string `mermaid`/);
    expect(brief).toMatch(/flowchart, sequenceDiagram, stateDiagram-v2, classDiagram, pie or xychart/);
    expect(brief).toMatch(/`accTitle` and a one-line `accDescr`/);
    expect(brief).toMatch(/shown as code if it doesn't draw/);
    expect(brief).toMatch(/a node label with symbols such as `\/ \( \) \[ \] \{ \} :` in double quotes, e\.g\. `C\["\/tmp\/main"\]`/);
    expect(brief.split("\n").length).toBeLessThanOrEqual(25);
  });

  it("leaves diagrams to the lesson job: other briefs don't ask for them", () => {
    for (const [kind, brief] of Object.entries(JOB_BRIEFS)) if (kind !== "lesson") expect(brief, kind).not.toMatch(/mermaid/);
  });
});

describe("lesson examples and learner-facing text (learner walkthrough W-2)", () => {
  it("tells the lesson writer that an example gets no input, holds exactly the track's learner files, and what to do otherwise", () => {
    const brief = JOB_BRIEFS.lesson;
    expect(brief).toMatch(/holding every file in `contract.files` and no other file/);
    expect(brief).toMatch(/no input at all, so an example must not read any/);
    expect(brief).toMatch(/An example that needs input goes in a plain code block/);
    expect(brief.split("\n").length).toBeLessThanOrEqual(25);
  });

  it.each([
    ["lesson", JOB_BRIEFS.lesson],
    ["author", JOB_BRIEFS.author],
    ["tutor", JOB_BRIEFS.tutor],
    ["terminal tutor", AGENTS_SECTION],
  ])("keeps arrows and emoji out of what the %s writes for the learner", (_label, text) => {
    expect(text).toMatch(/no arrows \(→\) or emoji in sentences/);
  });
});


describe("toolchain tracks (DESIGN §4.6)", () => {
  it("gives the toolchain block's contract: packages, setup with network, and env without the sandbox's names", () => {
    expect(AUTHOR_AGENT).toMatch(/`packages`: 1 to 64 conda-forge match specs/);
    expect(AUTHOR_AGENT).toMatch(/runs once at install, after the packages, in `\/opt\/track`, \*\*with network\*\*/);
    expect(AUTHOR_AGENT).toMatch(/never `PATH`, `HOME`, `TRACK`, `TESTS`, `OUT`, `LANG` or a `CODE_LEARN_` name/);
  });

  it("says where the toolchain and the track's files are at check time, read-only", () => {
    expect(AUTHOR_AGENT).toMatch(/The toolchain is read-only at `\/opt\/env`, with its `bin` first on `PATH`, and the track's files are read-only at `\/opt\/track`/);
  });

  it("no longer mentions Docker, images or WASI to authors", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.setup, JOB_BRIEFS.author]) expect(text).not.toMatch(/Docker|Dockerfile|\bimage\b|WASI|wasmtime/);
  });
});

// The owner: "the quality of the roadmap and its teachings matter so always always use the best practices"
// (docs/proposals/activities-for-any-topic.md §3.1, §3.6).
describe("research and teaching quality", () => {
  it("has every roadmap writer research from primary sources and record each concept's practice, pitfalls and refs", () => {
    for (const text of [AGENTS_SECTION, JOB_BRIEFS.research]) {
      expect(text).toMatch(/primary sources first/i);
      expect(text).toMatch(/last two years/);
      expect(text).toMatch(/Give every concept a `practice` line/);
      expect(text).toMatch(/If no graded activity can practise a concept, it isn't a concept/);
      expect(text).toMatch(/`pitfalls`.*the common mistakes your sources name, not ones from memory/);
      expect(text).toMatch(/`refs` lists the indexes \(from 0\) of the `sources`/);
      expect(text).toMatch(/scripted fake/);
    }
  });

  // A live review of a Harness Engineering roadmap (2026-10-31) fixed one statistic but passed practices no test can
  // grade, six blog sources out of nine, and a roadmap with no sandboxing or evaluation topics.
  it("defines a gradeable practice and a primary source, and has the review check coverage first", () => {
    for (const text of [AGENTS_SECTION, JOB_BRIEFS.research, JOB_BRIEFS.review]) {
      expect(text).toMatch(/a test with no model in it can grade: never a real model's behaviour or the quality of prose/);
      expect(text).toMatch(/vendor marketing, personal blogs and summaries are secondary/);
    }
    // The sharper review swapped in ten primary sources, all from one vendor.
    for (const text of [AGENTS_SECTION, JOB_BRIEFS.research]) expect(text).toMatch(/from more than one organization when the field has several/);
    expect(JOB_BRIEFS.review).toMatch(/every source is from one organization/);
    expect(JOB_BRIEFS.review).toMatch(/First list the core skills the primary sources name/);
    expect(JOB_BRIEFS.review).toMatch(/more than half the sources are secondary/);
  });

  it("has a roadmap change keep each kept concept's practice, pitfalls and refs", () => {
    expect(JOB_BRIEFS.roadmap).toMatch(/Keep each kept concept's `practice`, `pitfalls` and `refs`/);
  });

  it("has the review job check the roadmap against its sources, and fix it or say why not", () => {
    const brief = JOB_BRIEFS.review;
    expect(brief).toMatch(/a core skill from your list is missing/);
    expect(brief).toMatch(/isn't supported by the sources its `refs` name/);
    expect(brief).toMatch(/rewrite it into one that is, or fold the concept into a neighbour's lesson/);
    expect(brief).toMatch(/If nothing should change, don't save, and say why/);
  });

  it("gives every lesson the same teaching structure, built on the concept's practice and pitfalls", () => {
    for (const text of [AGENTS_SECTION, JOB_BRIEFS.lesson]) {
      expect(text).toMatch(/"\*\*You will be able to:\*\*", what the learner will be able to do \(from the concept's `practice`\)/);
      expect(text).toMatch(/"Worked example", one worked example, step by step/);
      expect(text).toMatch(/"Common mistakes", the common mistakes from the concept's `pitfalls`, with one shown and corrected/);
      expect(text).toMatch(/"Self-check", two questions .*; "Answers", their answers/);
      expect(text).toMatch(/optionally "Try it"/);
    }
  });

  // The saved lessons opened with "Recap:", "Last time:" or "Last topic:", and put Sources before or after Try it.
  it("names every part of a lesson and fixes their order, so every lesson of a course reads the same", () => {
    for (const text of [AGENTS_SECTION, JOB_BRIEFS.lesson]) {
      expect(text).toMatch(/the same parts, in the same order, under the same names/);
      expect(text).toMatch(/never copy any other words of these instructions into the lesson/);
      expect(text).toMatch(/No title heading/);
      const names = ["**Last time:**", "**You will be able to:**", "Why it matters", "The idea in small steps", "Worked example", "Common mistakes", "Remember", "Self-check", "Answers", "Try it", "Sources"];
      const places = names.map((name) => text.indexOf(`"${name}"`));
      expect(places).not.toContain(-1);
      expect(places).toEqual([...places].sort((a, b) => a - b));
    }
  });

  it("writes every lesson for a beginner who knows only the earlier topics, ending with a short Remember section", () => {
    for (const text of [AGENTS_SECTION, JOB_BRIEFS.lesson]) {
      expect(text).toMatch(/a recap of the topics this one builds on \(its `requires`; leave it out of the first lesson\)/);
      expect(text).toMatch(/show a small example first, then state the rule/);
      expect(text).toMatch(/"Remember", 3 to 5 short facts worth keeping, one line each/);
      expect(text).toMatch(/Assume the learner knows only what the earlier topics taught/);
      expect(text).toMatch(/Define each new term in plain words where it first appears, in bold there/);
      // A list of terms before the steps defined words the learner had no example for yet, and defined each one twice.
      expect(text).not.toMatch(/New words/);
      expect(text).toMatch(/Use nothing from a later topic/);
      expect(text).toMatch(/about a five-minute read/);
    }
  });

  it("keeps a lesson's steps in sequence and its words the same throughout", () => {
    for (const text of [AGENTS_SECTION, JOB_BRIEFS.lesson]) {
      expect(text).toMatch(/each step teaches one new thing, builds on the step before/);
      expect(text).toMatch(/use that same word for that thing/);
      expect(text).toMatch(/Call a thing what the roadmap's earlier topics call it/);
      expect(text).toMatch(/Spell out an abbreviation the first time/);
      expect(text).toMatch(/Before a code block or an example, say in one sentence what it shows/);
      expect(text).toMatch(/carry one example through the steps, changing one thing at a time/);
    }
  });

  it("keeps every activity to what the course has taught so far", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.author]) {
      expect(text).toMatch(/`taught` lists the topics before this one/);
      expect(text).toMatch(/Use nothing from a later topic: no construct, function or term the course hasn't taught yet/);
    }
  });

  it("has every author practise the concept's practice line and write wrong solutions from its pitfalls", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.author]) {
      expect(text).toMatch(/When the step has a `practice` line, the task practises exactly that/);
      expect(text).toMatch(/taken from the concept's `pitfalls` when it has them/);
    }
    expect(AGENTS_SECTION).toMatch(/the concept, title, practice, pitfalls, difficulty/);
  });

  it("lets a track hold a kit for a topic about tools or systems, written as track files", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.setup]) expect(text).toMatch(/\*\*A kit\.\*\*.*scripted fake service/);
  });
});

describe("quizzes (proposal §3.2, §3.6)", () => {
  it("lets a roadmap choose quiz, with no track, and research skip the tracks for it", () => {
    for (const text of [AGENTS_SECTION, JOB_BRIEFS.research, JOB_BRIEFS.roadmap]) expect(text).toMatch(/`quiz` when the learner wants multiple-choice questions instead of code/);
    expect(JOB_BRIEFS.research).toMatch(/Unless the course is `quiz` or `none`, call `list_tracks`/);
  });

  it("tells every author the quiz files, the key's shape and the item-writing guidelines", () => {
    for (const text of [AUTHOR_AGENT, JOB_BRIEFS.author]) {
      expect(text).toMatch(/Send `exercise.yaml`, `README.md` and `quiz.yaml`/);
      expect(text).toMatch(/5 to 10 `questions`, each with `text` and 3 to 5 `choices`/);
      expect(text).toMatch(/exactly one choice has `correct: true`, and every other one has a `why`/);
      expect(text).toMatch(/taken from the concept's `pitfalls`/);
      expect(text).toMatch(/Haladyna, Downing and Rodriguez/);
      expect(text).toMatch(/apply the idea to the scenario, not to recall a definition/);
      expect(text).toMatch(/no "all of the above" or "none of the above"/);
      expect(text).toMatch(/no negatives such as "which is NOT"/);
      expect(text).toMatch(/similar in length and form/);
    }
    expect(JOB_BRIEFS.author).toMatch(/the track's contract \(none for a quiz\)/);
  });

  it("tells the tutor how a stuck quiz topic gets a new quiz", () => {
    expect(AGENTS_SECTION).toMatch(/In a quiz course, once they've reread its lesson, call `mark_lesson_read` for it: that starts a new quiz/);
  });

  it("never lets the tutor give a quiz's key", () => {
    for (const text of [AGENTS_SECTION, JOB_BRIEFS.tutor]) {
      expect(text).toMatch(/In a quiz, never say which choice is right, not even by its number or letter: explain only why a choice the learner picked is wrong/);
    }
  });
});
