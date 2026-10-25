/**
 * A copy of the whole database on this computer (Task 15.4).
 *
 *   npm run backup                         # back up now
 *   npm run backup -- --decrypt <folder>   # an encrypted backup → plain files beside it
 *
 * Supabase Free keeps no backups, neither automatic nor to download, and
 * Supabase's own advice is to export regularly to somewhere else. Without this
 * a dropped table or a migration gone wrong cannot be undone.
 *
 * Only reads. Each table is paged out (1.000 rows a request) into
 * `<table>.json.gz`, the accounts into `auth-users.json.gz` (no password hashes:
 * the Admin API does not give them, so after a restore people set a new
 * password), and `manifest.json` says when, from which commit and project, how
 * many rows each file holds and their checksums. A table counts only if the rows
 * written match the database's own count, and every file is read back and
 * checked before the backup is called good.
 *
 * Where: `BACKUP_DIR` in .env.local, by default `<home>\MarshalBackups`, never
 * inside the repo — a backup holds names, phones and addresses. One folder per
 * run, named by date and time; the newest 12 good ones are kept. With
 * `BACKUP_PASSPHRASE` set (12+ characters) every data file is encrypted
 * (AES-256-GCM, key by scrypt, built-in `crypto`), so a copy can go to a drive or
 * the cloud; the manifest stays readable. Lose the passphrase and those backups
 * are lost with it.
 *
 * Every run adds a line to `backup.log` in BACKUP_DIR, so a scheduled run that
 * nobody watched still leaves its result. Exit code 1 when the backup failed.
 */

import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { gunzipSync, gzipSync } from 'node:zlib';

/**
 * Every table, in the order a restore inserts them: what a row refers to comes
 * before it (suppliers → products → costs…, coupons → their uses, points lots →
 * allocations, prizes/coupons/points → spins). `order` pages them stably.
 * A table added by a migration must be added here — until it is, every backup
 * fails and says which one is missing.
 */
const TABLES: Array<{ name: string; order: string[] }> = [
  { name: 'suppliers', order: ['id'] },
  { name: 'products', order: ['id'] },
  { name: 'product_costs', order: ['product_id'] },
  { name: 'product_attributes', order: ['product_id'] },
  { name: 'purchases', order: ['id'] },
  { name: 'purchase_lines', order: ['id'] },
  { name: 'sales_ledger', order: ['id'] },
  { name: 'orders', order: ['id'] },
  { name: 'operating_expenses', order: ['id'] },
  { name: 'inventory_snapshots', order: ['id'] },
  { name: 'marketing_optout', order: ['phone_norm'] },
  { name: 'marketing_plan', order: ['id'] },
  { name: 'loyalty_settings', order: ['id'] },
  { name: 'store_settings', order: ['id'] },
  { name: 'customers', order: ['user_id'] },
  { name: 'customer_consents', order: ['id'] },
  { name: 'coupons', order: ['id'] },
  { name: 'coupon_redemptions', order: ['id'] },
  { name: 'points_ledger', order: ['id'] },
  { name: 'points_allocations', order: ['debit_id', 'lot_id'] },
  { name: 'wheel_prizes', order: ['id'] },
  { name: 'wheel_spins', order: ['id'] },
  { name: 'customer_notifications', order: ['id'] },
];

/** Views over the tables above: their rows are already in the backup. */
const VIEWS = ['products_public', 'products_costed'];

const PAGE = 1000;
const KEEP = 12;
const MIN_PASSPHRASE = 12;
const FOLDER = /^\d{4}-\d{2}-\d{2}_\d{6}$/;
const MAGIC = Buffer.from('MBK1');

// ---------------------------------------------------------------------------
// Files: gzip, and AES-256-GCM when there is a passphrase
// ---------------------------------------------------------------------------

/** Header: MBK1 · salt (16) · iv (12) · tag (16), then the ciphertext. */
const keyFor = (passphrase: string, salt: Buffer) =>
  scryptSync(passphrase, salt, 32, { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

function encrypt(data: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFor(passphrase, salt), iv);
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([MAGIC, salt, iv, cipher.getAuthTag(), body]);
}

function decrypt(file: Buffer, passphrase: string): Buffer {
  if (!file.subarray(0, 4).equals(MAGIC)) throw new Error('не е шифрирана датотека од бекап');
  const salt = file.subarray(4, 20);
  const iv = file.subarray(20, 32);
  const tag = file.subarray(32, 48);
  const decipher = createDecipheriv('aes-256-gcm', keyFor(passphrase, salt), iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(file.subarray(48)), decipher.final()]);
  } catch {
    throw new Error('погрешна лозинка или оштетена датотека');
  }
}

const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex');

/** Write rows as JSON (gzip, maybe encrypted); returns the file name and what the manifest records. */
function writeRows(dir: string, base: string, rows: unknown[], passphrase: string | null) {
  const json = Buffer.from(JSON.stringify(rows));
  const gz = gzipSync(json, { level: 9 });
  const file = passphrase ? `${base}.json.gz.enc` : `${base}.json.gz`;
  const out = passphrase ? encrypt(gz, passphrase) : gz;
  writeFileSync(join(dir, file), out);
  return { file, rows: rows.length, bytes: out.length, sha256: sha256(json) };
}

/** Read a file back the way a restore would; returns its rows. */
function readRows(path: string, passphrase: string | null): { rows: unknown[]; sha256: string } {
  let data: Buffer = readFileSync(path);
  if (path.endsWith('.enc')) {
    if (!passphrase) throw new Error('шифрирана е, а BACKUP_PASSPHRASE не е поставена');
    data = decrypt(data, passphrase);
  }
  const json = gunzipSync(data);
  const rows = JSON.parse(json.toString('utf8'));
  if (!Array.isArray(rows)) throw new Error('не е листа од редови');
  return { rows, sha256: sha256(json) };
}

// ---------------------------------------------------------------------------
// Reading the database
// ---------------------------------------------------------------------------

async function readTable(sb: SupabaseClient, name: string, order: string[]) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = sb.from(name).select('*');
    for (const col of order) q = q.order(col, { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  const { count, error } = await sb.from(name).select('*', { count: 'exact', head: true });
  if (error) throw new Error(error.message);
  return { rows, count: count ?? 0 };
}

/** The accounts, without anything secret: no password hash, no tokens. */
async function readUsers(sb: SupabaseClient) {
  const users: unknown[] = [];
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: PAGE });
    if (error) throw new Error(error.message);
    for (const u of data.users) {
      users.push({
        id: u.id,
        email: u.email ?? null,
        phone: u.phone || null,
        role: u.app_metadata?.role ?? null,
        providers: u.app_metadata?.providers ?? [],
        user_metadata: u.user_metadata ?? {},
        created_at: u.created_at,
        email_confirmed_at: u.email_confirmed_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      });
    }
    if (data.users.length < PAGE) break;
  }
  return users;
}

/** Tables and views PostgREST serves — to notice one this script does not know yet. */
async function servedRelations(url: string, key: string): Promise<string[]> {
  const res = await fetch(`${url}/rest/v1/`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`списокот на табели: ${res.status}`);
  const spec = (await res.json()) as { paths?: Record<string, unknown> };
  return Object.keys(spec.paths ?? {}).filter((p) => p !== '/' && !p.startsWith('/rpc/')).map((p) => p.slice(1));
}

// ---------------------------------------------------------------------------
// Folders
// ---------------------------------------------------------------------------

function backupRoot(): string {
  const dir = resolve(process.env.BACKUP_DIR?.trim() || join(homedir(), 'MarshalBackups'));
  const rel = relative(process.cwd(), dir);
  if (!rel.startsWith('..') && !isAbsolute(rel)) {
    throw new Error(`BACKUP_DIR (${dir}) е во repo-то. Бекапот има лични податоци и не смее да заврши во git. Избери папка надвор.`);
  }
  return dir;
}

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function manifestOf(dir: string): { ok?: boolean } | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** Keep the newest good backups; drop failed or unfinished runs older than the newest good one. */
function prune(root: string): string[] {
  const names = readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  const good = names.filter((n) => FOLDER.test(n) && manifestOf(join(root, n))?.ok === true).sort().reverse();
  const newest = good[0];
  const stale = names.filter((n) => {
    const m = /^(\d{4}-\d{2}-\d{2}_\d{6})(-failed|\.partial)$/.exec(n);
    return m && newest && m[1] < newest;
  });
  const drop = [...good.slice(KEEP), ...stale];
  for (const n of drop) rmSync(join(root, n), { recursive: true, force: true });
  return drop;
}

function gitCommit(): string | null {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

const kb = (n: number) => `${Math.max(1, Math.round(n / 1024))} KB`;

// ---------------------------------------------------------------------------
// npm run backup
// ---------------------------------------------------------------------------

async function backup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Нема NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY во .env.local');
  const passphrase = process.env.BACKUP_PASSPHRASE || null;
  if (passphrase && passphrase.length < MIN_PASSPHRASE) {
    throw new Error(`BACKUP_PASSPHRASE е пократка од ${MIN_PASSPHRASE} знаци.`);
  }

  const root = backupRoot();
  const name = stamp();
  const work = join(root, `${name}.partial`);
  mkdirSync(work, { recursive: true });
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const problems: string[] = [];
  const tables: Record<string, { file: string; rows: number; count: number; bytes: number; sha256: string }> = {};

  console.log(`БЕКАП → ${join(root, name)}${passphrase ? ' (шифриран)' : ''}`);

  const served = await servedRelations(url, key);
  const known = new Set([...TABLES.map((t) => t.name), ...VIEWS]);
  for (const r of served.filter((r) => !known.has(r)).sort()) {
    problems.push(`табелата ${r} ја нема во списокот во scripts/backup.ts — не е во бекапот`);
  }

  for (const t of TABLES) {
    try {
      const { rows, count } = await readTable(sb, t.name, t.order);
      const w = writeRows(work, t.name, rows, passphrase);
      tables[t.name] = { ...w, count };
      const same = rows.length === count;
      if (!same) problems.push(`${t.name}: запишани ${rows.length}, а базата брои ${count}`);
      console.log(`  ${same ? '✓' : '✗'} ${t.name.padEnd(24)} ${String(rows.length).padStart(6)}  ${kb(w.bytes)}`);
    } catch (err) {
      problems.push(`${t.name}: ${(err as Error).message}`);
      console.log(`  ✗ ${t.name.padEnd(24)} ${(err as Error).message}`);
    }
  }

  let authUsers: { file: string; rows: number; bytes: number; sha256: string } | null = null;
  try {
    authUsers = writeRows(work, 'auth-users', await readUsers(sb), passphrase);
    console.log(`  ✓ ${'auth-users'.padEnd(24)} ${String(authUsers.rows).padStart(6)}  ${kb(authUsers.bytes)}`);
  } catch (err) {
    problems.push(`auth-users: ${(err as Error).message}`);
  }

  // Read every file back the way a restore would.
  for (const f of [...Object.values(tables), ...(authUsers ? [authUsers] : [])]) {
    try {
      const back = readRows(join(work, f.file), passphrase);
      if (back.rows.length !== f.rows || back.sha256 !== f.sha256) problems.push(`${f.file}: при повторно читање не е исто`);
    } catch (err) {
      problems.push(`${f.file}: ${(err as Error).message}`);
    }
  }

  const ok = problems.length === 0;
  const totalRows = Object.values(tables).reduce((s, t) => s + t.rows, 0) + (authUsers?.rows ?? 0);
  const totalBytes = Object.values(tables).reduce((s, t) => s + t.bytes, 0) + (authUsers?.bytes ?? 0);
  const manifest = {
    format: 1,
    ok,
    problems,
    createdAt: new Date().toISOString(),
    project: new URL(url).hostname.split('.')[0],
    commit: gitCommit(),
    migrations: readdirSync('supabase/migrations').filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort(),
    encrypted: !!passphrase,
    restoreOrder: TABLES.map((t) => t.name),
    tables,
    authUsers,
    totalRows,
    totalBytes,
  };
  writeFileSync(join(work, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const final = join(root, ok ? name : `${name}-failed`);
  renameSync(work, final);
  const dropped = ok ? prune(root) : [];

  const line = `${manifest.createdAt} ${ok ? 'OK' : 'НЕУСПЕШЕН'} ${name} ${totalRows} редови ${kb(totalBytes)}${passphrase ? ' шифриран' : ''}${ok ? '' : ' — ' + problems.join('; ')}`;
  appendFileSync(join(root, 'backup.log'), line + '\n');

  console.log('');
  if (ok) {
    console.log(`✓ Бекапот е готов: ${totalRows} редови, ${kb(totalBytes)}. ${final}`);
    if (dropped.length) console.log(`  Избришани стари: ${dropped.join(', ')}`);
    if (!passphrase) console.log('  Не е шифриран: копија надвор од овој компјутер само со BACKUP_PASSPHRASE.');
  } else {
    console.log(`✗ Бекапот НЕ е добар (${final}):`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exitCode = 1;
  }
}

// ---------------------------------------------------------------------------
// npm run backup -- --decrypt <folder>
// ---------------------------------------------------------------------------

function decryptFolder(folder: string) {
  const passphrase = process.env.BACKUP_PASSPHRASE;
  if (!passphrase) throw new Error('За дешифрирање треба BACKUP_PASSPHRASE во .env.local.');
  const src = resolve(folder);
  const manifest = JSON.parse(readFileSync(join(src, 'manifest.json'), 'utf8'));
  const out = `${src}-decrypted`;
  if (existsSync(out)) throw new Error(`${out} веќе постои.`);
  const files = [...Object.values(manifest.tables ?? {}), ...(manifest.authUsers ? [manifest.authUsers] : [])] as Array<{ file: string; sha256: string }>;
  // Everything decrypted and checked first, so a wrong passphrase leaves no folder behind.
  const plain = files.map((f) => {
    const gz = decrypt(readFileSync(join(src, f.file)), passphrase);
    if (sha256(gunzipSync(gz)) !== f.sha256) throw new Error(`${f.file}: не се совпаѓа со manifest.json`);
    return { name: f.file.replace(/\.enc$/, ''), gz };
  });
  mkdirSync(out);
  for (const p of plain) writeFileSync(join(out, p.name), p.gz);
  copyFileSync(join(src, 'manifest.json'), join(out, 'manifest.json'));
  console.log(`✓ ${files.length} датотеки дешифрирани и проверени → ${out}`);
  console.log('  Внимание: оваа папка има лични податоци, нешифрирани. Избриши ја кога ќе завршиш.');
}

const args = process.argv.slice(2);
const decrypting = args[0] === '--decrypt';
const run = decrypting
  ? Promise.resolve().then(() => {
      if (!args[1]) throw new Error('Која папка? npm run backup -- --decrypt <папка>');
      decryptFolder(args[1]);
    })
  : backup();

run.catch((err) => {
  console.error(`✗ ${(err as Error).message}`);
  if (!decrypting) {
    try {
      appendFileSync(join(backupRoot(), 'backup.log'), `${new Date().toISOString()} НЕУСПЕШЕН ${(err as Error).message}\n`);
    } catch {
      // No folder to log into; the message above is all there is.
    }
  }
  process.exit(1);
});
