import { useState, useEffect, useRef, type MouseEvent } from 'react';
import type { Verse } from './types/verse';
import { useVerseProgress } from './hooks/useVerseProgress';
import { Header } from './components/Header';
import { SearchBarAndFilter } from './components/SearchBarAndFilter';
import { VerseCard } from './components/VerseCard';
import { RecitationView } from './components/RecitationView';
import { HelpModal } from './components/HelpModal';
import { speak } from './utils/tts';
import { BookOpen } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function App() {
  const [selectedVerse, setSelectedVerse] = useState<Verse | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const listScrollYRef = useRef<number>(0);

  const {
    verses,
    filteredVerses,
    progressMap,
    streak,
    completedCount,
    bookmarkedCount,
    totalCount,
    activeCategory,
    setActiveCategory,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    markVerseCompleted,
    toggleBookmark,
    resetAllProgress
  } = useVerseProgress();

  // PWA beforeinstallprompt 이벤트 감지
  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // 스마트폰 뒤로가기(제스처/하드웨어 버튼)로 앱이 종료되지 않고 목록으로 돌아오게 함
  useEffect(() => {
    const handlePopState = () => setSelectedVerse(null);
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // 암송 화면은 맨 위에서 시작, 목록으로 돌아오면 보던 위치 복원
  useEffect(() => {
    window.scrollTo(0, selectedVerse ? 0 : listScrollYRef.current);
  }, [selectedVerse]);

  const handleInstallPWA = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  const openVerse = (verse: Verse) => {
    listScrollYRef.current = window.scrollY;
    window.history.pushState({ verseId: verse.id }, '');
    setSelectedVerse(verse);
  };

  const closeVerse = () => {
    if (window.history.state?.verseId !== undefined) {
      window.history.back(); // popstate 핸들러가 목록으로 전환
    } else {
      setSelectedVerse(null);
    }
  };

  // 다음 구절 찾기
  const currentVerseIndex = selectedVerse
    ? verses.findIndex((v: Verse) => v.id === selectedVerse.id)
    : -1;
  const isNextAvailable = currentVerseIndex >= 0 && currentVerseIndex < verses.length - 1;

  const handleNextVerse = () => {
    if (isNextAvailable) {
      const next = verses[currentVerseIndex + 1];
      window.history.replaceState({ verseId: next.id }, '');
      setSelectedVerse(next);
    }
  };

  const handleQuickListen = (text: string, e: MouseEvent) => {
    e.stopPropagation();
    speak(text);
  };

  // 암송 뷰가 활성화된 경우 (구절이 바뀌면 key 로 화면 상태를 통째로 초기화)
  if (selectedVerse) {
    return (
      <RecitationView
        key={selectedVerse.id}
        verse={selectedVerse}
        onBack={closeVerse}
        onComplete={markVerseCompleted}
        onNextVerse={handleNextVerse}
        isNextAvailable={isNextAvailable}
      />
    );
  }

  // 기본 목록 뷰
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-16">
      <Header
        completedCount={completedCount}
        totalCount={totalCount}
        streak={streak}
        onOpenHelp={() => setIsHelpOpen(true)}
        onResetProgress={resetAllProgress}
        canInstallPWA={Boolean(installPrompt)}
        onInstallPWA={handleInstallPWA}
      />

      <main className="max-w-3xl w-full mx-auto px-4 py-4 flex-1 space-y-4">
        {/* 검색 및 필터 바 */}
        <SearchBarAndFilter
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          activeCategory={activeCategory}
          onCategoryChange={setActiveCategory}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          totalCount={totalCount}
          completedCount={completedCount}
          bookmarkedCount={bookmarkedCount}
        />

        {/* 구절 목록 리스트 */}
        {filteredVerses.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 text-center border border-slate-200 mt-6 shadow-xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-3">
              <BookOpen className="w-6 h-6" />
            </div>
            <p className="text-base font-bold text-slate-700">해당하는 구절이 없습니다</p>
            <p className="text-xs text-slate-400 mt-1">검색어나 선택한 필터를 변경해보세요.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {filteredVerses.map(verse => (
              <VerseCard
                key={verse.id}
                verse={verse}
                progress={progressMap[verse.id]}
                onSelect={openVerse}
                onToggleBookmark={toggleBookmark}
                onQuickListen={handleQuickListen}
              />
            ))}
          </div>
        )}
      </main>

      {/* 도움말 모달 */}
      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </div>
  );
}
