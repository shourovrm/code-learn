# Changelog

## 0.2.9 (2026-11-14)

- Lessons no longer follow the old fixed outline. The brief asks for a worked example and the common mistakes only where the idea needs them, and inside the part that teaches it, not as sections of their own. Overview and In-depth set a length, not a number of steps and mistakes.
- `save_lesson` refuses a `##` heading named after its role (Examples, Summary, Steps, Common mistakes, Pitfall: …), so each heading names what its part teaches.

## 0.2.8 (2026-11-13)

- Text size is one **Aa** button in the sidebar. It opens a small bar beside the sidebar with A−, the size, A+ and Reset; Escape, a click outside or the button again closes it. Ctrl+= and Ctrl+- still work anywhere.
- A lesson's text now really fills the reading pane.

## 0.2.7 (2026-11-13)

- A roadmap draft is listed in the sidebar, marked Draft, and opens from any page. **Discard draft** deletes it after asking, and starting a new course replaces it, so no draft is left where you can't reach it.
- When Code is on, the roadmap shows the toolchain the course will practise with: use it, or tell the agent what you'd like instead. When code exercises don't suit the subject, the agent says so and offers Quiz.
- Text size on every page: A− and A+ in the sidebar, or Ctrl+= and Ctrl+-, with Ctrl+0 back to the starting size you choose in Settings. Only the text scales.
- Lessons use the whole reading pane. A long code line wraps under its own indentation, so it never looks like a new line.
- A locked exercise says what it waits for: the earlier topic to practise first, with Go to, or the lesson to finish. A lesson says that Next marks it read.
- A chosen "How deep" or "How to practise" option is filled and checked.

## 0.2.6 (2026-11-11)

- New lesson instructions. The lesson writer is told who the learner is, what the lesson must let them do, how to teach it, which form fits which content (a table for a comparison, a numbered list for steps, paragraphs for reasoning), and to leave out any figure, date or rule number it isn't sure of. A lesson's goal now completes "You will be able to:".
- Lessons show tables with ruled cells and a shaded header, and space their lists and quotes.
- The tutor reviews the small task a lesson may end with, saying what is right, what is wrong and why.

## 0.2.5 (2026-11-11)

- Lessons no longer follow one fixed outline. Each lesson takes the shape its idea needs, and its headings name its subject. code-learn shows the same frame around every lesson: what you will be able to do at the top, a self-check with hidden answers, and the topic's sources at the end. A lesson written in the old outline says so; rebuild its topic to rewrite it.
- A quiz shows its questions as numbered cards with A, B and C on each choice, how many you have answered beside Check, and after Check a note under each question. The Contents button opens the topic's contents beside a quiz, as beside a lesson or a code exercise.

## 0.2.4 (2026-11-10)

- A model for each kind of job: Planning, Lessons, Exercises and Tutor. Connect now shows agents only, and the next screen, "Choose a model for each job", offers the models your agent has enabled. Settings has the same four menus. Lessons are most of a course's cost, so a smaller model there saves the most.
- Depth is kept with the course. The roadmap's review keeps the course at the size you chose, and an overview or in-depth course gets shorter or deeper lessons and exercises. Rebuild has a "How deep" choice for the topics you rebuild.
- One agent run writes up to three lessons. The lesson you are waiting for is still written alone; the next three topics' lessons are written ahead while you study, once the toolchain is set up.
- Beside an exercise, the sidebar's Contents button is the one way to the contents; the Brief and Contents tabs are gone.
- Courses on any subject: the planner is no longer worded for code only, counts laws, regulations, official guidance and reference works as primary sources, and in a lessons-only course keeps every topic.

## 0.2.3 (2026-11-10)

- Settings replaces Agent in the sidebar, with three cards: Agent, Sync with GitHub and Theme.
- Sync with GitHub: your courses, progress, notes and code go to your own private repository, through gh or a git address. It syncs at start, about a minute after changes, and before quitting, behind a prompt. Two computers keep both sides' progress and notes; for your code, this computer's version stays and the other is saved beside it.
- Every lesson has the same parts in the same order: "Last time", "You will be able to", Why it matters, The idea in small steps, Worked example, Common mistakes, Remember, Self-check, Answers, an optional Try it, and Sources. code-learn refuses a lesson that misses one, so this holds for any agent or model.
- The "New words" list is gone: a new term is defined in bold where it first appears, and keeps that one word afterwards.
- A lesson's writer reads the lessons of the topics it builds on (at most three), so words and examples carry over; each step teaches one new thing; a sentence before each code block says what it shows.
- The roadmap's goal records what you already know, and lessons are pitched to it.
- An exercise's statement has the same parts every time: what to do, Rules and Example.
- A Contents button in the sidebar (and Ctrl+\) shows or hides the lesson outline; an exercise has Brief and Contents tabs.
- The current topic's exercise is written ahead of lessons queued for later topics.
- Fable is among Claude Code's models.

## 0.2.2 (2026-11-10)

- Lessons and exercises stay within what the course has taught: the exercise author gets the topics before its own and may use nothing from a later one. Lessons are written for a beginner: a recap of the last topic, a "New words" list, a small example before each rule, short sentences, about five minutes to read, and a short Remember section of 3 to 5 facts.
- Every topic opens from the Learn page, with how far it got (lessons read, checks, mastery, or Not started). A topic checked before keeps its exercise open after the course moves on, so it can be mastered later.
- On an exercise, Previous and Next step through every topic ("Topic 2 of 19").
- The lesson page: a panel with all topics, the topic's pages, its done count and the next topic, which folds away; "Lesson 1 of 3 · about 5 min"; a narrower column with roomier lines; self-check answers stay hidden behind Show answers.
- A topic opened ahead of the path with no lessons yet names what it builds on, warns about topics not started, and offers Write this topic's lessons. The current topic stays where it is.

## 0.2.1 (2026-11-09)

- The code keeps the column: Run output and check results share one panel under the editor, as Terminal and Results tabs. Run shows Terminal, Check and Try it show Results; the panel can be dragged from 15% to 75% of the column, or folded to its tabs.
- The task column is wider (400px), and the tutor narrower (288px); the tutor folds into a strip beside the code, which gives the task 440px, and the app remembers the choice.
- The editor indents as you type: Enter keeps the line's indent and adds a step after `{`, `(`, `[` or `:`; Tab and Shift+Tab indent and outdent lines; a closer on a blank line steps back; Backspace removes a whole step. Esc, then Tab, leaves the editor.

## 0.2.0 (2026-11-09)

- A new look, the Seed packet: garden-green sidebar and exercise column, marigold for the one thing to do now on each screen, sage-grey paper elsewhere, in light and dark. Sizes follow Atlassian's design system: 14px body text, 32px buttons, an 8px spacing scale.
- Progress is drawn from the logo: a seed not started, a shoot under way, a sprout done, on the Learn path and beside lessons.
- The exercise screen lists the topic's lessons and the exercise beside the task; a lesson opens from there.
- The screens say "exercise" everywhere, where some said "activity"; the Learn switch is now Exercises. A message no longer points to a Settings screen that doesn't exist.
- The tutor's Send is a plain button, so each screen has one main action.
- Results wrap at 400% zoom, and every line on the Solved card meets contrast.

## 0.1.1 (2026-11-09)

- Rebuild takes optional instructions for the agent. They go into the rebuilt topics' lesson and exercise jobs; the course's original instructions aren't reused.

## 0.1.0 (2026-11-09)

- Courses: a Courses page in the sidebar renames and deletes courses, with a confirmation. Deleting a course removes its lessons, exercises, history and exercise files; its toolchain stays installed.
- Tracks are called Toolchains in the app. Each toolchain names the courses that use it, and Remove waits until none do.
- A new course can mix code exercises and quizzes (Code and Quiz both picked; course.json format 2), and takes optional instructions for the agent.
- Rebuild: on the Learn page, pick some topics or all of them and have the agent write their lessons and exercises again, replacing the old ones or adding beside them.
- Exercises: Previous and Next, a Solved card and the last check when you come back, and a Solution button that opens the reference solution after three checks or a pass. Checks after that count as assisted.
- A diagram that doesn't draw stays inside the lesson with its source, in the theme's colours, and can be hidden and shown again. Agents are told to quote diagram labels that contain symbols.
- The model list on the Connect screen shows the models that pi and Codex approve in their own settings.
- Built and tested with Electron 43.

## 0.1.0-beta.1 (2026-11-09)

- Linux only. Checks run in a bubblewrap sandbox inside a systemd user scope, with no network, read-only inputs and memory, process and CPU limits; there is no Docker.
- Each track installs its toolchain from conda-forge with micromamba into its own folder, `~/.code-learn/envs/<id>@<version>/`, declared in a `toolchain` block in `track.yaml`. `code-learn track remove` and the desktop app's Remove delete it.
- The desktop app ships as an AppImage and a pacman package, bundles micromamba 2.10.0, and checks this computer for bubblewrap, the systemd user session and sandbox isolation.
- A dark theme. The sidebar's Theme switch offers System (the default, which follows the desktop's light or dark preference as it changes), Light and Dark; the choice is remembered.
- A new look of its own: the logo is a sprout growing from a cursor, and the mascot is Sprig, a seedling in a pot, in place of Codemm's chevron and chameleon. A running job fills Sprig from the pot up.
- Back: a Back button at the top of the sidebar, Alt+Left and the mouse's back button return to the previous screen of the course (Learn, a topic, a lesson, Practice or Tracks), never to a setup step.
- The slim sidebar names each icon in its own tooltip on hover and keyboard focus, which shows on every window manager, and the sidebar's hover state is easier to see.
- The current topic's title on the Learn path opens its topic page, so a lesson already read can be read again.
