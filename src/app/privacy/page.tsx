import type { Metadata } from 'next';
import Link from 'next/link';
import PolicyPage from '@/components/PolicyPage';
import { POLICIES } from '@/config/policies';
import { STORE_ADDRESS, STORE_EMAIL, STORE_NAME, storeAddress, storeName } from '@/config/store';

export const metadata: Metadata = {
  title: POLICIES.privacy.title,
  description: 'Кои лични податоци собира Маршал, зошто, колку долго ги чува и какви права имаш.',
  alternates: { canonical: `https://marshal.mk${POLICIES.privacy.path}` },
};

export default function PrivacyPage() {
  // The same text in English (a translation; the Macedonian applies).
  const english = (
    <>
      <h2>Who processes the data</h2>
      <p>
        {storeName('en')}, {storeAddress('en')}. Email: <a href={`mailto:${STORE_EMAIL}`}>{STORE_EMAIL}</a>.
      </p>

      <h2>What data we collect</h2>
      <ul>
        <li><strong>When you order:</strong> first and last name, email, phone, address and city for delivery, the note you write and, if you answer, how you heard about us.</li>
        <li><strong>If you open an account:</strong> email and password and, if you enter them, name, phone, delivery address and date of birth. The password is stored only in encrypted form, and we cannot read it. We also keep your consents, with the date you gave them.</li>
        <li><strong>Points and coupons:</strong> the points you have earned, spent and that have expired, the coupons you have, and the order you used them on.</li>
        <li><strong>In your browser:</strong> your cart, your language and the link you came from (for up to 30 days) are kept only on your device, not with us. For visits we use anonymous statistics (Vercel Analytics), with no tracking cookies and no advertising pixels.</li>
        <li><strong>To protect against abuse:</strong> your IP address is used temporarily when you order, to prevent fake and mass orders.</li>
      </ul>

      <h2>Why we use it</h2>
      <ul>
        <li>to deliver your order, collect payment for it and contact you about it;</li>
        <li>for your account, your points and your coupons;</li>
        <li>for offers and news by email, <strong>only if you have agreed to it</strong>;</li>
        <li>for accounting, as far as the law requires;</li>
        <li>to protect the store from fake orders.</li>
      </ul>

      <h2>How long we keep it</h2>
      <ul>
        <li><strong>Orders and accounting records:</strong> as long as the accounting regulations require.</li>
        <li>
          <strong>Your account and points:</strong> as long as you have the account. Points expire according to{' '}
          {POLICIES.rules.live ? <Link href={POLICIES.rules.path}>the points rules</Link> : 'the points rules'}.
        </li>
        <li><strong>Your consent to offers:</strong> until you withdraw it.</li>
      </ul>

      <h2>Who sees it</h2>
      <ul>
        <li>The store&apos;s staff, as far as they need it for your order.</li>
        <li>The courier service: name, address and phone, so they can deliver the parcel.</li>
        <li>The services the website runs on: the database and sign-in (Supabase), the website&apos;s hosting and the email service. They process the data only on our behalf.</li>
      </ul>
      <p><strong>We do not sell your data and do not give it to others for advertising.</strong></p>

      <h2>Your rights</h2>
      <p>You can ask:</p>
      <ul>
        <li>to see what data we hold about you;</li>
        <li>for it to be corrected or deleted;</li>
        <li>for it not to be used for offers;</li>
        <li>to receive it in a form you can take somewhere else.</li>
      </ul>
      <p>
        You can withdraw your consent to offers at any time. That does not change your orders.
        Send your request to <a href={`mailto:${STORE_EMAIL}`}>{STORE_EMAIL}</a>. If you think we are not handling
        your data properly, you can file a complaint with the Personal Data Protection Agency.
      </p>

      <h2>Deleting your account</h2>
      <p>
        Write to us from your account&apos;s email address and we will delete it. Your points and personal coupons are deleted with it.
        Orders stay in the accounting records for as long as the law requires.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy, the date at the top changes. We will let you know about any major change.</p>
    </>
  );

  return (
    <PolicyPage
      policy="privacy"
      intro={<p>Тука пишува кои лични податоци ги собира {STORE_NAME} (marshal.mk), зошто ги собира, колку долго ги чува и какви права имаш.</p>}
      enIntro={<p>This page explains what personal data {storeName('en')} (marshal.mk) collects, why it collects it, how long it keeps it and what rights you have.</p>}
      en={english}
    >
      <h2>Кој ги обработува податоците</h2>
      <p>
        {STORE_NAME}, {STORE_ADDRESS}. Е-пошта: <a href={`mailto:${STORE_EMAIL}`}>{STORE_EMAIL}</a>.
      </p>

      <h2>Кои податоци собираме</h2>
      <ul>
        <li><strong>При нарачка:</strong> име и презиме, е-пошта, телефон, адреса и град за доставата, белешката што ќе ја напишеш и, ако одговориш, од каде дозна за нас.</li>
        <li><strong>Ако отвориш профил:</strong> е-пошта и лозинка, и ако ги внесеш: име, телефон, адреса за достава и датум на раѓање. Лозинката се чува само шифрирана и ние не можеме да ја прочитаме. Ги чуваме и твоите согласности, со датумот кога си ги дал.</li>
        <li><strong>Поени и купони:</strong> заработените, потрошените и истечените поени, купоните што ги имаш и на која нарачка си ги искористил.</li>
        <li><strong>Во твојот прелистувач:</strong> кошничката, јазикот и линкот од кој си дошол (до 30 дена) се чуваат само на твојот уред, не кај нас. За посетите користиме анонимна статистика (Vercel Analytics), без колачиња за следење и без рекламни пиксели.</li>
        <li><strong>За заштита од злоупотреба:</strong> IP адресата при нарачка се користи привремено, за да се спречат лажни и масовни нарачки.</li>
      </ul>

      <h2>Зошто ги користиме</h2>
      <ul>
        <li>за да ја испорачаме и наплатиме нарачката и да те контактираме за неа;</li>
        <li>за твојот профил, поените и купоните;</li>
        <li>за понуди и новости по е-пошта, <strong>само ако си се согласил</strong>;</li>
        <li>за сметководство, колку што бара законот;</li>
        <li>за да ја заштитиме продавницата од лажни нарачки.</li>
      </ul>

      <h2>Колку долго ги чуваме</h2>
      <ul>
        <li><strong>Нарачките и сметководствените записи:</strong> колку што бараат прописите за сметководство.</li>
        <li>
          <strong>Профилот и поените:</strong> додека го имаш профилот. Поените истекуваат според{' '}
          {POLICIES.rules.live ? <Link href={POLICIES.rules.path}>правилата за поени</Link> : 'правилата за поени'}.
        </li>
        <li><strong>Согласноста за понуди:</strong> додека не ја повлечеш.</li>
      </ul>

      <h2>Кој ги гледа</h2>
      <ul>
        <li>Вработените во продавницата, колку што им треба за нарачката.</li>
        <li>Курирската служба: име, адреса и телефон, за да ја донесе пратката.</li>
        <li>Сервисите со кои работи сајтот: базата на податоци и најавата (Supabase), хостингот на сајтот и сервисот за е-пошта. Тие ги обработуваат податоците само за нас.</li>
      </ul>
      <p><strong>Твоите податоци не ги продаваме и не ги даваме на други за реклами.</strong></p>

      <h2>Твоите права</h2>
      <p>Може да побараш:</p>
      <ul>
        <li>да видиш кои податоци ги имаме за тебе;</li>
        <li>да ги исправиме или да ги избришеме;</li>
        <li>да не ги користиме за понуди;</li>
        <li>да ги добиеш во форма што може да ја пренесеш на друго место.</li>
      </ul>
      <p>
        Согласноста за понуди може да ја повлечеш во секое време. Тоа не ги менува нарачките.
        Барањето испрати го на <a href={`mailto:${STORE_EMAIL}`}>{STORE_EMAIL}</a>. Ако мислиш дека не постапуваме
        правилно со твоите податоци, може да поднесеш претставка до Агенцијата за заштита на личните податоци.
      </p>

      <h2>Бришење на профил</h2>
      <p>
        Пиши ни од е-поштата на профилот и ќе го избришеме. Со него се бришат и поените и личните купони.
        Нарачките остануваат во сметководството онолку колку што бара законот.
      </p>

      <h2>Измени</h2>
      <p>Ако ја смениме оваа политика, се менува датумот горе. За поголема промена ќе те известиме.</p>
    </PolicyPage>
  );
}
