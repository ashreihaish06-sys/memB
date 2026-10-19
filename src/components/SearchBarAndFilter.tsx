import { Search, X, CheckCircle2, Bookmark, CircleDot, Layers } from 'lucide-react';
import type { CategoryKey } from '../types/verse';

interface SearchBarAndFilterProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  activeCategory: CategoryKey;
  onCategoryChange: (category: CategoryKey) => void;
  statusFilter: 'all' | 'completed' | 'uncompleted' | 'bookmarked';
  onStatusFilterChange: (status: 'all' | 'completed' | 'uncompleted' | 'bookmarked') => void;
  totalCount: number;
  completedCount: number;
  bookmarkedCount: number;
}

const CATEGORIES: { key: CategoryKey; label: string }[] = [
  { key: 'ALL', label: '전체' },
  { key: '새로운 삶', label: '새로운 삶 (A)' },
  { key: '그리스도인의 양식', label: '그리스도인의 양식 (B)' },
  { key: '하나님을 신뢰함', label: '하나님을 신뢰함 (C)' },
  { key: '제자의 삶', label: '제자의 삶 (D)' },
  { key: '그리스도를 닮아감', label: '그리스도를 닮아감 (E)' }
];

export function SearchBarAndFilter({
  searchQuery,
  onSearchChange,
  activeCategory,
  onCategoryChange,
  statusFilter,
  onStatusFilterChange,
  totalCount,
  completedCount,
  bookmarkedCount
}: SearchBarAndFilterProps) {
  const uncompletedCount = totalCount - completedCount;

  return (
    <div className="space-y-2.5">
      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="구절(예: 빌립보서, 롬 8:28) 또는 본문 단어 검색..."
          className="w-full pl-10 pr-9 py-2.5 bg-white border border-slate-200 rounded-xl text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all shadow-xs"
        />
        {searchQuery && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Status Chips */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        <button
          onClick={() => onStatusFilterChange('all')}
          className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>전체 ({totalCount})</span>
        </button>

        <button
          onClick={() => onStatusFilterChange('uncompleted')}
          className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer ${
            statusFilter === 'uncompleted'
              ? 'bg-indigo-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <CircleDot className="w-3.5 h-3.5" />
          <span>미완료 ({uncompletedCount})</span>
        </button>

        <button
          onClick={() => onStatusFilterChange('completed')}
          className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer ${
            statusFilter === 'completed'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>완료됨 ({completedCount})</span>
        </button>

        <button
          onClick={() => onStatusFilterChange('bookmarked')}
          className={`flex items-center space-x-1 px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap cursor-pointer ${
            statusFilter === 'bookmarked'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          <Bookmark className="w-3.5 h-3.5" />
          <span>즐겨찾기 ({bookmarkedCount})</span>
        </button>
      </div>

      {/* Category Horizontal Scroll */}
      <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
        {CATEGORIES.map(cat => (
          <button
            key={cat.key}
            onClick={() => onCategoryChange(cat.key)}
            className={`px-3 py-1.5 rounded-full font-medium transition-all whitespace-nowrap cursor-pointer ${
              activeCategory === cat.key
                ? 'bg-indigo-100 text-indigo-800 border border-indigo-300 font-semibold'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200/80 border border-transparent'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>
    </div>
  );
}
