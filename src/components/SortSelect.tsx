'use client';

import { ChevronDown } from 'lucide-react';

export interface SortOption {
  label: string;
  value: string;
}

interface SortSelectProps {
  options: SortOption[];
  value: string;
  onSortChange: (value: string) => void;
}

export default function SortSelect({ options, value, onSortChange }: SortSelectProps) {
  return (
    <div className="relative inline-block w-full sm:w-auto">
      <select
        value={value}
        onChange={(e) => onSortChange(e.target.value)}
        aria-label="Sort products"
        className="appearance-none w-full sm:w-auto bg-white border border-stone-200 py-2 sm:py-2.5 pl-3 sm:pl-4 pr-9 sm:pr-10 text-[11px] sm:text-[12px] text-stone-700 uppercase tracking-wider cursor-pointer hover:border-stone-400 focus:outline-none focus:ring-1 focus:ring-stone-900 focus:border-stone-900 transition-colors duration-150"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-2.5 sm:right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-stone-400 pointer-events-none" />
    </div>
  );
}
