# code-learn desktop copy

The words on screen, in the learner's terms (docs/design-system.md). `desktop/src/renderer/copy.test.ts` fails when
a screen's text or a visible attribute (label, placeholder, title, alt) holds an implementation word, an apology or
an exclamation mark. Atlassian's copy rules apply: sentence case, verbs on buttons, contractions, no "please", no
"sorry".

## Vocabulary

| Word | Means | Not |
|---|---|---|
| course | everything learned about one goal | track, roadmap (on screen) |
| topic | one skill in a course | concept, node |
| lesson | something to read in a topic | page, article |
| exercise | the practice that closes a topic: code or a quiz | activity, task, challenge |
| check | grading the learner's answer | test run, submission |
| try it | running the code without grading | dry run |
| solution | the reference answer, after three checks or a pass | key, answer file |
| hint | the tutor's nudge | tip, clue |
| tutor | the agent answering questions beside the work | assistant, bot, session |
| agent | the coding agent the learner connects | model, provider, harness |
| toolchain | the compilers and libraries a course installs | track, environment |
| this computer | the learner's machine and what it needs | host, system, settings |
| sandbox | where code-learn runs code, cut off from files and the network | container, jail |
| rebuild | writing a topic's lessons and exercise again | regenerate, reset |
| mastery | how well a topic is known | score, level |

"Sandbox" and "bubblewrap" stay on the Check this computer screen only: that is where the learner installs and
fixes it.

## Rules

- A label is a noun phrase of at most three words, never a question; a field's question is its heading.
- A button is a verb and its object: "Rebuild topics", "Check", "Show me". Common actions use "Done", "Cancel",
  "Close".
- A hint is one line of at most twelve words that says the effect, only when the label isn't enough.
- A status line says what happened, then what the learner can do: "Couldn't set up React. Check this computer, then
  try again."
- An error names what failed and offers one action; no technical detail, no apology.
- One calm voice: no jokes, no exclamation marks. Numbers the learner can't act on stay off the main screens.
- A screen points only to places that exist: Learn, Practice, Courses, Toolchains, Agent, Check this computer.

## Changed

| Was | Now | Why |
|---|---|---|
| Activity (outline and topic rows) | Exercise | one name for one thing; the nav says Practice, the screen says exercise |
| Activities (the switch on Learn) | Exercises | same |
| Turning activities on / off | Turning exercises on / off | same |
| Writing the activity / Writing an activity on … | Writing the exercise / Writing an exercise on … | same |
| Practice opens here once your activity is written. | … once your exercise is written. | same |
| … then reopen this activity. | … then reopen this exercise. | same |
| This activity isn't ready yet. | This exercise isn't ready yet. | same |
| Check this computer under Settings, then run again. | Check this computer, then run again. | there is no Settings |
| Send (tutor, primary) | Send (default button) | one primary per screen |
