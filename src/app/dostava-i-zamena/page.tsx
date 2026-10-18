import type { Metadata } from 'next';
import PolicyPage from '@/components/PolicyPage';
import { POLICIES } from '@/config/policies';
import { SHIPPING_CONFIG } from '@/config/shipping';
import {
  EXCHANGE_REPORT_HOURS, EXCHANGE_WINDOW_DAYS, STORE_ADDRESS, STORE_EMAIL, STORE_INSTAGRAM_URL, STORE_MAPS_URL, STORE_MESSENGER_URL,
} from '@/config/store';

const den = (n: number) => `${n.toLocaleString('mk-MK')} ден.`;

export const metadata: Metadata = {
  title: POLICIES.delivery.title,
  description: `Плаќање при достава или при подигање во продавница. Достава ${den(SHIPPING_CONFIG.shippingCost)}, бесплатна од ${den(SHIPPING_CONFIG.freeShippingThreshold)}. Замена пријавена во ${EXCHANGE_REPORT_HOURS} часа.`,
  alternates: { canonical: `https://marshal.mk${POLICIES.delivery.path}` },
};

export default function DeliveryPage() {
  return (
    <PolicyPage
      policy="delivery"
      intro={<p>На marshal.mk не плаќаш однапред и не ти треба картичка: плаќаш кога ќе ја добиеш стоката.</p>}
    >
      <h2 id="plakjanje">Плаќање</h2>
      <ul>
        <li><strong>При достава:</strong> во готово, на курирот, кога ќе ја примиш пратката.</li>
        <li><strong>При подигање во продавница:</strong> во продавницата, кога ќе дојдеш по нарачката.</li>
      </ul>

      <h2 id="dostava">Достава</h2>
      <ul>
        <li>Доставата чини <strong>{den(SHIPPING_CONFIG.shippingCost)}</strong></li>
        <li>За нарачка од <strong>{den(SHIPPING_CONFIG.freeShippingThreshold)}</strong> или повеќе, доставата е <strong>бесплатна</strong>.</li>
      </ul>

      <h2 id="podiganje">Подигање во продавница</h2>
      <p>
        Нарачката може да ја подигнеш во продавницата на <a href={STORE_MAPS_URL} target="_blank" rel="noopener noreferrer">{STORE_ADDRESS}</a>.
        Тогаш нема трошок за достава.
      </p>

      <h2 id="zamena">Замена</h2>
      <p>Ако големината или кројот не ти одговараат, производот може да го замениш:</p>
      <ul>
        <li>Замената пријави ја <strong>во првите {EXCHANGE_REPORT_HOURS} часа</strong> откако ќе ја примиш или подигнеш нарачката. Напиши ни го бројот на нарачката и што сакаш да замениш.</li>
        <li>Кога ќе ја одобриме, производот ни го праќаш по карго, <strong>најдоцна {EXCHANGE_WINDOW_DAYS} дена</strong> од приемот.</li>
        <li>Ние го заменуваме и ти го враќаме.</li>
        <li><strong>Трошоците за двете пратки ги плаќаш ти.</strong></li>
        <li>Пари не враќаме, правиме само замена.</li>
      </ul>

      <h2 id="kontakt">Контакт</h2>
      <ul>
        <li>Е-пошта: <a href={`mailto:${STORE_EMAIL}`}>{STORE_EMAIL}</a></li>
        <li>Instagram: <a href={STORE_INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">@marshalonlinemk</a></li>
        <li>Порака на Facebook: <a href={STORE_MESSENGER_URL} target="_blank" rel="noopener noreferrer">Messenger</a></li>
        <li>Продавница: {STORE_ADDRESS}</li>
      </ul>
    </PolicyPage>
  );
}
