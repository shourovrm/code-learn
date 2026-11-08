// electron-builder settings for the Linux installers (core DESIGN §4.6): an AppImage, which runs on any x64
// distribution, and a pacman package for Arch and its derivatives. Neither is signed, and nothing is published from
// a build: code-learn has no release channel yet, so the app has no automatic updates.

/** What every installer needs from the computer: the sandbox (bubblewrap) and the systemd user session it runs in. */
const SYSTEM_DEPENDENCIES = ['bubblewrap', 'systemd'];

/** @param {Record<string, string | undefined>} _env */
function packaging(_env) {
  return {
    appId: 'org.codelearn.desktop',
    productName: 'code-learn',
    artifactName: '${productName}-${version}-${os}-${arch}.${ext}',
    directories: { output: 'release', buildResources: 'build' },
    // The development mock (src/main/mock.ts) and its demo course never ship (#14).
    files: ['out/**', '!out/core/**', '!out/main/mock.js', 'package.json'],
    extraResources: [
      // The core, outside the asar archive, so the agent's MCP server can run it with the app as Node (§7).
      { from: 'out/core', to: 'core' },
      // The OFL asks that the license travel with the bundled fonts.
      { from: 'src/renderer/assets/fonts', to: 'fonts', filter: ['OFL-*.txt'] },
      // So do the MIT, ISC and other notices of what the renderer bundles (mermaid among it): vite writes them here.
      { from: 'out/renderer/licenses.md', to: 'licenses.md' },
      // The micromamba that installs each track's toolchain, with its notice (scripts/fetch-micromamba.mjs).
      { from: 'vendor/micromamba/linux-x64', to: 'micromamba', filter: ['micromamba', 'NOTICE'] },
    ],
    // No release channel yet, so nothing is published and the app checks for no updates (updates.ts).
    publish: null,
    extraMetadata: { codeLearn: { signed: false } },
    linux: {
      target: [
        { target: 'AppImage', arch: ['x64'] },
        { target: 'pacman', arch: ['x64'] },
      ],
      category: 'Education',
      executableName: 'code-learn',
      synopsis: 'Graded coding practice that your coding agent writes',
      maintainer: 'code-learn contributors',
    },
    // The pacman package names what it needs; an AppImage can't, so the app's Check this computer says it instead.
    pacman: { depends: SYSTEM_DEPENDENCIES },
  };
}

module.exports = { packaging, SYSTEM_DEPENDENCIES };
