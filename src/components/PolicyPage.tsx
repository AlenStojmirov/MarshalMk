import Link from 'next/link';
import type { ReactNode } from 'react';
import { POLICIES, type PolicyKey } from '@/config/policies';
import PolicyLanguage from '@/components/PolicyLanguage';
import { formatDate } from '@/lib/i18n/format';
import { translate, type Language } from '@/lib/i18n/messages';

/**
 * The frame of a rules page (Task 13.5): title, the date of the version in
 * force, the text, and links to the other pages. Mobile first: one column,
 * readable line length, headings a thumb can find.
 *
 * Both languages are built here, on the server, and PolicyLanguage shows the
 * one the visitor picked. The Macedonian (`intro`, `children`) is the text
 * that applies; the English (`enIntro`, `en`) says the same and opens by
 * saying the Macedonian applies. Headings carry the same ids in both, so a
 * link to a section works in either.
 */
export default function PolicyPage({
  policy, intro, children, enIntro, en,
}: {
  policy: PolicyKey;
  intro?: ReactNode;
  children: ReactNode;
  enIntro?: ReactNode;
  en: ReactNode;
}) {
  const others = (Object.keys(POLICIES) as PolicyKey[]).filter((k) => k !== policy && POLICIES[k].live);
  // The version is a calendar date: read it as one, so no timezone moves it a day.
  const [y, m, d] = POLICIES[policy].version.split('-').map(Number);
  const since = new Date(y, m - 1, d);

  const frame = (lang: Language, lead: ReactNode | undefined, body: ReactNode) => (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
      <h1 className="text-2xl sm:text-3xl font-bold text-stone-900">{translate(lang, `policies.${policy}.title`)}</h1>
      <p className="text-xs text-stone-500 mt-1">{translate(lang, 'policies.validFrom', { date: formatDate(lang, since) })}</p>
      {lang === 'en' && (
        <p className="mt-4 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600">
          {translate(lang, 'policies.translationNote')}
        </p>
      )}
      {lead && <div className="mt-4 text-[15px] leading-relaxed text-stone-700">{lead}</div>}
      <div
        className="mt-6 text-[15px] leading-relaxed text-stone-700
          [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-stone-900 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:scroll-mt-20
          [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_li]:mb-1
          [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-stone-900 [&_strong]:text-stone-900"
      >
        {body}
      </div>
      <nav className="mt-10 pt-6 border-t border-stone-200 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        {others.map((k) => (
          <Link key={k} href={POLICIES[k].path} className="text-stone-600 hover:text-stone-900 underline underline-offset-2">
            {translate(lang, `policies.${k}.title`)}
          </Link>
        ))}
      </nav>
    </div>
  );

  return (
    <main className="bg-white">
      <PolicyLanguage mk={frame('mk', intro, children)} en={frame('en', enIntro, en)} />
    </main>
  );
}
