import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { ROLES, Role, roleOf } from '@/lib/roles';

/**
 * Back-office accounts (Task 8.7). Admin only.
 *
 * Creating a user and setting a role need the service-role key, which never
 * leaves the server — so the admin screen calls this route with its own access
 * token, and the route checks that token belongs to an admin before touching
 * anything. The role is read from the server's copy of the user, not from the
 * token's claims, so a role taken away applies at once.
 *
 *   GET    list accounts
 *   POST   { email, password, role }        create one (no confirmation mail)
 *   PATCH  { id, role?, password? }          change role ('none' = no access) or password
 */

const MIN_PASSWORD = 8;
type Wanted = Role | 'none';

function isWanted(v: unknown): v is Wanted {
  return v === 'none' || (typeof v === 'string' && (ROLES as readonly string[]).includes(v));
}

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

async function requireAdmin(req: NextRequest): Promise<{ me: User } | { res: NextResponse }> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return { res: fail(401, 'Не си најавен.') };
  const { data, error } = await getSupabaseAdmin().auth.getUser(token);
  if (error || !data.user) return { res: fail(401, 'Најавата е истечена. Најави се повторно.') };
  if (roleOf(data.user) !== 'admin') return { res: fail(403, 'Само за админ.') };
  return { me: data.user };
}

async function allUsers(): Promise<User[]> {
  const { data, error } = await getSupabaseAdmin().auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  return data.users;
}

function view(u: User) {
  return {
    id: u.id,
    email: u.email ?? '',
    role: roleOf(u),
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('res' in auth) return auth.res;
  try {
    const users = await allUsers();
    return NextResponse.json({ users: users.map(view), me: auth.me.id });
  } catch (err) {
    return fail(500, (err as Error).message);
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('res' in auth) return auth.res;

  let body: { email?: unknown; password?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Неисправно барање.');
  }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail(400, 'Внеси исправна е-пошта.');
  if (password.length < MIN_PASSWORD) return fail(400, `Лозинката мора да има барем ${MIN_PASSWORD} знаци.`);
  if (body.role !== 'staff' && body.role !== 'admin') return fail(400, 'Улогата е магацин или админ.');

  const { data, error } = await getSupabaseAdmin().auth.admin.createUser({
    email,
    password,
    // The owner hands the password over in person; no confirmation mail.
    email_confirm: true,
    app_metadata: { role: body.role },
  });
  if (error) {
    const taken = /already|registered|exists/i.test(error.message);
    return fail(taken ? 409 : 500, taken ? 'Веќе постои профил со оваа е-пошта.' : error.message);
  }
  return NextResponse.json({ user: view(data.user) });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireAdmin(req);
  if ('res' in auth) return auth.res;

  let body: { id?: unknown; role?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Неисправно барање.');
  }
  if (typeof body.id !== 'string' || !body.id) return fail(400, 'Нема корисник.');
  const hasRole = body.role !== undefined;
  const hasPassword = body.password !== undefined;
  if (!hasRole && !hasPassword) return fail(400, 'Нема што да се смени.');
  if (hasRole && !isWanted(body.role)) return fail(400, 'Непозната улога.');
  if (hasPassword && (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD)) {
    return fail(400, `Лозинката мора да има барем ${MIN_PASSWORD} знаци.`);
  }

  try {
    const users = await allUsers();
    const target = users.find((u) => u.id === body.id);
    if (!target) return fail(404, 'Нема таков корисник.');

    const update: { app_metadata?: Record<string, unknown>; password?: string } = {};
    if (hasRole) {
      const wanted = body.role as Wanted;
      // Changing your own role is how the shop ends up with no admin.
      if (target.id === auth.me.id) return fail(400, 'Не можеш да си ја смениш сопствената улога.');
      if (roleOf(target) === 'admin' && wanted !== 'admin') {
        const admins = users.filter((u) => roleOf(u) === 'admin');
        if (admins.length <= 1) return fail(400, 'Ова е единствениот админ.');
      }
      update.app_metadata = { ...target.app_metadata, role: wanted === 'none' ? null : wanted };
    }
    if (hasPassword) update.password = body.password as string;

    const { data, error } = await getSupabaseAdmin().auth.admin.updateUserById(target.id, update);
    if (error) return fail(500, error.message);
    return NextResponse.json({ user: view(data.user) });
  } catch (err) {
    return fail(500, (err as Error).message);
  }
}
