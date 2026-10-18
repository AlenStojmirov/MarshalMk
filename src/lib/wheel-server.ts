/**
 * The wheel on the server (Task 13.10). Server only.
 *
 * Reads the owner's settings, the prizes on the wheel now and what the
 * account may do, and asks the database for a spin. The database decides the
 * prize and gives it in the same transaction (`wheel_spin`, migration 018).
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import { fetchLoyaltySettings } from './loyalty-settings';
import { loyaltyMember } from './basket-server';
import { PublicPrize, SpinResult, WheelPrizeRow, WheelState, chances, rowToPrize } from './wheel';

async function availablePrizes(sb: SupabaseClient): Promise<PublicPrize[]> {
  const { data, error } = await sb.rpc('wheel_available_prizes');
  if (error) throw new Error(error.message);
  const prizes = ((data ?? []) as WheelPrizeRow[]).map(rowToPrize);
  return chances(prizes).map((p) => ({ id: p.id!, label: p.label, kind: p.kind, value: p.value, chance: p.chance }));
}

async function memberPhone(sb: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await sb.from('customers').select('phone_norm').eq('user_id', userId).maybeSingle();
  return (data as { phone_norm: string } | null)?.phone_norm ?? null;
}

export async function wheelState(sb: SupabaseClient, user: User | null): Promise<WheelState> {
  const { settings } = await fetchLoyaltySettings(sb);
  const base: WheelState = {
    enabled: settings.wheelEnabled, prizes: [], signedIn: !!user, member: false, canSpin: false, nextAt: null, bonusLeft: 0,
    intervalDays: settings.wheelIntervalDays, couponHours: settings.wheelCouponValidHours, couponMinBasket: settings.wheelCouponMinBasket,
    pointsDays: settings.wheelPointsExpiryDays,
  };
  if (!settings.wheelEnabled) return base;
  base.prizes = await availablePrizes(sb);
  const memberId = await loyaltyMember(sb, user);
  const phone = memberId ? await memberPhone(sb, memberId) : null;
  if (!memberId || !phone) return base;
  const { data, error } = await sb.rpc('wheel_status', {
    p_user: memberId, p_phone: phone, p_interval_days: settings.wheelIntervalDays, p_per_order: settings.wheelBonusSpinsPerOrder,
  });
  if (error) throw new Error(error.message);
  const s = data as { weekly_ready: boolean; next_weekly_at: string | null; bonus_left: number };
  return {
    ...base,
    member: true,
    canSpin: base.prizes.length > 0 && (s.weekly_ready || s.bonus_left > 0),
    nextAt: s.weekly_ready ? null : s.next_weekly_at,
    bonusLeft: Number(s.bonus_left) || 0,
  };
}

export type SpinRefusal = 'off' | 'member' | 'not_now' | 'no_prizes';

export async function spinWheel(sb: SupabaseClient, user: User | null): Promise<{ result?: SpinResult; refusal?: SpinRefusal }> {
  const { settings } = await fetchLoyaltySettings(sb);
  if (!settings.wheelEnabled) return { refusal: 'off' };
  const memberId = await loyaltyMember(sb, user);
  const phone = memberId ? await memberPhone(sb, memberId) : null;
  if (!memberId || !phone) return { refusal: 'member' };

  const { data, error } = await sb.rpc('wheel_spin', {
    p_user: memberId, p_phone: phone,
    p_interval_days: settings.wheelIntervalDays, p_per_order: settings.wheelBonusSpinsPerOrder,
    p_coupon_hours: settings.wheelCouponValidHours, p_coupon_min_basket: settings.wheelCouponMinBasket,
    p_points_days: settings.wheelPointsExpiryDays,
  });
  if (error) {
    const m = /wheel: (\w+)/.exec(error.message);
    if (m && (m[1] === 'not_now' || m[1] === 'no_prizes')) return { refusal: m[1] };
    throw new Error(error.message);
  }
  const r = data as { prize_id: string; label: string; prize_kind: SpinResult['kind']; value: number | string; coupon_code: string | null };
  // The wheel is drawn again with what is on it after this spin; the prize won
  // is put back in if its limit just took it off, so the animation lands on it.
  let prizes = await availablePrizes(sb);
  if (!prizes.some((p) => p.id === r.prize_id)) {
    prizes = [...prizes, { id: r.prize_id, label: r.label, kind: r.prize_kind, value: Number(r.value) || 0, chance: 0 }];
  }
  return {
    result: {
      label: r.label,
      kind: r.prize_kind,
      value: Number(r.value) || 0,
      couponCode: r.coupon_code ?? undefined,
      index: prizes.findIndex((p) => p.id === r.prize_id),
      prizes,
    },
  };
}
