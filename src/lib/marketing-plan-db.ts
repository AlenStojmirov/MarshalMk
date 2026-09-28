/**
 * Reading and writing the content calendar, `marketing_plan` (Task 10.4,
 * migration 012).
 *
 * Takes the Supabase client as an argument, like product-attributes.ts, so the
 * same calls work from the browser (admin or marketing, RLS from 012) and from
 * scripts. `original_day`, `moved_count` and who/when are the trigger's: the
 * client never sends them, and the database ignores them if it does.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { CopyKind } from './post-copy';
import type { PlanChannel, PlanDraft, PlanItem, PlanStatus } from './marketing-calendar';

export const MARKETING_PLAN = 'marketing_plan';

interface PlanRow {
  id: string;
  day: string;
  kind: CopyKind;
  product_ids: string[] | null;
  title: string | null;
  body: string | null;
  status: PlanStatus;
  channel: PlanChannel;
  note: string | null;
  post_url: string | null;
  original_day: string | null;
  moved_count: number | null;
  // Absent until migration 013 has run.
  hypothesis?: string | null;
  variant?: 'A' | 'B' | null;
  reach?: number | null;
  saves?: number | null;
  messages?: number | null;
  store_visits?: number | null;
  results_at?: string | null;
}

export interface PlanRead<T> {
  data: T;
  /** Migration 012 has not run: show the screen, say so, write nothing. */
  missingTable: boolean;
  error?: string;
}

function isMissingRelation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message ?? '');
}

function rowToItem(r: PlanRow): PlanItem {
  return {
    id: r.id,
    day: r.day,
    kind: r.kind,
    productIds: r.product_ids ?? [],
    title: r.title ?? '',
    body: r.body ?? '',
    status: r.status,
    channel: r.channel,
    note: r.note ?? '',
    postUrl: r.post_url ?? '',
    originalDay: r.original_day ?? r.day,
    movedCount: r.moved_count ?? 0,
    hypothesis: r.hypothesis ?? '',
    variant: r.variant ?? '',
    reach: r.reach ?? null,
    saves: r.saves ?? null,
    messages: r.messages ?? null,
    storeVisits: r.store_visits ?? null,
  };
}

export type PlanPatch = Partial<Pick<PlanItem,
  'day' | 'kind' | 'productIds' | 'title' | 'body' | 'status' | 'channel' | 'note' | 'postUrl' |
  'hypothesis' | 'variant' | 'reach' | 'saves' | 'messages' | 'storeVisits'>>;

const RESULT_FIELDS = ['hypothesis', 'variant', 'reach', 'saves', 'messages', 'storeVisits'] as const;

/** Does a patch touch what only exists once migration 013 has run? */
export const touchesResults = (p: PlanPatch) => RESULT_FIELDS.some((k) => p[k] !== undefined);

function patchToRow(p: PlanPatch): Partial<PlanRow> {
  const row: Partial<PlanRow> = {};
  if (p.day !== undefined) row.day = p.day;
  if (p.kind !== undefined) row.kind = p.kind;
  if (p.productIds !== undefined) row.product_ids = p.productIds;
  if (p.title !== undefined) row.title = p.title;
  if (p.body !== undefined) row.body = p.body;
  if (p.status !== undefined) row.status = p.status;
  if (p.channel !== undefined) row.channel = p.channel;
  if (p.note !== undefined) row.note = p.note;
  if (p.postUrl !== undefined) row.post_url = p.postUrl;
  if (p.hypothesis !== undefined) row.hypothesis = p.hypothesis || null;
  if (p.variant !== undefined) row.variant = p.variant || null;
  if (p.reach !== undefined) row.reach = p.reach;
  if (p.saves !== undefined) row.saves = p.saves;
  if (p.messages !== undefined) row.messages = p.messages;
  if (p.storeVisits !== undefined) row.store_visits = p.storeVisits;
  // When the numbers were read matters: Insights keep counting for days.
  if ([p.reach, p.saves, p.messages, p.storeVisits].some((v) => v !== undefined)) row.results_at = new Date().toISOString();
  return row;
}

/** Posts from `from` to `to`, both inclusive. */
export async function fetchPlan(sb: SupabaseClient, from: string, to: string): Promise<PlanRead<PlanItem[]>> {
  const { data, error } = await sb
    .from(MARKETING_PLAN)
    .select('*')
    .gte('day', from)
    .lte('day', to)
    .order('day')
    .order('created_at');
  if (error) return { data: [], missingTable: isMissingRelation(error), error: error.message };
  return { data: ((data ?? []) as PlanRow[]).map(rowToItem), missingTable: false };
}

export async function insertPlan(sb: SupabaseClient, drafts: PlanDraft[]): Promise<string | null> {
  if (!drafts.length) return null;
  const { error } = await sb.from(MARKETING_PLAN).insert(
    drafts.map((d) => ({ day: d.day, kind: d.kind, product_ids: d.productIds, title: d.title })),
  );
  return error?.message ?? null;
}

export async function updatePlan(sb: SupabaseClient, id: string, patch: PlanPatch): Promise<string | null> {
  const { error } = await sb.from(MARKETING_PLAN).update(patchToRow(patch)).eq('id', id);
  return error?.message ?? null;
}

export async function deletePlan(sb: SupabaseClient, id: string): Promise<string | null> {
  const { error } = await sb.from(MARKETING_PLAN).delete().eq('id', id);
  return error?.message ?? null;
}
