// @vitest-environment node
import { chmodSync, mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { posix as posixPath, win32 } from 'node:path';
import { find, folders, here, shimTarget, type Where } from './find';
import { tempDir } from '../testing/temp';

/** What every npm `.cmd` shim starts with (npm's cmd-shim). */
const NPM_HEAD = '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n';
/** cmd-shim's body for a `#!/usr/bin/env node` target: a node.exe beside the shim if there is one, else node on PATH. */
const NPM_NODE_SHIM = (target: string) =>
  '\r\nIF EXIST "%dp0%\\node.exe" (\r\n  SET "_prog=%dp0%\\node.exe"\r\n) ELSE (\r\n  SET "_prog=node"\r\n  SET PATHEXT=%PATHEXT:;.JS;=;%\r\n)\r\n\r\n' +
  `endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\${target}" %*\r\n`;

function tree() {
  const root = tempDir('code-learn-find-');
  const at = (...p: string[]) => join(root, ...p);
  return { root, at };
}

const posix = (path: string, home: string): Where => ({ platform: 'darwin', path, home });

describe('find (§3.1)', () => {
  it('finds a native executable on PATH', () => {
    const { at } = tree();
    mkdirSync(at('bin'));
    writeFileSync(at('bin', 'claude'), '\x7fELF binary');
    chmodSync(at('bin', 'claude'), 0o755);
    expect(find('claude', posix(at('bin'), at('home')))).toEqual({ path: at('bin', 'claude'), js: false });
  });

  it('runs a Node launcher as a script, through its symlink', () => {
    const { at } = tree();
    mkdirSync(at('lib'), { recursive: true });
    mkdirSync(at('bin'));
    writeFileSync(at('lib', 'codex.js'), '#!/usr/bin/env node\nconsole.log(1)\n');
    symlinkSync(at('lib', 'codex.js'), at('bin', 'codex'));
    const found = find('codex', posix(at('bin'), at('home')));
    expect(found?.js).toBe(true);
    expect(found?.path.endsWith('codex.js')).toBe(true);
  });

  it('looks in the usual folders when PATH has nothing (GUI apps load no shell profile)', () => {
    const { at } = tree();
    mkdirSync(at('home', '.local', 'bin'), { recursive: true });
    writeFileSync(at('home', '.local', 'bin', 'claude'), 'binary');
    expect(find('claude', posix('', at('home')))).toEqual({ path: at('home', '.local', 'bin', 'claude'), js: false });
    expect(find('nothing-here', posix('', at('home')))).toBeNull();
  });

  it('looks where Volta, nvm and fnm put the CLIs they install, nvm\'s default version first', () => {
    const put = (at: (...p: string[]) => string, ...p: string[]) => {
      mkdirSync(at(...p.slice(0, -1)), { recursive: true });
      writeFileSync(at(...p), 'binary');
      return at(...p);
    };
    const volta = tree();
    put(volta.at, 'home', '.volta', 'bin', 'claude');
    expect(find('claude', posix('', volta.at('home')))?.path).toBe(volta.at('home', '.volta', 'bin', 'claude'));

    const nvm = tree();
    put(nvm.at, 'home', '.nvm', 'versions', 'node', 'v20.11.0', 'bin', 'codex');
    put(nvm.at, 'home', '.nvm', 'versions', 'node', 'v9.0.0', 'bin', 'codex');
    // With no default alias, the newest version.
    expect(find('codex', posix('', nvm.at('home')))?.path).toBe(nvm.at('home', '.nvm', 'versions', 'node', 'v20.11.0', 'bin', 'codex'));
    mkdirSync(nvm.at('home', '.nvm', 'alias'));
    writeFileSync(nvm.at('home', '.nvm', 'alias', 'default'), '9\n');
    expect(find('codex', posix('', nvm.at('home')))?.path).toBe(nvm.at('home', '.nvm', 'versions', 'node', 'v9.0.0', 'bin', 'codex'));

    const fnm = tree();
    put(fnm.at, 'home', '.local', 'share', 'fnm', 'aliases', 'default', 'bin', 'codex');
    expect(find('codex', posix('', fnm.at('home')))?.path).toBe(fnm.at('home', '.local', 'share', 'fnm', 'aliases', 'default', 'bin', 'codex'));
  });

  it("finds Codex where OpenAI's Windows installer puts it, and Claude Code in the profile's .local\\bin", () => {
    const { at } = tree();
    mkdirSync(at('local', 'Programs', 'OpenAI', 'Codex', 'bin'), { recursive: true });
    writeFileSync(at('local', 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'), 'MZ');
    mkdirSync(at('home', '.local', 'bin'), { recursive: true });
    writeFileSync(at('home', '.local', 'bin', 'claude.exe'), 'MZ');
    const w: Where = { platform: 'win32', path: '', home: at('home'), localAppData: at('local') };
    expect(find('codex', w)?.path).toBe(join(at('local'), 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe'));
    expect(find('claude', w)?.path).toBe(join(at('home'), '.local', 'bin', 'claude.exe'));
  });

  it("reads an npm .cmd shim's script instead of running the shim", () => {
    const { at } = tree();
    mkdirSync(at('npm', 'node_modules', '@openai', 'codex', 'bin'), { recursive: true });
    writeFileSync(at('npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'), '#!/usr/bin/env node\n');
    writeFileSync(
      at('npm', 'codex.cmd'),
      '@ECHO off\r\nGOTO start\r\n:find_dp0\r\nSET dp0=%~dp0\r\nEXIT /b\r\n:start\r\nSETLOCAL\r\nCALL :find_dp0\r\n"%_prog%"  "%dp0%\\node_modules\\@openai\\codex\\bin\\codex.js" %*\r\n',
    );
    expect(shimTarget(at('npm', 'codex.cmd'))?.path.replace(/\\/g, '/')).toMatch(/node_modules\/@openai\/codex\/bin\/codex\.js$/);
  });

  it("finds the script in npm's real shim, past the node.exe beside it that the shim would prefer", () => {
    const { at } = tree();
    mkdirSync(at('npm', 'node_modules', '@openai', 'codex', 'bin'), { recursive: true });
    writeFileSync(at('npm', 'node_modules', '@openai', 'codex', 'bin', 'codex.js'), '#!/usr/bin/env node\n');
    writeFileSync(at('npm', 'codex.cmd'), NPM_HEAD + NPM_NODE_SHIM('node_modules\\@openai\\codex\\bin\\codex.js'));
    const found = find('codex', { platform: 'win32', path: '', home: at('home'), appData: at('.') });
    expect(found?.js).toBe(true);
    expect(found?.path.replace(/\\/g, '/')).toMatch(/node_modules\/@openai\/codex\/bin\/codex\.js$/);
  });

  it('runs the native binary an npm shim points at: Claude Code from npm', () => {
    const { at } = tree();
    mkdirSync(at('npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin'), { recursive: true });
    writeFileSync(at('npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'), 'MZ');
    // npm's shim for a target with no shebang (cmd-shim): it runs the file itself.
    writeFileSync(at('npm', 'claude.cmd'), `${NPM_HEAD}"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*\r\n`);
    const target = shimTarget(at('npm', 'claude.cmd'));
    expect(target?.js).toBe(false);
    expect(target?.path.replace(/\\/g, '/')).toMatch(/npm\/node_modules\/@anthropic-ai\/claude-code\/bin\/claude\.exe$/);
    expect(find('claude', { platform: 'win32', path: '', home: at('home'), appData: at('.') })).toEqual(target);
  });

  it("passes over npm's Claude Code while its binary is still the text placeholder its postinstall replaces", () => {
    const { at } = tree();
    mkdirSync(at('npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin'), { recursive: true });
    writeFileSync(at('npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'), 'echo "Error: claude native binary not installed." >&2\nexit 1\n');
    writeFileSync(at('npm', 'claude.cmd'), `${NPM_HEAD}"%dp0%\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe"   %*\r\n`);
    mkdirSync(at('home', '.local', 'bin'), { recursive: true });
    writeFileSync(at('home', '.local', 'bin', 'claude.exe'), 'MZ');
    expect(find('claude', { platform: 'win32', path: '', home: at('home'), appData: at('.') })?.path).toBe(join(at('home'), '.local', 'bin', 'claude.exe'));
  });

  it("finds what WinGet installs, through its command links, before the PATH it set is read", () => {
    const { at } = tree();
    mkdirSync(at('local', 'Microsoft', 'WinGet', 'Links'), { recursive: true });
    writeFileSync(at('local', 'Microsoft', 'WinGet', 'Links', 'claude.exe'), 'MZ');
    mkdirSync(at('pf', 'WinGet', 'Links'), { recursive: true });
    writeFileSync(at('pf', 'WinGet', 'Links', 'codex.exe'), 'MZ');
    const w: Where = { platform: 'win32', path: '', home: at('home'), localAppData: at('local'), programFiles: at('pf') };
    expect(find('claude', w)).toEqual({ path: join(at('local'), 'Microsoft', 'WinGet', 'Links', 'claude.exe'), js: false });
    expect(find('codex', w)).toEqual({ path: join(at('pf'), 'WinGet', 'Links', 'codex.exe'), js: false });
    expect(here({ ProgramFiles: 'D:\\Programs' }).programFiles).toBe('D:\\Programs');
  });

  it("looks in Cursor's own folder, and runs Cursor's own node.exe on its index.js, never the PowerShell launcher there", () => {
    const { at } = tree();
    mkdirSync(at('local', 'cursor-agent'), { recursive: true });
    // Cursor's own launcher, as its Windows installer wrote it on GitHub's runner (2026.10.22).
    writeFileSync(
      at('local', 'cursor-agent', 'cursor-agent.cmd'),
      [
        '@echo off', 'rem cursor-agent-promote-staged', 'if exist "%~dp0versions\\promote-staged.cmd" call "%~dp0versions\\promote-staged.cmd"', 'if errorlevel 1 exit /b 1',
        '@echo off', 'setlocal enabledelayedexpansion', 'set "CURSOR_INVOKED_AS=%~nx0"', '', 'REM Get the directory of this script', 'set "SCRIPT_DIR=%~dp0"',
        'REM Remove trailing backslash', 'if "%SCRIPT_DIR:~-1%"=="\\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"', '',
        '%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%\\cursor-agent.ps1" %*', '',
      ].join('\r\n'),
    );
    const w: Where = { platform: 'win32', path: '', home: at('home'), localAppData: at('local') };
    expect(folders(w)).toContain(join(at('local'), 'cursor-agent'));
    // No version to run: not installed (§3.1).
    expect(find('cursor-agent', w)).toBeNull();
    const version = at('local', 'cursor-agent', 'versions', '2026.10.22-27dcf5f');
    mkdirSync(version, { recursive: true });
    writeFileSync(join(version, 'node.exe'), 'MZ');
    writeFileSync(join(version, 'index.js'), '');
    expect(find('cursor-agent', w)).toMatchObject({ path: join(version, 'node.exe'), js: false, args: [join(version, 'index.js')], env: { CURSOR_INVOKED_AS: 'cursor-agent.cmd' } });
  });

  it("never takes another tool's .cmd beside a node.exe and index.js for Cursor", () => {
    const { at } = tree();
    mkdirSync(at('bin'));
    writeFileSync(at('bin', 'claude.cmd'), '@echo off\r\n');
    writeFileSync(at('bin', 'node.exe'), 'MZ');
    writeFileSync(at('bin', 'index.js'), '');
    expect(find('claude', { platform: 'win32', path: at('bin'), home: at('home') })).toBeNull();
  });

  it("runs a node.exe beside Cursor's launcher, as the launcher does", () => {
    const { at } = tree();
    mkdirSync(at('bin'));
    writeFileSync(at('bin', 'cursor-agent.cmd'), '@echo off\r\n');
    writeFileSync(at('bin', 'node.exe'), 'MZ');
    writeFileSync(at('bin', 'index.js'), '');
    expect(find('cursor-agent', { platform: 'win32', path: at('bin'), home: at('home') })).toMatchObject({ path: at('bin', 'node.exe'), args: [at('bin', 'index.js')] });
  });

  it("searches only the given folders when a test sets them: a journey's no-agent run", () => {
    const dir = realpathSync(tempDir('code-learn-only-'));
    writeFileSync(join(dir, 'claude'), '#!/bin/sh\n');
    chmodSync(join(dir, 'claude'), 0o755);
    const w: Where = { platform: 'darwin', path: '', home: '/nowhere', searchDirs: [] };
    expect(find('claude', w)).toBeNull();
    expect(find('claude', { ...w, searchDirs: [dir] })).toEqual({ path: join(dir, 'claude'), js: false });
    expect(here({ CODE_LEARN_TEST_SEARCH_DIRS: [dir, '/also'].join(delimiter) }).searchDirs).toEqual([dir, '/also']);
    expect(here({}).searchDirs).toBeUndefined();
  });
});
