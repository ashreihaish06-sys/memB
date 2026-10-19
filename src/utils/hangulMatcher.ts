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
 * 한글 문자열을 자모 단위로 분해합니다.
 * 예: '그리스도' -> 'ㄱㅡㄹㅣㅅㅡㄷㅗ'
 */
export function decomposeHangul(str: string): string {
  let result = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    // 한글 유니코드 범위: 0xAC00 ~ 0xD7A3
    if (code >= 0xAC00 && code <= 0xD7A3) {
      const syllableIndex = code - 0xAC00;
      const chosungIndex = Math.floor(syllableIndex / 588);
      const jungsungIndex = Math.floor((syllableIndex % 588) / 28);
      const jongsungIndex = syllableIndex % 28;

      result += CHOSUNG[chosungIndex];
      result += JUNGSUNG[jungsungIndex];
      if (jongsungIndex > 0) {
        result += JONGSUNG[jongsungIndex];
      }
    } else {
      result += str[i];
    }
  }
  return result;
}

/**
 * 문장부호, 공백, 특수문자를 제거하고 소문자로 정규화합니다.
 */
export function normalizeText(text: string): string {
  return text
    .replace(/[\s.,!?~"':;·…—\-()[\]{}<>\n\r]/g, '')
    .toLowerCase();
}

/**
 * 두 문자열 간의 레벤슈타인 편집 거리(Levenshtein Distance)를 계산합니다.
 */
export function getLevenshteinDistance(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = Array.from({ length: bn + 1 }, () => Array(an + 1).fill(0));

  for (let i = 0; i <= an; i++) matrix[0][i] = i;
  for (let j = 0; j <= bn; j++) matrix[j][0] = j;

  for (let j = 1; j <= bn; j++) {
    for (let i = 1; i <= an; i++) {
      if (a[i - 1] === b[j - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i - 1] + 1, // substitution
          matrix[j][i - 1] + 1,     // insertion
          matrix[j - 1][i] + 1      // deletion
        );
      }
    }
  }

  return matrix[bn][an];
}

/**
 * 두 문자열의 유사도 (0.0 ~ 1.0)를 자모 분해 기준으로 계산합니다.
 */
export function calculateJamoSimilarity(target: string, spoken: string): number {
  const normTarget = normalizeText(target);
  const normSpoken = normalizeText(spoken);

  if (!normTarget || !normSpoken) return 0;
  if (normTarget === normSpoken) return 1.0;

  // 자모 분해
  const jamoTarget = decomposeHangul(normTarget);
  const jamoSpoken = decomposeHangul(normSpoken);

  if (jamoSpoken.includes(jamoTarget)) {
    return 1.0;
  }

  // 발화 텍스트가 더 긴 경우 (누적 인식) 슬라이딩 윈도우로 최적 유사도 검사
  if (jamoSpoken.length > jamoTarget.length) {
    let maxSim = 0;
    const windowSize = jamoTarget.length;
    // 발화의 뒷부분이나 창 내에서 가장 높은 유사도 탐색
    for (let i = 0; i <= jamoSpoken.length - windowSize; i += 2) {
      const slice = jamoSpoken.slice(i, i + windowSize + 3);
      const dist = getLevenshteinDistance(jamoTarget, slice);
      const maxLen = Math.max(jamoTarget.length, slice.length);
      const sim = 1 - dist / maxLen;
      if (sim > maxSim) maxSim = sim;
      if (maxSim >= 0.85) return maxSim;
    }
    // 발화 끝단 슬라이스 추가 검사
    const tailSlice = jamoSpoken.slice(-Math.floor(windowSize * 1.2));
    const tailDist = getLevenshteinDistance(jamoTarget, tailSlice);
    const tailSim = 1 - tailDist / Math.max(jamoTarget.length, tailSlice.length);
    if (tailSim > maxSim) maxSim = tailSim;

    return maxSim;
  }

  const distance = getLevenshteinDistance(jamoTarget, jamoSpoken);
  const maxLength = Math.max(jamoTarget.length, jamoSpoken.length);
  return 1 - distance / maxLength;
}

/**
 * 발화된 텍스트가 목표 마디(구절 조각)와 일치하는지 판별합니다.
 * 허용 유사도: 75% 이상 (자모 분해 기준)
 */
export function checkChunkMatch(
  targetChunk: string,
  spokenTranscript: string,
  threshold: number = 0.75
): { isMatch: boolean; similarity: number } {
  const normTarget = normalizeText(targetChunk);
  const normSpoken = normalizeText(spokenTranscript);

  // 1. 단순 텍스트 포함 여부 (띄어쓰기 무시)
  if (normSpoken.includes(normTarget)) {
    return { isMatch: true, similarity: 1.0 };
  }

  // 2. 자모 단위 유사도 검사
  const similarity = calculateJamoSimilarity(targetChunk, spokenTranscript);
  return {
    isMatch: similarity >= threshold,
    similarity: Math.round(similarity * 100) / 100
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
      const chosungIndex = Math.floor((code - 0xAC00) / 588);
      result += CHOSUNG[chosungIndex];
    } else {
      result += text[i];
    }
  }
  return result;
}
