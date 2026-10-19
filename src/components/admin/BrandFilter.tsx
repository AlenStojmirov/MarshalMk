'use client';

/**
 * The brand filter of the analysis screens. What it narrows is each screen's
 * call — some numbers belong to the whole shop (a budget, a break-even) and stay
 * so — and `note` says which, so a number read under a brand is never taken for
 * the shop's.
 */
export default function BrandFilter({
  brands, value, onChange, note,
}: {
  brands: string[];
  value: string;
  onChange: (brand: string) => void;
  note?: (brand: string) => string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label="Бренд"
        className={`px-3 py-2 border rounded-lg text-sm bg-white ${
          value ? 'border-blue-500 ring-1 ring-blue-200' : 'border-slate-300'
        }`}
      >
        <option value="">Сите брендови</option>
        {brands.map((b) => (
          <option key={b} value={b}>{b}</option>
        ))}
      </select>
      {value && (
        <>
          <span className="text-xs text-slate-600">
            {note ? note(value) : `Сите бројки на страната се само за ${value}.`}
          </span>
          <button
            type="button"
            onClick={() => onChange('')}
            className="text-xs text-blue-600 hover:text-blue-800 underline"
          >
            сите брендови
          </button>
        </>
      )}
    </div>
  );
}
