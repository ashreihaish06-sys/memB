// 초성, 중성, 종성 테이블
const CHOSUNG = [
  'ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

const JUNGSUNG = [
  'ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ',
  'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ'
];

const JONGSUNG = [
  '', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ',
  'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ',
  'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'
];

/**
 * 실제 발음에서 구분되지 않아 음성인식이 자주 혼동하는 모음을 하나로 접어서 비교합니다.
 * (예: 애/에, 왜/외/웨)
 */
const FOLD: Record<string, string> = {
  'ㅐ': 'ㅔ',
  'ㅒ': 'ㅖ',
  'ㅙ': 'ㅞ',
  'ㅚ': 'ㅞ'
};

const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** 한 번에 비교할 발화 최대 길이(자모 수). 가장 긴 구절(갈 2:20)의 약 3배 */
const MAX_SEARCH_WINDOW = 1500;

/** 자모로 분해한 문자열과, 각 자모가 원문 몇 번째 글자에서 왔는지 기록한 표 */
export interface JamoText {
  jamo: string;
  /** rawIndex[k] = jamo[k]를 만든 원문 글자의 인덱스 */
  rawIndex: number[];
}

/**
 * 원문을 비교용 자모 문자열로 변환합니다.
 * - 공백/문장부호 제거, 소문자화
 * - 한글 음절을 초성·중성·종성으로 분해
 * - 혼동하기 쉬운 모음은 접어서(fold) 통일
 */
export function toJamoText(raw: string): JamoText {
  let jamo = '';
  const rawIndex: number[] = [];

  const push = (s: string, i: number) => {
    jamo += s;
    for (let k = 0; k < s.length; k++) rawIndex.push(i);
  };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (!LETTER_OR_DIGIT.test(ch)) continue;

    const code = ch.charCodeAt(0);
    // 한글 음절 유니코드 범위: 0xAC00 ~ 0xD7A3
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const syllable = code - 0xAC00;
      const jung = JUNGSUNG[Math.floor((syllable % 588) / 28)];
      const jong = JONGSUNG[syllable % 28];
      push(CHOSUNG[Math.floor(syllable / 588)] + (FOLD[jung] ?? jung) + jong, i);
    } else {
      push(ch.toLowerCase(), i);
    }
  }

  return { jamo, rawIndex };
}

/**
 * 근사 부분문자열 검색 (Sellers 알고리즘).
 * `text` 안에서 `pattern`과 편집거리가 가장 작은 구간을 찾아 거리와 끝 위치를 돌려줍니다.
 * 시작 위치는 자유이므로 앞쪽에 잡음/이전 마디의 잔여 발화가 있어도 영향을 받지 않습니다.
 */
function approximateFind(
  pattern: string,
  text: string
): { distance: number; start: number; end: number } {
  const m = pattern.length;
  const n = text.length;

  let prev = new Array<number>(n + 1).fill(0); // 0행: 어디서든 시작 가능
  let curr = new Array<number>(n + 1).fill(0);
  let prevStart = Array.from({ length: n + 1 }, (_, idx) => idx);
  let currStart = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    currStart[0] = 0;
    const pc = pattern.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = pc === text.charCodeAt(j - 1) ? 0 : 1;
      const diag = prev[j - 1] + cost;
      const up = prev[j] + 1;
      const left = curr[j - 1] + 1;

      if (diag <= up && diag <= left) {
        curr[j] = diag;
        currStart[j] = prevStart[j - 1];
      } else if (up <= left) {
        curr[j] = up;
        currStart[j] = prevStart[j];
      } else {
        curr[j] = left;
        currStart[j] = currStart[j - 1];
      }
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;

    const tmpStart = prevStart;
    prevStart = currStart;
    currStart = tmpStart;
  }

  // prev = m행. 거리가 같으면 더 뒤쪽 끝을 택해 잔여 발화가 다음 마디로 새는 것을 막음
  let best = prev[0];
  let end = 0;
  for (let j = 1; j <= n; j++) {
    if (prev[j] <= best) {
      best = prev[j];
      end = j;
    }
  }
  return { distance: best, start: prevStart[end], end };
}

export interface ChunkMatch {
  /** 0.0 ~ 1.0 (목표 마디 대비 일치율) */
  similarity: number;
  isMatch: boolean;
  /** 일치한 구간이 시작하는 위치 (spoken.jamo 기준 절대 인덱스) */
  start: number;
  /** 일치한 구간이 끝나는 위치 (spoken.jamo 기준 절대 인덱스). isMatch일 때만 의미 있음 */
  end: number;
}

/**
 * 발화 텍스트에서 `from` 이후 구간이 목표 마디와 일치하는지 판별합니다.
 *
 * @param patternJamo 목표 마디 (`toJamoText(...).jamo`)
 * @param spoken      지금까지 인식된 전체 발화
 * @param from        이미 처리(소비)한 자모 개수 — 이 위치 이전은 보지 않음
 * @param threshold   통과 기준 유사도
 */
export function matchChunk(
  patternJamo: string,
  spoken: JamoText,
  from: number,
  threshold: number
): ChunkMatch {
  const m = patternJamo.length;
  const total = spoken.jamo.length;
  if (m === 0 || from >= total) {
    return { similarity: 0, isMatch: false, start: from, end: from };
  }

  // 비정상적으로 긴 발화만 최근 구간으로 제한 (정상 암송에서는 항상 소비 위치부터 전부 검사)
  const windowStart = Math.max(from, total - MAX_SEARCH_WINDOW);
  const { distance, start, end } = approximateFind(patternJamo, spoken.jamo.slice(windowStart));

  const similarity = Math.max(0, 1 - distance / m);
  return {
    similarity: Math.round(similarity * 100) / 100,
    isMatch: similarity >= threshold,
    start: windowStart + start,
    end: windowStart + end
  };
}

/**
 * 단어 단위 초성 추출 (힌트 기능용)
 * 예: "그런즉 누구든지" -> "ㄱㄹㅈ ㄴㄱㄷㅈ"
 */
export function getChosungHint(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      result += CHOSUNG[Math.floor((code - 0xAC00) / 588)];
    } else {
      result += text[i];
    }
  }
  return result;
}

export interface DiffSegment {
  text: string;
  correct: boolean;
}

/**
 * 발화된 텍스트(`spoken`)를 목표 원문(`target`)과 비교하여
 * 맞은 글자(녹색, correct: true)와 틀린 글자(빨간색, correct: false) 구간으로 분리합니다.
 */
export function diffSpokenText(target: string, spoken: string): DiffSegment[] {
  const trimmed = spoken.trim();
  if (!trimmed) return [];

  const charJamo = (ch: string): string => {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const syllable = code - 0xAC00;
      const jung = JUNGSUNG[Math.floor((syllable % 588) / 28)];
      const jong = JONGSUNG[syllable % 28];
      return CHOSUNG[Math.floor(syllable / 588)] + (FOLD[jung] ?? jung) + jong;
    }
    return ch.toLowerCase();
  };

  const tChars: string[] = [];
  for (let i = 0; i < target.length; i++) {
    if (LETTER_OR_DIGIT.test(target[i])) {
      tChars.push(charJamo(target[i]));
    }
  }

  const sChars: { rawIdx: number; jamo: string }[] = [];
  for (let i = 0; i < trimmed.length; i++) {
    if (LETTER_OR_DIGIT.test(trimmed[i])) {
      sChars.push({ rawIdx: i, jamo: charJamo(trimmed[i]) });
    }
  }

  if (sChars.length === 0) {
    return [{ text: trimmed, correct: false }];
  }

  // LCS(최장 공통 부분수열)로 발화 글자 중 원문과 순서대로 일치하는 글자 색출
  const m = tChars.length;
  const n = sChars.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (tChars[i - 1] === sChars[j - 1].jamo) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const matchedRawIndices = new Set<number>();
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (tChars[i - 1] === sChars[j - 1].jamo) {
      matchedRawIndices.add(sChars[j - 1].rawIdx);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }

  // 각 글자의 정오답 여부에 따라 연속된 구간으로 병합 (공백/문장부호는 인접 글자 색상 유지)
  const segments: DiffSegment[] = [];
  let lastCorrect = matchedRawIndices.has(sChars[0].rawIdx);

  for (let k = 0; k < trimmed.length; k++) {
    const ch = trimmed[k];
    const isLetter = LETTER_OR_DIGIT.test(ch);
    const currentCorrect = isLetter ? matchedRawIndices.has(k) : lastCorrect;
    if (isLetter) lastCorrect = currentCorrect;

    if (segments.length > 0 && segments[segments.length - 1].correct === currentCorrect) {
      segments[segments.length - 1].text += ch;
    } else {
      segments.push({ text: ch, correct: currentCorrect });
    }
  }

  return segments;
}

export interface VerseEvaluation {
  segments: DiffSegment[];
  matchedChars: number;
  targetChars: number;
  spokenChars: number;
  accuracy: number; // 0 - 100 (%)
  passed: boolean;
}

/**
 * 목표 전체 구절(`target`)과 발화 텍스트(`spoken`)를 비교하여
 * 맞은 부분(녹색) / 틀린 부분(빨간색) 세그먼트와 종합 정확도(일치율)를 계산합니다.
 */
export function evaluateVerse(target: string, spoken: string): VerseEvaluation {
  const trimmedTarget = target.trim();
  const trimmedSpoken = removeConsecutiveDuplicates(spoken.trim());
  const segments = diffSpokenText(trimmedTarget, trimmedSpoken);

  let targetChars = 0;
  for (let i = 0; i < trimmedTarget.length; i++) {
    if (LETTER_OR_DIGIT.test(trimmedTarget[i])) targetChars++;
  }

  let spokenChars = 0;
  for (let i = 0; i < trimmedSpoken.length; i++) {
    if (LETTER_OR_DIGIT.test(trimmedSpoken[i])) spokenChars++;
  }

  let matchedChars = 0;
  for (const seg of segments) {
    if (seg.correct) {
      for (let i = 0; i < seg.text.length; i++) {
        if (LETTER_OR_DIGIT.test(seg.text[i])) matchedChars++;
      }
    }
  }

  if (targetChars === 0 || spokenChars === 0) {
    return {
      segments,
      matchedChars: 0,
      targetChars,
      spokenChars,
      accuracy: 0,
      passed: false
    };
  }

  const recall = matchedChars / targetChars;
  const precision = matchedChars / spokenChars;
  // 전체 구절 암송 평가: 목표 구절 재현율 75% + 발화 정확도 25% 가중치
  const score = Math.round((recall * 0.75 + precision * 0.25) * 100);
  const accuracy = Math.min(100, Math.max(0, score));

  // 종합 일치율 75% 이상 & 구절의 70% 이상 발화 시 통과 (발음 흐림, 경미한 조사 오인식 등 포용)
  const passed = accuracy >= 75 && recall >= 0.7;

  return {
    segments,
    matchedChars,
    targetChars,
    spokenChars,
    accuracy,
    passed
  };
}

/**
 * 두 발화 텍스트 조각을 중복 없이 자연스럽게 병합합니다.
 * 모바일 브라우저(특히 Android Chrome)에서 세션 재시작이나 콜백 중복으로 인해
 * 동일한 단어나 문장이 앞부분에 누적되어 반복되는 현상을 원천 방지합니다.
 */
export function mergeTranscripts(prev: string, next: string): string {
  const p = prev.trim();
  const n = next.trim();

  if (!p) return n;
  if (!n) return p;
  if (p === n) return p;

  // 1) n이 p를 포함하고 있거나 p로 시작하는 경우 (새 텍스트가 이전 텍스트를 포괄)
  if (n.startsWith(p)) return n;
  if (n.includes(p)) return n;

  // 2) p가 n을 포함하고 있는 경우 (이전 텍스트가 더 완전함)
  if (p.startsWith(n) || p.endsWith(n) || p.includes(n)) return p;

  // 3) 어절(단어) 단위 접미사/접두사 오버랩 검사 (예: p의 끝 단어들과 n의 시작 단어들이 겹치는 경우)
  const pWords = p.split(/\s+/);
  const nWords = n.split(/\s+/);

  const maxOverlapWords = Math.min(pWords.length, nWords.length);
  for (let len = maxOverlapWords; len > 0; len--) {
    const pSlice = pWords.slice(pWords.length - len).join(' ');
    const nSlice = nWords.slice(0, len).join(' ');
    if (pSlice === nSlice) {
      return [...pWords.slice(0, pWords.length - len), ...nWords].join(' ');
    }
  }

  // 4) 문자 단위 오버랩 검사 (띄어쓰기 차이 등으로 어절이 정확히 안 맞아도 뒷부분 겹침 제거)
  const maxCharOverlap = Math.min(p.length, n.length, 30);
  for (let len = maxCharOverlap; len >= 3; len--) {
    const pSuffix = p.slice(p.length - len);
    const nPrefix = n.slice(0, len);
    if (pSuffix === nPrefix) {
      return p + n.slice(len);
    }
  }

  // 5) 오버랩이 전혀 없는 별개의 문장일 경우 띄어쓰기로 연결
  return `${p} ${n}`;
}

/**
 * 음성 인식 엔진에서 오작동으로 인해 연속으로 반복된 단어나 어절을 제거합니다.
 * 예: "영접하는 영접하는 자" -> "영접하는 자"
 * 예: "영접하는 자 영접하는 자" -> "영접하는 자"
 */
export function removeConsecutiveDuplicates(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= 1) return text.trim();

  // 1) 1단어 연속 반복 제거 (예: "영접하는 영접하는" -> "영접하는")
  const cleaned: string[] = [];
  for (let i = 0; i < words.length; i++) {
    if (i > 0 && words[i] === words[i - 1]) {
      continue;
    }
    cleaned.push(words[i]);
  }

  // 2) 2~5단어 구문 연속 반복 제거 (예: "영접하는 자 영접하는 자" -> "영접하는 자")
  for (let n = 2; n <= 6; n++) {
    if (cleaned.length < n * 2) continue;
    let modified = true;
    while (modified) {
      modified = false;
      for (let i = 0; i <= cleaned.length - n * 2; i++) {
        const chunk1 = cleaned.slice(i, i + n).join(' ');
        const chunk2 = cleaned.slice(i + n, i + n * 2).join(' ');
        if (chunk1 === chunk2) {
          cleaned.splice(i, n);
          modified = true;
          break;
        }
      }
    }
  }

  return cleaned.join(' ');
}



