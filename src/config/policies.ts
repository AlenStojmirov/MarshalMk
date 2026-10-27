/**
 * The pages a customer reads and agrees to (Task 13.5, D-032).
 *
 * Each has a version: the date its text last changed in substance. Signing up
 * (13.6) stores the version a customer agreed to, so when a text changes the
 * date moves here and it is known who agreed to what. Change the version with
 * the text, never without it.
 *
 * `live`: linked from the footer and the other pages, in the sitemap, indexed.
 * The points rules were held back until there was an account to collect points
 * with; Task 13.6 turned them on.
 */
export const POLICIES = {
  delivery: { path: '/dostava-i-zamena', title: 'Достава, плаќање и замена', version: '2026-10-18', live: true },
  privacy: { path: '/privatnost', title: 'Политика за приватност', version: '2026-10-27', live: true },
  rules: { path: '/pravila', title: 'Правила за поени и купони', version: '2026-10-18', live: true },
} as const;

export type PolicyKey = keyof typeof POLICIES;

/** The two boxes at sign-up (13.6): the first is required, the second never is. */
export const CONSENT = {
  required: 'Ги прочитав и ги прифаќам Правилата за поени и купони и Политиката за приватност.',
  marketing: 'Сакам да добивам понуди и новости по е-пошта. Може да се откажам во секое време.',
} as const;
