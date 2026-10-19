import { useState, useEffect, useRef, useCallback } from 'react';

// Web Speech API 타입 선언 확장
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

// 오디오 차임벨 재생 (성공 피드백)
export function playSuccessChime() {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playNote = (freq: number, start: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(0.12, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    // 경쾌한 C Major 아르페지오 (도-미-솔)
    playNote(523.25, now, 0.12);
    playNote(659.25, now + 0.08, 0.15);
    playNote(783.99, now + 0.16, 0.28);
  } catch {
    // 오디오 컨텍스트 제한 시 조용히 무시
  }
}

export function useSpeechRecognition() {
  const [isSupported, setIsSupported] = useState<boolean>(true);
  const [isListening, setIsListening] = useState<boolean>(false);
  const [transcript, setTranscript] = useState<string>('');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const recognitionRef = useRef<ISpeechRecognition | null>(null);
  const shouldListenRef = useRef<boolean>(false);
  const restartTimerRef = useRef<number | null>(null);

  // 음성 합성 (TTS)
  const speakText = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ko-KR';
      utterance.rate = 0.9; // 또박또박한 성경 낭독 속도
      window.speechSynthesis.speak(utterance);
    }
  }, []);

  // 지원 여부 검사
  useEffect(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setIsSupported(false);
      setErrorMessage('이 브라우저는 음성 인식을 지원하지 않습니다. Chrome, Safari 또는 모바일 브라우저를 이용해주세요.');
    }
  }, []);

  // 마이크 인식 시작
  const startListening = useCallback(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setErrorMessage('음성 인식이 지원되지 않는 환경입니다.');
      return;
    }

    setErrorMessage(null);
    shouldListenRef.current = true;

    try {
      if (recognitionRef.current) {
        recognitionRef.current.abort();
      }

      const rec = new SpeechRec();
      rec.lang = 'ko-KR';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onstart = () => {
        setIsListening(true);
      };

      rec.onresult = (event: SpeechRecognitionEvent) => {
        let currentInterim = '';
        let currentFinal = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          const text = res[0].transcript;
          if (res.isFinal) {
            currentFinal += text + ' ';
          } else {
            currentInterim += text;
          }
        }

        if (currentFinal) {
          setTranscript(prev => (prev + ' ' + currentFinal).trim());
        }
        setInterimTranscript(currentInterim);
      };

      rec.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (event.error === 'no-speech') {
          // 말소리가 잠시 멈춘 경우 무시하고 계속 진행
          return;
        }
        if (event.error === 'not-allowed') {
          setErrorMessage('마이크 접근 권한이 거부되었습니다. 브라우저 설정에서 마이크를 허용해주세요.');
          shouldListenRef.current = false;
          setIsListening(false);
        } else if (event.error === 'network') {
          setErrorMessage('네트워크 연결 상태를 확인해주세요.');
        }
      };

      rec.onend = () => {
        // 모바일 사파리/크롬에서 일정 침묵 후 자동 종료되는 현상 자동 복구
        if (shouldListenRef.current) {
          if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
          restartTimerRef.current = window.setTimeout(() => {
            if (shouldListenRef.current) {
              try {
                rec.start();
              } catch {
                // start 호출 실패 시 재시도
              }
            }
          }, 150);
        } else {
          setIsListening(false);
        }
      };

      recognitionRef.current = rec;
      rec.start();
      setIsListening(true);
    } catch (err) {
      console.error('Speech recognition start failed:', err);
      setIsListening(false);
    }
  }, []);

  // 마이크 인식 중지
  const stopListening = useCallback(() => {
    shouldListenRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // 이미 멈춘 경우 무시
      }
    }
    setIsListening(false);
  }, []);

  // 인식된 텍스트 초기화
  const resetTranscript = useCallback(() => {
    setTranscript('');
    setInterimTranscript('');
  }, []);

  // 컴포넌트 언마운트 정리
  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    isSupported,
    isListening,
    transcript,
    interimTranscript,
    fullSpokenText: (transcript + ' ' + interimTranscript).trim(),
    errorMessage,
    startListening,
    stopListening,
    resetTranscript,
    speakText,
    playSuccessChime
  };
}
