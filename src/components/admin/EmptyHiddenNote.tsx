'use client';

/**
 * Under a product list that starts on stock (Task 17.1): how many empty
 * products the same filters would also find, and one click to show them, so
 * a sold-out model can still be found for a restock.
 */
export default function EmptyHiddenNote({
  count,
  onShow,
  className = '',
}: {
  count: number;
  onShow: () => void;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <p className={`text-xs text-slate-500 ${className}`}>
      {count === 1 ? '1 празен производ не е прикажан' : `${count} празни производи не се прикажани`}
      {' · '}
      <button type="button" onClick={onShow} className="font-medium text-blue-600 hover:text-blue-800 underline-offset-2 hover:underline">
        {count === 1 ? 'прикажи го' : 'прикажи ги'}
      </button>
    </p>
  );
}
