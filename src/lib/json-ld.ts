/**
 * Structured data (JSON-LD) as the text of a `<script type="application/ld+json">`
 * (Task 15.3).
 *
 * `JSON.stringify` alone is not safe there: the browser ends the script at the
 * first `</script>` whatever the JSON says, so a product name or description
 * holding one — typed in the back office — would run as code for every visitor,
 * the admin included. `<`, `>` and `&` are written as `<`, `>` and
 * `&`, and the two line separators U+2028/U+2029 as escapes too. Inside a
 * JSON string these mean exactly the same characters, so search engines read the
 * same data; outside strings JSON never has them.
 */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}
