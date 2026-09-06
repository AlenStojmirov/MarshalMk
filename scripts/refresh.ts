/* eslint-disable no-console */
/**
 * One command before any analysis.
 *
 *   npm run refresh        # report only, writes nothing
 *   npm run refresh apply  # sync the ledger, capture a snapshot, run the report
 *
 * Three things have to happen in order for a report to be true, and forgetting
 * one is silent rather than loud: the ledger misses recent sales, the snapshot
 * for today is never taken, and the numbers look fine while being stale.
 *
 * Order matters. The ledger is synced first so the report sees every sale; the
 * snapshot is taken second so it records the position the report describes; the
 * report runs last. A failing step stops the rest — a snapshot taken on top of a
 * half-synced ledger is worse than no snapshot, because it looks like data.
 *
 * The snapshot is the part that cannot be caught up later: turnover and GMROI
 * need average inventory over time, and a week not captured is a week gone.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const APPLY = process.argv.includes('apply');

interface Step {
  name: string;
  script: string;
  /** Extra arguments when actually writing. */
  applyArgs: string[];
  /** Pulls the one line worth showing out of a successful run. */
  summarise: (out: string) => string;
}

const STEPS: Step[] = [
  {
    name: 'Ledger',
    script: 'scripts/sync-sales-ledger.ts',
    applyArgs: ['apply'],
    summarise: (out) => {
      if (/Ledger-от е усогласен/.test(out)) return 'веќе усогласен, нема нови продажби';
      // With `apply` and nothing to do the sync prints neither message, so the
      // drift figures are what keep the wording honest in both modes.
      const settled =
        /недостасуваат во ledger:\s+0 редови[\s\S]*?вишок во ledger:\s+0 редови/.test(out);
      if (settled && !/Вметнати:/.test(out)) return 'веќе усогласен, нема нови продажби';
      const ins = /Вметнати: ([\d.,]+)/.exec(out);
      const del = /Избришани: ([\d.,]+)/.exec(out);
      const miss = /недостасуваат во ledger:\s+([\d.,]+) редови · ([\d.,]+) ден\./.exec(out);
      if (ins || del) {
        return [
          ins ? `${ins[1]} нови реда` : null,
          del && del[1] !== '0' ? `${del[1]} избришани` : null,
        ].filter(Boolean).join(' · ');
      }
      return miss ? `${miss[1]} реда (${miss[2]} ден.) чекаат запис` : 'нема промена';
    },
  },
  {
    name: 'Снимка',
    script: 'scripts/snapshot-inventory.ts',
    applyArgs: ['apply'],
    summarise: (out) => {
      const written = /Запишани (\d+) реда за ([\d-]+)/.exec(out);
      if (written) return `${written[1]} групи запишани за ${written[2]}`;
      const total = /ВКУПНО\s+(\d+)\s+(\d+)\s+([\d.,]+)\s+([\d.,]+)/.exec(out);
      return total
        ? `${total[2]} парчиња · ${total[3]} ден. набавна (не запишано)`
        : 'подготвена, не запишана';
    },
  },
  {
    name: 'Извештај',
    script: 'scripts/baseline-report.ts',
    applyArgs: [],
    summarise: (out) => {
      const saved = /Зачувано во: (\S+)/.exec(out);
      return saved ? saved[1] : 'готов';
    },
  },
];

/** Lines from the generated report that answer "how are we doing". */
const HEADLINES: Array<{ label: string; re: RegExp }> = [
  { label: 'Приход / месец', re: /\| Приход \/ месец \| ([^|]+)\|/ },
  { label: 'Бруто маржа', re: /\| Бруто маржа \| ([^|]+)\|/ },
  { label: 'Нето резултат', re: /\| \*\*Нето резултат \/ месец\*\* \| \*\*([^*]+)\*\*/ },
  { label: 'Turnover', re: /\| \*\*Inventory turnover\*\* \| \*\*([^*]+)\*\*/ },
  { label: 'Вишок капитал', re: /\| \*\*Вишок капитал\*\* \| \*\*([^*]+)\*\*/ },
];

function run(step: Step): { ok: boolean; out: string } {
  const args = ['tsx', step.script, ...(APPLY ? step.applyArgs : [])];
  const res = spawnSync('npx', args, {
    encoding: 'utf8',
    shell: true,
    // The scripts print progress; capture it so the summary stays readable and
    // the full output is only shown when something actually goes wrong.
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const out = (res.stdout ?? '') + (res.stderr ?? '');
  return { ok: res.status === 0, out };
}

function main() {
  console.log(APPLY ? 'ОСВЕЖУВАЊЕ — запишува\n' : 'ОСВЕЖУВАЊЕ — само преглед, ништо не се запишува\n');

  let reportPath: string | null = null;

  for (const step of STEPS) {
    process.stdout.write('  ' + step.name.padEnd(11));
    const { ok, out } = run(step);

    if (!ok) {
      console.log('ПАДНА\n');
      console.log(out.split('\n').filter((l) => !l.startsWith('[dotenv')).join('\n'));
      console.log('\nПрекинувам — следните чекори би работеле врз неточни податоци.');
      process.exit(1);
    }

    console.log(step.summarise(out));
    if (step.name === 'Извештај') {
      const m = /Зачувано во: (\S+)/.exec(out);
      if (m) reportPath = m[1];
    }
  }

  // Read the headline figures back out of the report rather than recomputing
  // them here — two implementations of the same number is how they drift.
  if (reportPath) {
    const full = join(process.cwd(), reportPath.replace(/\\/g, '/'));
    if (existsSync(full)) {
      const md = readFileSync(full, 'utf8');
      const found = HEADLINES
        .map((h) => ({ label: h.label, value: h.re.exec(md)?.[1]?.trim() }))
        .filter((h) => h.value);

      if (found.length > 0) {
        console.log('');
        for (const h of found) {
          console.log('  ' + h.label.padEnd(18) + h.value);
        }
      }
    }
  }

  console.log('');
  if (!APPLY) {
    console.log('Ништо не е запишано. Пушти со `apply` за да се синхронизира и снима.');
  } else {
    console.log('Готово. Снимката е земена — таа е делот што не може да се врати наназад.');
  }
}

main();
