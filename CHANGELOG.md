# Changelog

## Unreleased

- Linux only. Checks run in a bubblewrap sandbox inside a systemd user scope, with no network, read-only inputs and memory, process and CPU limits; there is no Docker.
- Each track installs its toolchain from conda-forge with micromamba into its own folder, `~/.code-learn/envs/<id>@<version>/`, declared in a `toolchain` block in `track.yaml`. `code-learn track remove` and the desktop app's Remove delete it.
- The desktop app ships as an AppImage and a pacman package, bundles micromamba 2.10.0, and checks this computer for bubblewrap, the systemd user session and sandbox isolation.
