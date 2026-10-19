import { useState, useEffect, useRef, useCallback } from 'react';
import { unlockAudio } from '../utils/sound';

// Web Speech API 타입 선언
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface ISpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => ISpeechRecognition;
    webkitSpeechRecognition?: new () => ISpeechRecognition;
  }
}

const RecognitionImpl =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined;

export const isSpeechRecognitionSupported = Boolean(RecognitionImpl);

const MESSAGES = {
  unsupported:
    '이 브라우저는 음성 인식을 지원하지 않습니다. 안드로이드는 Chrome, 아이폰은 Safari로 접속해주세요.',
  denied: '마이크 접근 권한이 거부되었습니다. 브라우저(또는 사이트) 설정에서 마이크를 허용해주세요.',
  service:
    '이 환경에서는 음성 인식을 사용할 수 없습니다. 홈 화면 앱이 아닌 Safari/Chrome 브라우저에서 직접 접속해보세요.',
  noMic: '마이크를 찾을 수 없습니다. 마이크 연결 상태를 확인해주세요.',
  network: '음성 인식에는 인터넷 연결이 필요합니다. 네트워크 상태를 확인해주세요.',
  language: '이 기기는 한국어 음성 인식을 지원하지 않습니다.',
  unstable: '음성 인식이 계속 끊기고 있습니다. 잠시 후 마이크 버튼을 다시 눌러주세요.'
} as const;

/** 10초 안에 이 횟수보다 많이 연속 자동 재시작되면 무한 재시작으로 보고 중단 */
const MAX_RESTARTS_PER_WINDOW = 8;
const RESTART_WINDOW_MS = 10_000;
const RESTART_DELAY_MS = 250;

interface Options {
  /**
   * 인식 결과가 갱신될 때마다 호출됩니다.
   * @param text    마이크를 켠 이후(자동 재시작 포함) 누적된 전체 발화 텍스트
   * @param isFinal 가장 최근 구간이 확정(final) 결과인지 여부
   */
  onTranscript?: (text: string, isFinal: boolean) => void;
}

export function useSpeechRecognition({ onTranscript }: Options = {}) {
  const [isListening, setIsListening] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(
    isSpeechRecognitionSupported ? null : MESSAGES.unsupported
  );

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const wantListeningRef = useRef<boolean>(false);
  const restartTimerRef = useRef<number | null>(null);
  const textRef = useRef<string>(''); // 지금까지의 전체 발화 (인스턴스 재시작 간에도 이어짐)
  const restartStatsRef = useRef({ since: 0, count: 0 });
  const onTranscriptRef = useRef(onTranscript);
  const spawnRef = useRef<() => void>(() => undefined); // 자동 재시작 타이머에서 최신 spawn 을 호출하기 위한 참조

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  });

  const detach = useCallback((rec: ISpeechRecognition) => {
    rec.onstart = null;
    rec.onend = null;
    rec.onerror = null;
    rec.onresult = null;
  }, []);

  const clearRestartTimer = useCallback(() => {
    if (restartTimerRef.current !== null) {
      window.clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
  }, []);

  /** 의도적 종료: 이벤트를 모두 끊고 즉시 중단 */
  const halt = useCallback(() => {
    wantListeningRef.current = false;
    clearRestartTimer();
    const rec = recognitionRef.current;
    recognitionRef.current = null;
    if (rec) {
      detach(rec);
      try {
        rec.abort();
      } catch {
        // 이미 종료된 경우 무시
      }
    }
    setIsListening(false);
  }, [clearRestartTimer, detach]);

  /** 새 인식 인스턴스를 만들어 시작 (이전 인스턴스가 있으면 먼저 정리해 중복 인식 방지) */
  const spawn = useCallback(() => {
    if (!RecognitionImpl) return;

    const previous = recognitionRef.current;
    if (previous) {
      detach(previous);
      try {
        previous.abort();
      } catch {
        // ignore
      }
    }

    const rec = new RecognitionImpl();
    rec.lang = 'ko-KR';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    const baseText = textRef.current;

    rec.onstart = () => {
      if (recognitionRef.current === rec) setIsListening(true);
    };

    rec.onresult = (event: SpeechRecognitionEvent) => {
      if (recognitionRef.current !== rec) return;
      restartStatsRef.current.count = 0; // 정상적으로 결과가 오고 있으면 재시작 카운터 초기화

      // resultIndex 이후만 이어 붙이면 모바일 Chrome에서 누락/중복이 생기므로
      // 이 인스턴스의 결과 전체를 매번 다시 조립한다.
      let current = '';
      for (let i = 0; i < event.results.length; i++) {
        current += event.results[i][0].transcript + ' ';
      }
      current = current.trim();

      const last = event.results[event.results.length - 1];
      const full = baseText ? `${baseText} ${current}` : current;
      textRef.current = full;
      onTranscriptRef.current?.(full, Boolean(last?.isFinal));
    };

    rec.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (recognitionRef.current !== rec) return;
      switch (event.error) {
        case 'no-speech': // 말이 잠시 없었던 것 — onend 에서 자동 재시작
        case 'aborted':
          return;
        case 'not-allowed':
          setErrorMessage(MESSAGES.denied);
          halt();
          return;
        case 'service-not-allowed':
          setErrorMessage(MESSAGES.service);
          halt();
          return;
        case 'audio-capture':
          setErrorMessage(MESSAGES.noMic);
          halt();
          return;
        case 'language-not-supported':
          setErrorMessage(MESSAGES.language);
          halt();
          return;
        case 'network':
          setErrorMessage(MESSAGES.network);
          return; // 재시작 한도 안에서 계속 재시도
        default:
          setErrorMessage(`음성 인식 오류가 발생했습니다. (${event.error})`);
      }
    };

    rec.onend = () => {
      if (recognitionRef.current !== rec) return;

      if (!wantListeningRef.current) {
        recognitionRef.current = null;
        setIsListening(false);
        return;
      }

      // 브라우저는 침묵이 이어지면 스스로 인식을 끝낸다 → 자동 재시작 (과도한 반복은 차단)
      const stats = restartStatsRef.current;
      const now = Date.now();
      if (now - stats.since > RESTART_WINDOW_MS) {
        stats.since = now;
        stats.count = 0;
      }
      stats.count += 1;
      if (stats.count > MAX_RESTARTS_PER_WINDOW) {
        setErrorMessage((prev) => prev ?? MESSAGES.unstable);
        halt();
        return;
      }

      clearRestartTimer();
      restartTimerRef.current = window.setTimeout(() => {
        restartTimerRef.current = null;
        if (wantListeningRef.current && recognitionRef.current === rec) spawnRef.current();
      }, RESTART_DELAY_MS);
    };

    recognitionRef.current = rec;
    try {
      rec.start();
    } catch (err) {
      console.error('Speech recognition start failed:', err);
      setErrorMessage(MESSAGES.service);
      halt();
    }
  }, [clearRestartTimer, detach, halt]);

  useEffect(() => {
    spawnRef.current = spawn;
  }, [spawn]);

  const startListening = useCallback(() => {
    if (!RecognitionImpl) {
      setErrorMessage(MESSAGES.unsupported);
      return;
    }
    if (wantListeningRef.current) return;

    unlockAudio(); // 터치 제스처 안에서 효과음용 오디오를 깨워둠
    setErrorMessage(null);
    wantListeningRef.current = true;
    restartStatsRef.current = { since: Date.now(), count: 0 };
    spawn();
  }, [spawn]);

  const stopListening = useCallback(() => {
    wantListeningRef.current = false;
    clearRestartTimer();
    const rec = recognitionRef.current;
    if (rec) {
      try {
        rec.stop();
      } catch {
        // ignore
      }
    }
    setIsListening(false);
  }, [clearRestartTimer]);

  // 앱이 백그라운드로 가면 마이크를 끈다 (배터리·개인정보)
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden && wantListeningRef.current) stopListening();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [stopListening]);

  // 언마운트 시 정리
  useEffect(() => {
    return () => {
      wantListeningRef.current = false;
      if (restartTimerRef.current !== null) window.clearTimeout(restartTimerRef.current);
      const rec = recognitionRef.current;
      recognitionRef.current = null;
      if (rec) {
        rec.onstart = null;
        rec.onend = null;
        rec.onerror = null;
        rec.onresult = null;
        try {
          rec.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    isSupported: isSpeechRecognitionSupported,
    isListening,
    errorMessage,
    startListening,
    stopListening
  };
}
