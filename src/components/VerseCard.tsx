import type { MouseEvent } from 'react';
import type { Verse, VerseProgress } from '../types/verse';
import { CheckCircle2, Bookmark, Mic, Volume2 } from 'lucide-react';

interface VerseCardProps {
  verse: Verse;
  progress?: VerseProgress;
  onSelect: (verse: Verse) => void;
  onToggleBookmark: (verseId: number) => void;
  onQuickListen: (text: string, e: MouseEvent) => void;
}

export function VerseCard({
  verse,
  progress,
  onSelect,
  onToggleBookmark,
  onQuickListen
}: VerseCardProps) {
  const isCompleted = progress?.completed;
  const isBookmarked = progress?.bookmarked;

  return (
    <div
      onClick={() => onSelect(verse)}
      className={`group relative bg-white rounded-2xl p-4 border transition-all duration-200 cursor-pointer shadow-xs hover:shadow-md hover:-translate-y-0.5 active:scale-[0.99] ${
        isCompleted
          ? 'border-emerald-200/80 bg-gradient-to-br from-white to-emerald-50/20'
          : 'border-slate-200/90 hover:border-indigo-300'
      }`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center space-x-2">
          <span
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
              isCompleted
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {verse.id}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-medium border border-indigo-100">
            {verse.subCategory}
          </span>
        </div>

        <div className="flex items-center space-x-1" onClick={(e) => e.stopPropagation()}>
          {/* 발음 듣기 버튼 */}
          <button
            onClick={(e) => onQuickListen(verse.text, e)}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
            title="구절 음성 듣기"
          >
            <Volume2 className="w-4 h-4" />
          </button>

          {/* 북마크 버튼 */}
          <button
            onClick={() => onToggleBookmark(verse.id)}
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              isBookmarked
                ? 'text-amber-500 hover:bg-amber-50'
                : 'text-slate-400 hover:text-amber-500 hover:bg-slate-50'
            }`}
            title="즐겨찾기"
          >
            <Bookmark className={`w-4 h-4 ${isBookmarked ? 'fill-amber-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Reference & Text */}
      <div className="mb-3">
        <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
          {verse.reference}
        </h3>
        <p className="mt-1 text-sm text-slate-600 line-clamp-2 leading-relaxed">
          {verse.text}
        </p>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
        <span className="text-slate-400 font-medium">
          {verse.chunks.length}마디 구성
        </span>

        {isCompleted ? (
          <span className="flex items-center space-x-1 text-emerald-600 font-semibold bg-emerald-50 px-2.5 py-1 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>암송 완료</span>
          </span>
        ) : (
          <span className="flex items-center space-x-1 text-indigo-600 font-semibold bg-indigo-50 px-2.5 py-1 rounded-full group-hover:bg-indigo-600 group-hover:text-white transition-colors">
            <Mic className="w-3.5 h-3.5" />
            <span>암송 시작</span>
          </span>
        )}
      </div>
    </div>
  );
}
