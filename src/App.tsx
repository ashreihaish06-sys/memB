import { useState, useEffect, type MouseEvent } from 'react';
import type { Verse } from './types/verse';
import { useVerseProgress } from './hooks/useVerseProgress';
import { useSpeechRecognition } from './hooks/useSpeechRecognition';
import { Header } from './components/Header';
import { SearchBarAndFilter } from './components/SearchBarAndFilter';
import { VerseCard } from './components/VerseCard';
import { RecitationView } from './components/RecitationView';
import { HelpModal } from './components/HelpModal';
import { BookOpen } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export default function App() {
  const [selectedVerse, setSelectedVerse] = useState<Verse | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState<boolean>(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

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

  const { speakText } = useSpeechRecognition();

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

  const handleInstallPWA = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstallPrompt(null);
    }
  };

  // 다음 구절 찾기
  const currentVerseIndex = selectedVerse
    ? verses.findIndex((v: Verse) => v.id === selectedVerse.id)
    : -1;
  const isNextAvailable = currentVerseIndex >= 0 && currentVerseIndex < verses.length - 1;

  const handleNextVerse = () => {
    if (isNextAvailable) {
      setSelectedVerse(verses[currentVerseIndex + 1]);
    }
  };

  const handleQuickListen = (text: string, e: MouseEvent) => {
    e.stopPropagation();
    speakText(text);
  };

  // 암송 뷰가 활성화된 경우
  if (selectedVerse) {
    return (
      <RecitationView
        verse={selectedVerse}
        onBack={() => setSelectedVerse(null)}
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
                onSelect={setSelectedVerse}
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
