import type { FileMap } from "../../src/files.js";
import { subMap } from "../../src/files.js";
import type { JudgeTrack } from "../../src/judge.js";
import { judgeTrack } from "../../src/store.js";
import { installFixtureTrack } from "../installed-track.js";

export { FIXTURES, fixtureTrackFiles } from "../installed-track.js";

/** Installs a fixture track into the current CODE_LEARN_HOME and returns what the judge runs it with. */
export function installedJudgeTrack(name: string, change?: Parameters<typeof installFixtureTrack>[1]): JudgeTrack {
  return judgeTrack(installFixtureTrack(name, change));
}

/** io expected outputs from a probe's NN.out files, keyed `<set>/NN`. */
export function expectedFrom(tests: FileMap, set: "visible" | "hidden"): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [p, v] of Object.entries(tests)) if (p.endsWith(".out")) out[`${set}/${p.slice(0, -4)}`] = v;
  return out;
}

export const inputsOnly = (tests: FileMap): FileMap => Object.fromEntries(Object.entries(tests).filter(([p]) => p.endsWith(".in")));
export { subMap };
