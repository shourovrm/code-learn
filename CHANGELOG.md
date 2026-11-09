# Changelog

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
