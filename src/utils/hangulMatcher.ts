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
function approximateFind(pattern: string, text: string): { distance: number; end: number } {
  const m = pattern.length;
  const n = text.length;

  let prev = new Array<number>(n + 1).fill(0); // 0행: 어디서든 시작 가능
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    const pc = pattern.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = pc === text.charCodeAt(j - 1) ? 0 : 1;
      curr[j] = Math.min(prev[j - 1] + cost, prev[j] + 1, curr[j - 1] + 1);
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
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
  return { distance: best, end };
}

export interface ChunkMatch {
  /** 0.0 ~ 1.0 (목표 마디 대비 일치율) */
  similarity: number;
  isMatch: boolean;
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
    return { similarity: 0, isMatch: false, end: from };
  }

  // 비정상적으로 긴 발화만 최근 구간으로 제한 (정상 암송에서는 항상 소비 위치부터 전부 검사)
  const start = Math.max(from, total - MAX_SEARCH_WINDOW);
  const { distance, end } = approximateFind(patternJamo, spoken.jamo.slice(start));

  const similarity = Math.max(0, 1 - distance / m);
  return {
    similarity: Math.round(similarity * 100) / 100,
    isMatch: similarity >= threshold,
    end: start + end
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
