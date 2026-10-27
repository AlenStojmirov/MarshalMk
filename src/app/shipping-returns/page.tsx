import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';
import { POLICIES } from '@/config/policies';
import { SHIPPING_CONFIG } from '@/config/shipping';
import {
  EXCHANGE_REPORT_HOURS, EXCHANGE_WINDOW_DAYS, STORE_ADDRESS, STORE_EMAIL, STORE_INSTAGRAM_URL, STORE_MAPS_URL, STORE_MESSENGER_URL, storeAddress,
} from '@/config/store';
import { formatPrice } from '@/lib/i18n/format';

const den = (n: number) => `${n.toLocaleString('mk-MK')} ден.`;
const denEn = (n: number) => formatPrice('en', n);

export const metadata: Metadata = {
  title: POLICIES.delivery.title,
  description: `Плаќање при достава или при подигање во продавница. Достава ${den(SHIPPING_CONFIG.shippingCost)}, бесплатна од ${den(SHIPPING_CONFIG.freeShippingThreshold)}. Замена пријавена во ${EXCHANGE_REPORT_HOURS} часа.`,
  alternates: { canonical: `https://marshal.mk${POLICIES.delivery.path}` },
};

export default function DeliveryPage() {
  // The same text in English (a translation; the Macedonian applies). Same ids, so links work in either.
  const english = (
    <>
      <h2 id="payment">Payment</h2>
      <ul>
        <li><strong>On delivery:</strong> in cash, to the courier, when you receive the parcel.</li>
        <li><strong>On store pickup:</strong> at the store, when you come for your order.</li>
      </ul>

      <h2 id="delivery">Delivery</h2>
      <ul>
        <li>Delivery costs <strong>{denEn(SHIPPING_CONFIG.shippingCost)}</strong>.</li>
        <li>For an order of <strong>{denEn(SHIPPING_CONFIG.freeShippingThreshold)}</strong> or more, delivery is <strong>free</strong>.</li>
      </ul>

      <h2 id="pickup">Store pickup</h2>
      <p>
        You can pick up your order at the store at <a href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer">{storeAddress('en')}</a>.
        There is no delivery charge then.
      </p>

      <h2 id="exchange">Exchange</h2>
      <p>If the size or the fit isn&apos;t right for you, you can exchange the item:</p>
      <ul>
        <li>Report the exchange <strong>within the first {EXCHANGE_REPORT_HOURS} hours</strong> after you receive or pick up your order. Send us the order number and what you want to exchange.</li>
        <li>Once we approve it, you send us the item by courier, <strong>no later than {EXCHANGE_WINDOW_DAYS} days</strong> after you received it.</li>
        <li>We exchange it and send it back to you.</li>
        <li><strong>You pay the cost of both shipments.</strong></li>
        <li>We don&apos;t give money back; we only exchange.</li>
      </ul>

      <h2 id="contact">Contact</h2>
      <ul>
        <li>Email: <a href={`mailto:${STORE_EMAIL}`}>{STORE_EMAIL}</a></li>
        <li>Instagram: <a href={STORE_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">@marshalonlinemk</a></li>
        <li>Message on Facebook: <a href={STORE_MESSENGER_URL} target="_blank" rel="noopener noreferrer">Messenger</a></li>
        <li>Store: {storeAddress('en')}</li>
      </ul>
    </>
  );

  return (
    <PolicyPage
      policy="delivery"
      intro={<p>На marshal.mk не плаќате однапред и не ви треба картичка: плаќате кога ќе ја добиете стоката.</p>}
      enIntro={<p>On marshal.mk you don&apos;t pay in advance and you don&apos;t need a card: you pay when you receive your goods.</p>}
      en={english}
    >
      <h2 id="payment">Плаќање</h2>
      <ul>
        <li><strong>При достава:</strong> во готово, на курирот, кога ќе ја примите пратката.</li>
        <li><strong>При подигање во продавница:</strong> во продавницата, кога ќе дојдете по нарачката.</li>
      </ul>

      <h2 id="delivery">Достава</h2>
      <ul>
        <li>Доставата чини <strong>{den(SHIPPING_CONFIG.shippingCost)}</strong></li>
        <li>За нарачка од <strong>{den(SHIPPING_CONFIG.freeShippingThreshold)}</strong> или повеќе, доставата е <strong>бесплатна</strong>.</li>
      </ul>

      <h2 id="pickup">Подигање во продавница</h2>
      <p>
        Нарачката можете да ја подигнете во продавницата на <a href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer">{STORE_ADDRESS}</a>.
        Тогаш нема трошок за достава.
      </p>

      <h2 id="exchange">Замена</h2>
      <p>Ако големината или кројот не ви одговараат, производот можете да го замените:</p>
      <ul>
        <li>Замената пријавете ја <strong>во првите {EXCHANGE_REPORT_HOURS} часа</strong> откако ќе ја примите или подигнете нарачката. Напишете ни го бројот на нарачката и што сакате да замените.</li>
        <li>Кога ќе ја одобриме, производот ни го праќате по карго, <strong>најдоцна {EXCHANGE_WINDOW_DAYS} дена</strong> од приемот.</li>
        <li>Ние го заменуваме и ви го враќаме.</li>
        <li><strong>Трошоците за двете пратки ги плаќате вие.</strong></li>
        <li>Пари не враќаме, правиме само замена.</li>
      </ul>

      <h2 id="contact">Контакт</h2>
      <ul>
        <li>Е-пошта: <a href={`mailto:${STORE_EMAIL}`}>{STORE_EMAIL}</a></li>
        <li>Instagram: <a href={STORE_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">@marshalonlinemk</a></li>
        <li>Порака на Facebook: <a href={STORE_MESSENGER_URL} target="_blank" rel="noopener noreferrer">Messenger</a></li>
        <li>Продавница: {STORE_ADDRESS}</li>
      </ul>
    </PolicyPage>
  );
}
