import Link from 'next/link';
import type { ReactNode } from 'react';
import { POLICIES, type PolicyKey } from '@/config/policies';

/**
 * The frame of a rules page (Task 13.5): title, the date of the version in
 * force, the text, and links to the other pages. Mobile first: one column,
 * readable line length, headings a thumb can find.
 */
export default function PolicyPage({ policy, intro, children }: { policy: PolicyKey; intro?: ReactNode; children: ReactNode }) {
  const p = POLICIES[policy];
  const others = (Object.keys(POLICIES) as PolicyKey[]).filter((k) => k !== policy && POLICIES[k].live);
  return (
    <main className="bg-white">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="text-2xl sm:text-3xl font-bold text-stone-900">{p.title}</h1>
        <p className="text-xs text-stone-500 mt-1">Важи од {new Date(p.version).toLocaleDateString('mk-MK')}</p>
        {intro && <div className="mt-4 text-[15px] leading-relaxed text-stone-700">{intro}</div>}
        <div
          className="mt-6 text-[15px] leading-relaxed text-stone-700
            [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-stone-900 [&_h2]:mt-8 [&_h2]:mb-2 [&_h2]:scroll-mt-20
            [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_li]:mb-1
            [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-stone-900 [&_strong]:text-stone-900"
        >
          {children}
        </div>
        <nav className="mt-10 pt-6 border-t border-stone-200 flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {others.map((k) => (
            <Link key={k} href={POLICIES[k].path} className="text-stone-600 hover:text-stone-900 underline underline-offset-2">
              {POLICIES[k].title}
            </Link>
          ))}
        </nav>
      </div>
    </main>
  );
}
