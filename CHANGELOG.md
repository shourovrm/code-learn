# Changelog

## 1.0.0-beta.11 (2026-11-09)

- Linux only. Checks run in a bubblewrap sandbox inside a systemd user scope, with no network, read-only inputs and memory, process and CPU limits; there is no Docker.
- Each track installs its toolchain from conda-forge with micromamba into its own folder, `~/.code-learn/envs/<id>@<version>/`, declared in a `toolchain` block in `track.yaml`. `code-learn track remove` and the desktop app's Remove delete it.
- The desktop app ships as an AppImage and a pacman package, bundles micromamba 2.10.0, and checks this computer for bubblewrap, the systemd user session and sandbox isolation.
- A dark theme. The sidebar's Theme switch offers System (the default, which follows the desktop's light or dark preference as it changes), Light and Dark; the choice is remembered.
- A new look of its own: the logo is a sprout growing from a cursor, and the mascot is Sprig, a seedling in a pot, in place of Codemm's chevron and chameleon. A running job fills Sprig from the pot up.
- Back: a Back button at the top of the sidebar, Alt+Left and the mouse's back button return to the previous screen of the course (Learn, a topic, a lesson, Practice or Tracks), never to a setup step.
- The slim sidebar names each icon in its own tooltip on hover and keyboard focus, which shows on every window manager, and the sidebar's hover state is easier to see.
- The current topic's title on the Learn path opens its topic page, so a lesson already read can be read again.
