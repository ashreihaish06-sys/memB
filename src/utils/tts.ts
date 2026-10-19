/** 브라우저 음성합성(TTS)으로 한국어 낭독. 지원하지 않으면 아무 일도 하지 않습니다. */
export function speak(text: string): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ko-KR';
  utterance.rate = 0.9; // 또박또박한 성경 낭독 속도

  // 기기에 한국어 음성이 있으면 명시적으로 지정 (없으면 lang 기반 기본 음성)
  const korean = window.speechSynthesis.getVoices().find((v) => v.lang.toLowerCase().startsWith('ko'));
  if (korean) utterance.voice = korean;

  window.speechSynthesis.speak(utterance);
}

export function cancelSpeech(): void {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

