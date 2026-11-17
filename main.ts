// Token radar: a ranked board of pre-token protocols, from a sealed snapshot.
//
//   node main.ts --input <snapshot.json> --output <dir>
//
// Reads the snapshot (its own as_of date is the reference "now": the program never reads the wall
// clock), fits the size curve from the snapshot's trading set, ranks every rankable pre-token
// protocol by its implied value, and writes the board, the dashboard's data, the dashboard and its
// screenshots, and the dossier the scorer rebuilds. Runs twice, the bytes are identical.

import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  boardIssue,
  buildRadar,
  dataScript,
  parseSnapshot,
  SnapshotError,
} from './lib/model.ts';
import { buildDossier, DossierError } from './vendor/makefun-board.ts';

/** How many screenshots the entry carries: the board, a detail view, a filtered view. */
const SCREENSHOT_COUNT = 3;
/** A screenshot's most bytes: 512 KiB, as the gate's gate_rows read it. */
const SCREENSHOT_MAX_BYTES = 512 * 1024;
/** The dashboard source the judge reads is capped at 64 KiB: the dossier text holds 65,536 bytes. */
const DOSSIER_TEXT_MAX_BYTES = 65_536;

/** The one-line usage the program prints when its arguments are wrong. */
const USAGE =
  'usage: node main.ts --input <snapshot.json> --output <dir>  (or set MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR)';

const root = dirname(fileURLToPath(import.meta.url));

/** The snapshot's path: the flag, then the harness's input directory, then the kit beside this repo. */
function inputPath(args: Map<string, string>): string {
  const flag = args.get('input');
  if (flag !== undefined) return flag;
  const dir = process.env.MAKEFUN_INPUT_DIR;
  if (dir !== undefined && dir !== '') return join(dir, 'snapshot.json');
  return join(root, '..', 'token-radar-01-kit', 'token-radar-01-kit', 'input', 'snapshot.json');
}

/** The output's path: the flag, then the harness's output directory, then ./out. */
function outputPath(args: Map<string, string>): string {
  const flag = args.get('output');
  if (flag !== undefined) return flag;
  const dir = process.env.MAKEFUN_OUTPUT_DIR;
  if (dir !== undefined && dir !== '') return dir;
  return join(root, 'out');
}

/** The flag arguments as a map, refusing a flag with no value and an unknown flag. */
function parseArgs(argv: string[]): Map<string, string> {
  const args = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a !== '--input' && a !== '--output') throw new Error(`${USAGE}: unknown argument ${a}`);
    const v = argv[i + 1];
    if (v === undefined) throw new Error(`${USAGE}: ${a} needs a value`);
    args.set(a.slice(2), v);
    i++;
  }
  return args;
}

/** A directory, or the snapshot path inside it when the flag names a directory. */
function snapshotFile(path: string): string {
  return existsSync(path) && statSync(path).isDirectory() ? join(path, 'snapshot.json') : path;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const inFile = snapshotFile(inputPath(args));
  const outDir = resolve(outputPath(args));
  const text = readFileSync(inFile, 'utf8');
  const snapshot = parseSnapshot(text);
  const { board, radar } = buildRadar(snapshot);
  const issue = boardIssue(board, snapshot);
  if (issue !== null) throw new SnapshotError(`the board is not one the gate will take: ${issue}`);
  if (board.length < 100) throw new SnapshotError(`the board has ${board.length} rows: a board needs at least 100`);

  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'board.json'), `${JSON.stringify(board, null, 2)}\n`);
  writeFileSync(join(outDir, 'data.js'), dataScript(radar));
  cpSync(join(root, 'dashboard'), join(outDir, 'dashboard'), { recursive: true });
  cpSync(join(root, 'screenshots'), join(outDir, 'screenshots'), { recursive: true });

  const shots = readdirSync(join(outDir, 'screenshots'))
    .filter((n) => /\.(?:png|jpe?g)$/i.test(n))
    .sort();
  if (shots.length !== SCREENSHOT_COUNT) {
    throw new SnapshotError(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: the entry needs ${SCREENSHOT_COUNT}`);
  }
  for (const name of shots) {
    const size = statSync(join(outDir, 'screenshots', name)).size;
    if (size > SCREENSHOT_MAX_BYTES) throw new SnapshotError(`screenshots/${name} is ${size} bytes: a screenshot holds at most ${SCREENSHOT_MAX_BYTES}`);
  }

  const dossier = buildDossier(outDir, {
    text_max_bytes: DOSSIER_TEXT_MAX_BYTES,
    screenshots: { max: SCREENSHOT_COUNT, max_bytes: SCREENSHOT_MAX_BYTES },
    dashboard: { max_files: 8, max_bytes: 4 * 1024 * 1024 },
  });
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  console.log(`wrote ${outDir}: board ${board.length} rows (watchlist ${radar.watchlist_size}, early ${radar.early_size}), live ${radar.live_size}, dossier ${dossier.length} bytes`);
}

try {
  main();
} catch (error) {
  if (error instanceof SnapshotError || error instanceof DossierError) {
    console.error(`error: ${error.message}`);
    process.exitCode = 1;
  } else {
    throw error;
  }
}
