# Changelog

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
