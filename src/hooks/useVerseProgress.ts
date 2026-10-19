import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Verse, VerseProgress, CategoryKey } from '../types/verse';
import { BIBLE_VERSES } from '../data/verses';

const STORAGE_KEY = 'memb_bible_progress_v1';
const STREAK_KEY = 'memb_bible_streak_v1';

interface StreakData {
  lastDate: string; // YYYY-MM-DD
  count: number;
}

const EMPTY_STREAK: StreakData = { lastDate: '', count: 0 };

/** 로컬 시간 기준 YYYY-MM-DD */
function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function todayKey(): string {
  return dateKey(new Date());
}

function yesterdayKey(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateKey(d);
}

function readJSON(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error(`Failed to read ${key} from localStorage`, e);
    return null;
  }
}

/** 저장된 값이 손상됐거나 형식이 다르면 버리고 정상 항목만 살린다 */
function loadProgress(): Record<number, VerseProgress> {
  const data = readJSON(STORAGE_KEY);
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};

  const validIds = new Set(BIBLE_VERSES.map((v) => v.id));
  const result: Record<number, VerseProgress> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const id = Number(key);
    if (!validIds.has(id) || !value || typeof value !== 'object') continue;
    const v = value as Partial<VerseProgress>;
    result[id] = {
      verseId: id,
      completed: v.completed === true,
      completedAt: typeof v.completedAt === 'number' ? v.completedAt : undefined,
      attempts: typeof v.attempts === 'number' ? v.attempts : 0,
      bookmarked: v.bookmarked === true
    };
  }
  return result;
}

function loadStreak(): StreakData {
  const data = readJSON(STREAK_KEY) as Partial<StreakData> | null;
  if (data && typeof data.lastDate === 'string' && typeof data.count === 'number') {
    return { lastDate: data.lastDate, count: data.count };
  }
  return EMPTY_STREAK;
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // 저장 공간 부족/사생활 보호 모드 등: 앱은 계속 동작하되 기록만 유지되지 않음
    console.error(`Failed to save ${key} to localStorage`, e);
  }
}

export function useVerseProgress() {
  const [progressMap, setProgressMap] = useState<Record<number, VerseProgress>>(loadProgress);
  const [streakData, setStreakData] = useState<StreakData>(loadStreak);

  const [activeCategory, setActiveCategory] = useState<CategoryKey>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'uncompleted' | 'bookmarked'>('all');

  // 로컬 스토리지 동기화
  useEffect(() => {
    writeJSON(STORAGE_KEY, progressMap);
  }, [progressMap]);

  useEffect(() => {
    writeJSON(STREAK_KEY, streakData);
  }, [streakData]);

  // 연속 암송일 갱신 (오늘 이미 기록했으면 유지, 어제였으면 +1, 그 외는 1부터 다시)
  const updateStreak = useCallback(() => {
    const today = todayKey();
    setStreakData((prev) => {
      if (prev.lastDate === today) return prev;
      if (prev.lastDate === yesterdayKey()) return { lastDate: today, count: prev.count + 1 };
      return { lastDate: today, count: 1 };
    });
  }, []);

  // 구절 완료 처리
  const markVerseCompleted = useCallback(
    (verseId: number) => {
      setProgressMap((prev) => {
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
    },
    [updateStreak]
  );

  // 북마크 토글
  const toggleBookmark = useCallback((verseId: number) => {
    setProgressMap((prev) => {
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
      setStreakData(EMPTY_STREAK);
    }
  }, []);

  // 통계 계산
  const completedCount = useMemo(() => {
    return Object.values(progressMap).filter((p) => p.completed).length;
  }, [progressMap]);

  const bookmarkedCount = useMemo(() => {
    return Object.values(progressMap).filter((p) => p.bookmarked).length;
  }, [progressMap]);

  // 어제·오늘 기록이 아니면 이미 끊긴 연속 기록이므로 0으로 보여준다
  const streak =
    streakData.lastDate === todayKey() || streakData.lastDate === yesterdayKey() ? streakData.count : 0;

  // 필터링된 구절 목록
  const filteredVerses = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
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
      if (query) {
        return (
          verse.reference.toLowerCase().includes(query) ||
          verse.text.toLowerCase().includes(query) ||
          verse.subCategory.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [activeCategory, statusFilter, searchQuery, progressMap]);

  return {
    verses: BIBLE_VERSES,
    filteredVerses,
    progressMap,
    streak,
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
