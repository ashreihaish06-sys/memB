import { Flame, BookOpen, Download, HelpCircle, RotateCcw } from 'lucide-react';

interface HeaderProps {
  completedCount: number;
  totalCount: number;
  streak: number;
  onOpenHelp: () => void;
  onResetProgress: () => void;
  canInstallPWA: boolean;
  onInstallPWA: () => void;
}

export function Header({
  completedCount,
  totalCount,
  streak,
  onOpenHelp,
  onResetProgress,
  canInstallPWA,
  onInstallPWA
}: HeaderProps) {
  const percent = Math.round((completedCount / totalCount) * 100);

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-3xl mx-auto px-4 py-3">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-sm shadow-indigo-200">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight tracking-tight">
                말씀암송 50
              </h1>
              <p className="text-xs text-slate-500 font-medium">개역개정 실시간 음성 암송</p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            {/* 스트릭 뱃지 */}
            <div className="flex items-center space-x-1 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-full text-amber-700 text-xs font-semibold">
              <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
              <span>{streak}일 연속</span>
            </div>

            {/* PWA 설치 버튼 */}
            {canInstallPWA && (
              <button
                onClick={onInstallPWA}
                className="flex items-center space-x-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-full text-xs font-semibold transition-colors cursor-pointer"
                title="홈 화면에 앱 설치"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">앱 설치</span>
              </button>
            )}

            {/* 도움말 버튼 */}
            <button
              onClick={onOpenHelp}
              className="p-1.5 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
              title="사용 가이드 및 팁"
              aria-label="사용 가이드 및 팁"
            >
              <HelpCircle className="w-5 h-5 text-slate-500 hover:text-slate-700" />
            </button>

            {/* 기록 초기화 버튼 */}
            <button
              onClick={onResetProgress}
              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors cursor-pointer"
              title="암송 기록 초기화"
              aria-label="암송 기록 초기화"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3">
          <div className="flex justify-between items-center text-xs font-medium text-slate-600 mb-1.5">
            <span>암송 달성률</span>
            <span className="font-semibold text-indigo-600">
              {completedCount} / {totalCount} 구절 ({percent}%)
            </span>
          </div>
          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>
    </header>
  );
}

