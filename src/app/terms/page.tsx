import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';
import { POLICIES } from '@/config/policies';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { LOYALTY_DEFAULTS, LoyaltySettings, fetchLoyaltySettings } from '@/lib/loyalty-settings';
import { WheelPrize, chances, fetchPrizes } from '@/lib/wheel';
import { formatNumber, formatPrice } from '@/lib/i18n/format';

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

// The English: decimals as toLocaleString keeps them (up to three), "1,500 MKD", and "1 day" / "14 days".
const nEn = (v: number) => formatNumber('en', v, 3);
const denEn = (v: number) => formatPrice('en', v);
const countEn = (v: number, one: string, many: string) => `${nEn(v)} ${v === 1 ? one : many}`;

/** A prize's name in English, from what it gives; the owner's own label is Macedonian. */
const prizeEn = (p: WheelPrize) =>
  p.kind === 'points' ? countEn(p.value, 'point', 'points') : p.kind === 'percent' ? `${nEn(p.value)}% off` : 'Free delivery';

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

  // The same text in English (a translation; the Macedonian applies). Same ids, so links work in either.
  const bonusesEn = [
    s.bonusRegistration > 0 && `${countEn(s.bonusRegistration, 'point', 'points')} for signing up`,
    s.bonusProfileComplete > 0 && `${countEn(s.bonusProfileComplete, 'point', 'points')} for completing your account details`,
    s.bonusBirthday > 0 && `${countEn(s.bonusBirthday, 'point', 'points')} for your birthday`,
  ].filter(Boolean);
  const english = (
    <>
      <h2 id="earning">How you earn points</h2>
      <ul>
        <li>For every order you get <strong>{nEn(s.earnRatePct)}%</strong> of the amount you actually pay, after all discounts, coupons and points, not counting delivery. It is rounded down.</li>
        <li><strong>1 point = 1 denar.</strong></li>
        <li>An item discounted by up to {nEn(s.discountBandPct)}% earns less: {nEn(reducedRate)}%.</li>
        <li>An item discounted by more than {nEn(s.discountBandPct)}% earns no points.</li>
        {bonusesEn.length > 0 && <li>Bonus: {bonusesEn.join(', ')}. You get them with your first delivered and paid order.</li>}
      </ul>

      <h2 id="active">When you can use them</h2>
      <ul>
        <li>Points are <strong>pending</strong> until the order is delivered and paid for, and for another {countEn(s.pendingDays, 'day', 'days')} after that. Then they become active.</li>
        <li>If the order is cancelled or refused, the points from it are removed, and the points you spent on it are given back to you.</li>
      </ul>

      <h2 id="spending">How you spend them</h2>
      <ul>
        <li>You can spend points once you have at least <strong>{nEn(s.minPointsToRedeem)}</strong>, on an order of at least <strong>{denEn(s.minOrderForRedeem)}</strong>.</li>
        <li>With points you pay at most <strong>{nEn(s.maxRedeemBasketPct)}%</strong> of the cart. The rest is always paid in money.</li>
        <li>Per item: up to {nEn(s.maxRedeemFullPricePct)}% of the price if it is at the regular price, up to {nEn(s.maxRedeemDiscountedPct)}% if it is discounted by up to {nEn(s.discountBandPct)}%. An item discounted by more than {nEn(s.discountBandPct)}% cannot be paid for with points.</li>
        <li>All discounts together (sale, coupon and points) never lower an item&apos;s price by more than {nEn(s.maxTotalDiscountPct)}% of the regular price. Each item also has its own lowest price.</li>
        <li>In the cart you can see how many points you have, how many you can use on that order and how many you will earn.</li>
        <li>Points cannot be exchanged for money and cannot be transferred to another account.</li>
      </ul>

      <h2 id="expiry">Expiry</h2>
      <ul>
        <li>Points expire <strong>{countEn(s.expiryMonths, 'month', 'months')}</strong> after they become active.</li>
        {s.wheelEnabled && <li>Points from the Wheel of Fortune expire after {countEn(s.wheelPointsExpiryDays, 'day', 'days')}.</li>}
        <li>We will remind you by email {nEn(s.expiryNoticeFirstDays)} and {nEn(s.expiryNoticeSecondDays)} days before they expire.</li>
      </ul>

      <h2 id="coupons">Coupons</h2>
      <ul>
        <li>You can use <strong>one coupon</strong> per order.</li>
        <li>The coupon is calculated on the sale price, and before points.</li>
        <li>Each coupon has its own conditions: an expiry date, a minimum cart, sometimes only certain categories or products. You can see them in your account.</li>
        <li>A personal coupon is valid only for your account.</li>
        <li>The threshold for free delivery is counted after the coupon discount. Points do not change the delivery.</li>
        <li>If the coupon gives no discount on that cart, it is not used up and you keep it.</li>
        <li>If the order is cancelled or refused, the coupon is valid again until its expiry date.</li>
      </ul>

      {s.wheelEnabled && (
        <>
          <h2 id="wheel">Wheel of Fortune</h2>
          <ul>
            <li>To spin, you need an account with a confirmed email address.</li>
            <li>You spin {s.wheelIntervalDays === 1 ? 'once a day' : `once every ${nEn(s.wheelIntervalDays)} days`}{s.wheelBonusSpinsPerOrder > 0 ? `, plus ${countEn(s.wheelBonusSpinsPerOrder, 'extra spin', 'extra spins')} after each delivered order` : ''}.</li>
            <li>Every spin wins a prize. The result is decided by our server before the wheel starts turning, not by your device.</li>
            <li>Coupons from the wheel are valid for {countEn(s.wheelCouponValidHours, 'hour', 'hours')}{s.wheelCouponMinBasket > 0 ? `, on a cart of at least ${denEn(s.wheelCouponMinBasket)}` : ''}, and cannot be combined with another coupon.</li>
            <li>Points from the wheel are valid for {countEn(s.wheelPointsExpiryDays, 'day', 'days')}.</li>
            <li>One spin per account and per phone number in the same period.</li>
          </ul>
          {prizes.length > 0 && (
            <>
              <p><strong>Prizes and chances:</strong></p>
              <ul>
                {prizes.map((p) => <li key={p.id}>{prizeEn(p)}: {formatNumber('en', p.chance, 1)}%</li>)}
              </ul>
              <p>
                A prize that reaches its daily or monthly limit is temporarily off the wheel,
                and the chances of the other prizes go up in proportion.
              </p>
            </>
          )}
        </>
      )}

      <h2 id="changes">Changes</h2>
      <p>If we change the rules, the date at the top changes. The points you already have stay yours.</p>
    </>
  );

  return (
    <PolicyPage
      policy="rules"
      intro={
        <p>
          Поени и купони добивате кога нарачувате на marshal.mk <strong>најавени на својот профил</strong>.
          Важат само за нарачки на сајтот, не и за купување во продавницата.
        </p>
      }
      enIntro={
        <p>
          You get points and coupons when you order on marshal.mk <strong>signed in to your account</strong>.
          They apply only to orders on the website, not to purchases in the store.
        </p>
      }
      en={english}
    >
      <h2 id="earning">Како заработувате поени</h2>
      <ul>
        <li>За секоја нарачка добивате <strong>{n(s.earnRatePct)}%</strong> од износот што навистина го плаќате, по сите попусти, купони и поени, без доставата. Се заокружува надолу.</li>
        <li><strong>1 поен = 1 денар.</strong></li>
        <li>Производ на попуст до {n(s.discountBandPct)}% носи помалку: {n(reducedRate)}%.</li>
        <li>Производ на попуст над {n(s.discountBandPct)}% не носи поени.</li>
        {bonuses.length > 0 && <li>Бонус: {bonuses.join(', ')}. Се добиваат со првата испорачана и платена нарачка.</li>}
      </ul>

      <h2 id="active">Кога можете да ги користите</h2>
      <ul>
        <li>Поените се <strong>на чекање</strong> додека нарачката не биде испорачана и платена, и уште {n(s.pendingDays)} дена потоа. Потоа се активни.</li>
        <li>Ако нарачката е откажана или одбиена, поените од неа се бришат, а поените што сте ги потрошиле на неа ви се враќаат.</li>
      </ul>

      <h2 id="spending">Како ги трошите</h2>
      <ul>
        <li>Поените ги трошите кога ќе соберете најмалку <strong>{n(s.minPointsToRedeem)}</strong>, на нарачка од најмалку <strong>{den(s.minOrderForRedeem)}</strong></li>
        <li>Со поени плаќате најмногу <strong>{n(s.maxRedeemBasketPct)}%</strong> од кошничката. Остатокот секогаш се плаќа во пари.</li>
        <li>По производ: до {n(s.maxRedeemFullPricePct)}% од цената ако е по редовна цена, до {n(s.maxRedeemDiscountedPct)}% ако е на попуст до {n(s.discountBandPct)}%. Производ на попуст над {n(s.discountBandPct)}% не се плаќа со поени.</li>
        <li>Сите попусти заедно (акција, купон и поени) не ја намалуваат цената на производот за повеќе од {n(s.maxTotalDiscountPct)}% од редовната. Секој производ има и своја најниска цена.</li>
        <li>Во кошничката гледате колку поени имате, колку можете да искористите на таа нарачка и колку ќе заработите.</li>
        <li>Поените не се менуваат за пари и не се пренесуваат на друг профил.</li>
      </ul>

      <h2 id="expiry">Истек</h2>
      <ul>
        <li>Поените истекуваат <strong>{n(s.expiryMonths)} месеци</strong> откако ќе станат активни.</li>
        {s.wheelEnabled && <li>Поените од тркалото на среќа истекуваат за {n(s.wheelPointsExpiryDays)} дена.</li>}
        <li>Ќе ве потсетиме по е-пошта {n(s.expiryNoticeFirstDays)} и {n(s.expiryNoticeSecondDays)} дена пред истекот.</li>
      </ul>

      <h2 id="coupons">Купони</h2>
      <ul>
        <li>На една нарачка важи <strong>еден купон</strong>.</li>
        <li>Купонот се пресметува по акциската цена, а пред поените.</li>
        <li>Секој купон има свои услови: рок, најмала кошничка, понекогаш само одредени категории или производи. Ги гледате на својот профил.</li>
        <li>Личниот купон важи само за вашиот профил.</li>
        <li>Прагот за бесплатна достава се смета по попустот од купонот. Поените не ја менуваат доставата.</li>
        <li>Ако купонот не носи попуст за таа кошничка, не се троши и ви останува.</li>
        <li>Ако нарачката е откажана или одбиена, купонот повторно важи до својот рок.</li>
      </ul>

      {s.wheelEnabled && (
        <>
          <h2 id="wheel">Тркало на среќа</h2>
          <ul>
            <li>За да вртите, ви треба профил со потврдена е-пошта.</li>
            <li>Вртите еднаш на {n(s.wheelIntervalDays)} дена{s.wheelBonusSpinsPerOrder > 0 ? `, и уште ${n(s.wheelBonusSpinsPerOrder)} пат по секоја испорачана нарачка` : ''}.</li>
            <li>Секое вртење добива награда. Резултатот го одредува нашиот сервер пред тркалото да тргне, не вашиот уред.</li>
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

      <h2 id="changes">Измени</h2>
      <p>Ако ги смениме правилата, се менува датумот горе. Поените што веќе ги имате остануваат ваши.</p>
    </PolicyPage>
  );
}
