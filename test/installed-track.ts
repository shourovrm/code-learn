import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { type FileMap, readFileMap, writeFileMap } from "../src/files.js";
import { toolchainFiles } from "../src/gates.js";
import { parseTrackYaml, type TrackRecord } from "../src/schemas.js";
import * as store from "../src/store.js";

export const FIXTURES = join(import.meta.dirname, "fixtures");

/** A fixture track's files, from test/fixtures/tracks/<name>. */
export const fixtureTrackFiles = (name: string): FileMap => readFileMap(join(FIXTURES, "tracks", name));

/**
 * Installs a track for a test without micromamba or the gates: its record, and a toolchain folder holding its files at
 * track/ and an empty conda environment at env/. Checks and Run then go through the real sandbox, where the fixture
 * tracks need only the computer's own sh, coreutils and awk. `change` edits the record before it's written.
 */
export function installTrack(files: FileMap, change: (record: TrackRecord) => TrackRecord = (r) => r): TrackRecord {
  const { toolchain, ...spec } = parseTrackYaml(files["track.yaml"]!);
  const ref = `${spec.id}@${spec.version}`;
  const record = change({ format_version: 1, ...spec, toolchain: { ...toolchain, resolved: ["fake-1.0-0"] }, installedAt: new Date().toISOString() });
  store.commitFolder(store.trackDir(ref), files, { "track.json": record });
  const folders = store.toolchainFolders(store.envDir(ref));
  mkdirSync(join(folders.env, "conda-meta"), { recursive: true });
  writeFileSync(join(folders.env, "conda-meta", "fake-1.0-0.json"), "{}");
  mkdirSync(folders.track, { recursive: true });
  writeFileMap(folders.track, toolchainFiles(files));
  return record;
}

/** installTrack for a fixture track by name. */
export const installFixtureTrack = (name: string, change?: (record: TrackRecord) => TrackRecord) => installTrack(fixtureTrackFiles(name), change);
