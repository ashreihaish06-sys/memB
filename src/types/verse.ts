export interface Verse {
  id: number;
  category: string;
  subCategory: string;
  reference: string;
  text: string;
  chunks: string[];
}

export interface VerseProgress {
  verseId: number;
  completed: boolean;
  completedAt?: number;
  attempts: number;
  bookmarked: boolean;
}

export type CategoryKey = 'ALL' | '새로운 삶' | '그리스도인의 양식' | '하나님을 신뢰함' | '제자의 삶' | '그리스도를 닮아감';

