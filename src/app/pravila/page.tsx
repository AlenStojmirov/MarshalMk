import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';
import { POLICIES } from '@/config/policies';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { LOYALTY_DEFAULTS, LoyaltySettings, fetchLoyaltySettings } from '@/lib/loyalty-settings';
import { WheelPrize, chances, fetchPrizes } from '@/lib/wheel';

/** The numbers come from the owner's settings; a change shows here within five minutes. */
export const revalidate = 300;

export const metadata: Metadata = {
  title: POLICIES.rules.title,
  description: 'Како се заработуваат и трошат поени на marshal.mk, кога истекуваат, и како работат купоните.',
  alternates: { canonical: `https://marshal.mk${POLICIES.rules.path}` },
  // Not indexed until there is an account to collect points with (13.6).
  ...(POLICIES.rules.live ? {} : { robots: { index: false, follow: false } }),
};

const n = (v: number) => v.toLocaleString('mk-MK');
const den = (v: number) => `${n(v)} ден.`;

export default async function RulesPage() {
  // Never fails the page: without the settings the agreed defaults apply.
  let s: LoyaltySettings = LOYALTY_DEFAULTS;
  let prizes: Array<WheelPrize & { chance: number }> = [];
  try {
    const sb = getSupabaseAdmin();
    s = (await fetchLoyaltySettings(sb)).settings;
    // The chances as published: every prize switched on, before any daily or monthly limit (13.10).
    if (s.wheelEnabled) prizes = chances((await fetchPrizes(sb)).data.filter((p) => p.active));
  } catch {
    // keep the defaults
  }
  const reducedRate = Math.round(s.earnRatePct * s.reducedRateSharePct) / 100;
  const bonuses = [
    s.bonusRegistration > 0 && `${n(s.bonusRegistration)} поени за регистрација`,
    s.bonusProfileComplete > 0 && `${n(s.bonusProfileComplete)} поени за целосно пополнет профил`,
    s.bonusBirthday > 0 && `${n(s.bonusBirthday)} поени за роденден`,
  ].filter(Boolean);

  return (
    <PolicyPage
      policy="rules"
      intro={
        <p>
          Поени и купони добиваш кога нарачуваш на marshal.mk <strong>најавен на својот профил</strong>.
          Важат само за нарачки на сајтот, не и за купување во продавницата.
        </p>
      }
    >
      <h2 id="zarabotka">Како заработуваш поени</h2>
      <ul>
        <li>За секоја нарачка добиваш <strong>{n(s.earnRatePct)}%</strong> од износот што навистина го плаќаш, по сите попусти, купони и поени, без доставата. Се заокружува надолу.</li>
        <li><strong>1 поен = 1 денар.</strong></li>
        <li>Производ на попуст до {n(s.discountBandPct)}% носи помалку: {n(reducedRate)}%.</li>
        <li>Производ на попуст над {n(s.discountBandPct)}% не носи поени.</li>
        {bonuses.length > 0 && <li>Бонус: {bonuses.join(', ')}. Се добиваат со првата испорачана и платена нарачка.</li>}
      </ul>

      <h2 id="aktivni">Кога може да ги користиш</h2>
      <ul>
        <li>Поените се <strong>на чекање</strong> додека нарачката не биде испорачана и платена, и уште {n(s.pendingDays)} дена потоа. Потоа се активни.</li>
        <li>Ако нарачката е откажана или одбиена, поените од неа се бришат, а поените што си ги потрошил на неа ти се враќаат.</li>
      </ul>

      <h2 id="troshenje">Како ги трошиш</h2>
      <ul>
        <li>Поените ги трошиш кога ќе собереш најмалку <strong>{n(s.minPointsToRedeem)}</strong>, на нарачка од најмалку <strong>{den(s.minOrderForRedeem)}</strong></li>
        <li>Со поени плаќаш најмногу <strong>{n(s.maxRedeemBasketPct)}%</strong> од кошничката. Остатокот секогаш се плаќа во пари.</li>
        <li>По производ: до {n(s.maxRedeemFullPricePct)}% од цената ако е по редовна цена, до {n(s.maxRedeemDiscountedPct)}% ако е на попуст до {n(s.discountBandPct)}%. Производ на попуст над {n(s.discountBandPct)}% не се плаќа со поени.</li>
        <li>Сите попусти заедно (акција, купон и поени) не ја намалуваат цената на производот за повеќе од {n(s.maxTotalDiscountPct)}% од редовната. Секој производ има и своја најниска цена.</li>
        <li>Во кошничката гледаш колку поени имаш, колку може да искористиш на таа нарачка и колку ќе заработиш.</li>
        <li>Поените не се менуваат за пари и не се пренесуваат на друг профил.</li>
      </ul>

      <h2 id="istek">Истек</h2>
      <ul>
        <li>Поените истекуваат <strong>{n(s.expiryMonths)} месеци</strong> откако ќе станат активни.</li>
        {s.wheelEnabled && <li>Поените од тркалото на среќа истекуваат за {n(s.wheelPointsExpiryDays)} дена.</li>}
        <li>Ќе те потсетиме по е-пошта {n(s.expiryNoticeFirstDays)} и {n(s.expiryNoticeSecondDays)} дена пред истекот.</li>
      </ul>

      <h2 id="kuponi">Купони</h2>
      <ul>
        <li>На една нарачка важи <strong>еден купон</strong>.</li>
        <li>Купонот се пресметува по акциската цена, а пред поените.</li>
        <li>Секој купон има свои услови: рок, најмала кошничка, понекогаш само одредени категории или производи. Ги гледаш на својот профил.</li>
        <li>Личниот купон важи само за твојот профил.</li>
        <li>Прагот за бесплатна достава се смета по попустот од купонот. Поените не ја менуваат доставата.</li>
        <li>Ако купонот не носи попуст за таа кошничка, не се троши и ти останува.</li>
        <li>Ако нарачката е откажана или одбиена, купонот повторно важи до својот рок.</li>
      </ul>

      {s.wheelEnabled && (
        <>
          <h2 id="trkalo">Тркало на среќа</h2>
          <ul>
            <li>За да вртиш, ти треба профил со потврдена е-пошта.</li>
            <li>Вртиш еднаш на {n(s.wheelIntervalDays)} дена{s.wheelBonusSpinsPerOrder > 0 ? `, и уште ${n(s.wheelBonusSpinsPerOrder)} пат по секоја испорачана нарачка` : ''}.</li>
            <li>Секое вртење добива награда. Резултатот го одредува нашиот сервер пред тркалото да тргне, не твојот уред.</li>
            <li>Купоните од тркалото важат {n(s.wheelCouponValidHours)} часа{s.wheelCouponMinBasket > 0 ? `, за кошничка од најмалку ${den(s.wheelCouponMinBasket)}` : ''}, и не се комбинираат со друг купон.</li>
            <li>Поените од тркалото важат {n(s.wheelPointsExpiryDays)} дена.</li>
            <li>Едно вртење на профил и на телефонски број во истиот период.</li>
          </ul>
          {prizes.length > 0 && (
            <>
              <p><strong>Награди и шанси:</strong></p>
              <ul>
                {prizes.map((p) => <li key={p.id}>{p.label}: {n(p.chance)}%</li>)}
              </ul>
              <p>
                Наградата што ќе го достигне својот дневен или месечен лимит привремено не е на тркалото,
                а шансите на другите награди растат сразмерно.
              </p>
            </>
          )}
        </>
      )}

      <h2 id="izmeni">Измени</h2>
      <p>Ако ги смениме правилата, се менува датумот горе. Поените што веќе ги имаш остануваат твои.</p>
    </PolicyPage>
  );
}
