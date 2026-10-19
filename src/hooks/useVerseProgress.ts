import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Verse, VerseProgress, CategoryKey } from '../types/verse';
import { BIBLE_VERSES } from '../data/verses';

const STORAGE_KEY = 'memb_bible_progress_v1';
const STREAK_KEY = 'memb_bible_streak_v1';

interface StreakData {
  lastDate: string; // YYYY-MM-DD
  count: number;
}

export function useVerseProgress() {
  const [progressMap, setProgressMap] = useState<Record<number, VerseProgress>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load progress from localStorage', e);
    }
    return {};
  });

  const [streakData, setStreakData] = useState<StreakData>(() => {
    try {
      const saved = localStorage.getItem(STREAK_KEY);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load streak from localStorage', e);
    }
    return { lastDate: '', count: 0 };
  });

  const [activeCategory, setActiveCategory] = useState<CategoryKey>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'uncompleted' | 'bookmarked'>('all');

  // 로컬 스토리지 동기화
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progressMap));
    } catch (e) {
      console.error('Failed to save progress to localStorage', e);
    }
  }, [progressMap]);

  useEffect(() => {
    try {
      localStorage.setItem(STREAK_KEY, JSON.stringify(streakData));
    } catch (e) {
      console.error('Failed to save streak to localStorage', e);
    }
  }, [streakData]);

  // 오늘 날짜 계산 (YYYY-MM-DD)
  const getTodayString = useCallback(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, []);

  // 스트릭 업데이트
  const updateStreak = useCallback(() => {
    const today = getTodayString();
    setStreakData(prev => {
      if (prev.lastDate === today) {
        return prev; // 이미 오늘 완료 기록 있음
      }

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

      if (prev.lastDate === yesterdayStr) {
        return { lastDate: today, count: prev.count + 1 };
      } else {
        return { lastDate: today, count: 1 };
      }
    });
  }, [getTodayString]);

  // 구절 완료 처리
  const markVerseCompleted = useCallback((verseId: number) => {
    setProgressMap(prev => {
      const current = prev[verseId] || {
        verseId,
        completed: false,
        attempts: 0,
        bookmarked: false
      };
      return {
        ...prev,
        [verseId]: {
          ...current,
          completed: true,
          completedAt: Date.now(),
          attempts: (current.attempts || 0) + 1
        }
      };
    });
    updateStreak();
  }, [updateStreak]);

  // 북마크 토글
  const toggleBookmark = useCallback((verseId: number) => {
    setProgressMap(prev => {
      const current = prev[verseId] || {
        verseId,
        completed: false,
        attempts: 0,
        bookmarked: false
      };
      return {
        ...prev,
        [verseId]: {
          ...current,
          bookmarked: !current.bookmarked
        }
      };
    });
  }, []);

  // 전체 진행도 초기화
  const resetAllProgress = useCallback(() => {
    if (window.confirm('암송 기록을 모두 초기화하시겠습니까?')) {
      setProgressMap({});
      setStreakData({ lastDate: '', count: 0 });
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STREAK_KEY);
    }
  }, []);

  // 통계 계산
  const completedCount = useMemo(() => {
    return Object.values(progressMap).filter(p => p.completed).length;
  }, [progressMap]);

  const bookmarkedCount = useMemo(() => {
    return Object.values(progressMap).filter(p => p.bookmarked).length;
  }, [progressMap]);

  // 필터링된 구절 목록
  const filteredVerses = useMemo(() => {
    return BIBLE_VERSES.filter((verse: Verse) => {
      // 카테고리 필터
      if (activeCategory !== 'ALL' && verse.category !== activeCategory) {
        return false;
      }

      // 상태 필터
      const prog = progressMap[verse.id];
      if (statusFilter === 'completed' && !prog?.completed) {
        return false;
      }
      if (statusFilter === 'uncompleted' && prog?.completed) {
        return false;
      }
      if (statusFilter === 'bookmarked' && !prog?.bookmarked) {
        return false;
      }

      // 검색어 필터 (장절 또는 본문 검색)
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const refMatch = verse.reference.toLowerCase().includes(query);
        const textMatch = verse.text.toLowerCase().includes(query);
        const subMatch = verse.subCategory.toLowerCase().includes(query);
        return refMatch || textMatch || subMatch;
      }

      return true;
    });
  }, [activeCategory, statusFilter, searchQuery, progressMap]);

  return {
    verses: BIBLE_VERSES,
    filteredVerses,
    progressMap,
    streak: streakData.count,
    completedCount,
    bookmarkedCount,
    totalCount: BIBLE_VERSES.length,
    activeCategory,
    setActiveCategory,
    searchQuery,
    setSearchQuery,
    statusFilter,
    setStatusFilter,
    markVerseCompleted,
    toggleBookmark,
    resetAllProgress
  };
}
