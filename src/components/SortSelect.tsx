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
    <div className="relative inline-block">
      <select
        value={value}
        onChange={(e) => onSortChange(e.target.value)}
        aria-label="Sort products"
        className="appearance-none bg-white border border-gray-300 rounded-lg py-2 pl-4 pr-10 text-sm text-gray-700 cursor-pointer hover:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:border-transparent transition-colors"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500 pointer-events-none" />
    </div>
  );
}
