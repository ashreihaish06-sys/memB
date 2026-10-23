import { useState, useEffect, useMemo, useRef } from 'react';
import type { Verse } from '../types/verse';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import {
  getChosungHint,
  evaluateVerse,
  removeConsecutiveDuplicates,
  type VerseEvaluation
} from '../utils/hangulMatcher';
import { playSuccessChime } from '../utils/sound';
import { speak, cancelSpeech } from '../utils/tts';
import {
  ArrowLeft,
  Mic,
  MicOff,
  Volume2,
  Check,
  Lightbulb,
  RotateCcw,
  Sparkles,
  ChevronRight,
  AlertCircle,
  Eye,
  EyeOff,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';

interface RecitationViewProps {
  verse: Verse;
  onBack: () => void;
  onComplete: (verseId: number) => void;
  onNextVerse?: () => void;
  isNextAvailable?: boolean;
}

export function RecitationView({
  verse,
  onBack,
  onComplete,
  onNextVerse,
  isNextAvailable
}: RecitationViewProps) {
  // 암송 진행 상태
  const [isReciting, setIsReciting] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [showPeek, setShowPeek] = useState<boolean>(false);
  const [heardText, setHeardText] = useState<string>('');

  // 채점 및 5초 대기 상태
  const [isGrading, setIsGrading] = useState<boolean>(false);
  const [gradingResult, setGradingResult] = useState<VerseEvaluation | null>(null);
  const [countdown, setCountdown] = useState<number>(5);

  const countdownIntervalRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const latestHeardRef = useRef<string>('');
  const isGradingRef = useRef<boolean>(false);

  useEffect(() => {
    isGradingRef.current = isGrading;
  }, [isGrading]);

  const {
    isSupported,
    isListening,
    errorMessage,
    startListening,
    stopListening,
    resetTranscript
  } = useSpeechRecognition({
    onTranscript: (text, isFinal) => handleTranscript(text, isFinal)
  });

  function clearCountdownTimer() {
    if (countdownIntervalRef.current !== null) {
      window.clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }

  function clearSilenceTimer() {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }

  // 화면을 떠나면 음성 낭독 및 타이머 모두 정리
  useEffect(() => {
    return () => {
      cancelSpeech();
      clearCountdownTimer();
      clearSilenceTimer();
    };
  }, []);

  /** 채점 완료 후 맞았을 때 다음 단계로 넘어가기 */
  function handlePassNext() {
    clearCountdownTimer();
    clearSilenceTimer();
    setIsGrading(false);
    onComplete(verse.id);

    if (isNextAvailable && onNextVerse) {
      onNextVerse();
    } else {
      setIsFinished(true);
    }
  }

  /** 채점 완료 후 틀렸을 때 처음부터 다시 시도 */
  function handleFailRetry() {
    clearCountdownTimer();
    clearSilenceTimer();
    setIsGrading(false);
    setGradingResult(null);
    setHeardText('');
    latestHeardRef.current = '';
    resetTranscript();
    startListening();
  }

  /** 5초 대기 타이머와 함께 채점 시작 */
  function startGrading(evaluation: VerseEvaluation) {
    if (isGradingRef.current) return;
    setIsGrading(true);
    setGradingResult(evaluation);
    clearSilenceTimer();
    stopListening();

    if (evaluation.passed) {
      playSuccessChime();
      void import('canvas-confetti')
        .then(({ default: confetti }) =>
          confetti({ particleCount: 70, spread: 65, origin: { y: 0.6 } })
        )
        .catch(() => undefined);
    }

    setCountdown(5);
    clearCountdownTimer();

    let remaining = 5;
    countdownIntervalRef.current = window.setInterval(() => {
      remaining -= 1;
      setCountdown(remaining);
      if (remaining <= 0) {
        clearCountdownTimer();
        if (evaluation.passed) {
          handlePassNext();
        } else {
          handleFailRetry();
        }
      }
    }, 1000);
  }

  /** 실시간 음성 수신 핸들러 */
  function handleTranscript(raw: string, isFinal: boolean) {
    if (isGradingRef.current || isFinished) return;
    const trimmed = removeConsecutiveDuplicates(raw.trim());
    latestHeardRef.current = trimmed;
    setHeardText(trimmed);

    if (!trimmed) return;

    const evaluation = evaluateVerse(verse.text, trimmed);

    // 1) 발화 도중이라도 암송 기준(75% 이상)을 만족하면 즉시 합격 채점 시작
    if (evaluation.passed) {
      clearSilenceTimer();
      startGrading(evaluation);
      return;
    }

    // 2) 발화가 일단락(isFinal)되었고, 구절의 70% 이상 발화했을 때 3.5초 침묵 시 자동 채점
    // (사용자가 중간에 생각하느라 잠시 멈추었을 때 조기 탈락되는 것을 방지)
    clearSilenceTimer();
    if (isFinal && evaluation.spokenChars >= evaluation.targetChars * 0.7) {
      silenceTimerRef.current = window.setTimeout(() => {
        silenceTimerRef.current = null;
        if (!isGradingRef.current && latestHeardRef.current) {
          const finalEval = evaluateVerse(verse.text, latestHeardRef.current);
          startGrading(finalEval);
        }
      }, 3500);
    }
  }

  /** 사용자가 수동으로 "채점하기" 버튼을 눌렀을 때 */
  function handleManualGrade() {
    if (isGrading || isFinished) return;
    const spoken = latestHeardRef.current.trim();
    const evaluation = evaluateVerse(verse.text, spoken);
    startGrading(evaluation);
  }

  /** 암송 시작 */
  function handleStartReciting() {
    cancelSpeech();
    clearCountdownTimer();
    clearSilenceTimer();
    setIsGrading(false);
    setGradingResult(null);
    setHeardText('');
    latestHeardRef.current = '';
    resetTranscript();
    setIsReciting(true);
    startListening();
  }

  /** 초기 상태로 전체 다시 시작 */
  function handleRestartAll() {
    stopListening();
    cancelSpeech();
    clearCountdownTimer();
    clearSilenceTimer();
    resetTranscript();
    setIsGrading(false);
    setGradingResult(null);
    setHeardText('');
    latestHeardRef.current = '';
    setShowHint(false);
    setShowPeek(false);
    setIsFinished(false);
    setIsReciting(false);
  }

  function handleSpeak(text: string) {
    if (isListening) stopListening();
    speak(text);
  }

  function handleBack() {
    stopListening();
    cancelSpeech();
    clearCountdownTimer();
    clearSilenceTimer();
    onBack();
  }

  // 실시간 발화 중 맞은 부분(녹색)과 틀린 부분(빨간색) 분리
  const liveEvaluation = useMemo(
    () => (heardText ? evaluateVerse(verse.text, heardText) : null),
    [verse.text, heardText]
  );

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs">
        <button
          onClick={handleBack}
          className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 -ml-1 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">목록</span>
        </button>

        <div className="text-center">
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
            #{verse.id} {verse.subCategory}
          </span>
          <h2 className="text-base font-bold text-slate-900 leading-tight">{verse.reference}</h2>
        </div>

        <button
          onClick={() => handleSpeak(verse.text)}
          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
          title="구절 전체 소리내어 듣기"
          aria-label="구절 전체 소리내어 듣기"
        >
          <Volume2 className="w-5 h-5" />
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 flex flex-col justify-between pb-36">
        <div>
          {/* 에러 메시지 알림 (마이크 미지원 등) */}
          {errorMessage && (
            <div
              role="alert"
              className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-2.5 text-xs text-rose-700"
            >
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {isFinished ? (
            /* 암송 완료 축하 카드 */
            <div className="bg-white rounded-3xl p-6 border-2 border-emerald-300 shadow-lg text-center my-4 animate-fade-in">
              <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4 bg-emerald-100 text-emerald-600 shadow-inner">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">구절 암송 완성!</h3>
              <p className="text-xs font-semibold text-emerald-600 mb-4">
                마음에 하나님의 말씀이 온전히 새겨졌습니다.
              </p>

              <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-100 mb-6">
                <p className="text-xs font-bold text-indigo-700 mb-1">{verse.reference}</p>
                <p className="text-sm font-medium text-slate-800 leading-relaxed">{verse.text}</p>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={handleRestartAll}
                  className="flex-1 py-3 px-4 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm hover:bg-slate-50 flex items-center justify-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>다시 암송</span>
                </button>

                {isNextAvailable && onNextVerse && (
                  <button
                    onClick={onNextVerse}
                    className="flex-1 py-3 px-4 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 flex items-center justify-center space-x-1.5 shadow-md shadow-indigo-200 transition-all cursor-pointer"
                  >
                    <span>다음 구절</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ) : !isReciting ? (
            /* 1) 암송 시작 전: 전체 문장을 한눈에 제시 */
            <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm my-2 animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                  전체 구절 암송
                </span>
                <span className="text-xs text-slate-400">
                  암송 시작을 누르면 문장이 가려집니다
                </span>
              </div>
              <p className="text-lg sm:text-xl font-bold text-slate-900 leading-relaxed tracking-wide break-keep">
                {verse.text}
              </p>
              <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center space-x-1">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  <span>문장 전체를 기억한 후 아래 버튼을 누르세요</span>
                </span>
                <button
                  onClick={() => handleSpeak(verse.text)}
                  className="text-indigo-600 font-semibold hover:underline flex items-center space-x-1 cursor-pointer"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>음성으로 듣기</span>
                </button>
              </div>
            </div>
          ) : (
            /* 2) 암송 중: 전체 구절이 가려지고 음성으로 암송 */
            <div className="p-6 rounded-3xl bg-white border-2 border-indigo-500 shadow-md shadow-indigo-100 my-2 transition-all">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full flex items-center space-x-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>전체 구절 암송 중</span>
                </span>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowPeek((prev) => !prev)}
                    className="text-xs text-slate-500 hover:text-indigo-600 flex items-center space-x-1 cursor-pointer px-2 py-1 rounded-lg hover:bg-slate-50"
                    title={showPeek ? '본문 가리기' : '본문 잠시 엿보기'}
                  >
                    {showPeek ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    <span>{showPeek ? '가리기' : '잠시 보기'}</span>
                  </button>
                  <button
                    onClick={handleRestartAll}
                    className="text-xs text-slate-500 hover:text-indigo-600 flex items-center space-x-1 cursor-pointer px-2 py-1 rounded-lg hover:bg-slate-50"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>처음으로</span>
                  </button>
                </div>
              </div>

              {/* 암송 텍스트 영역 (가려짐 / 힌트 / 엿보기) */}
              <div className="min-h-[5.5rem] flex flex-col justify-center">
                {showPeek ? (
                  <p className="text-base sm:text-lg font-bold text-slate-700 leading-relaxed break-keep bg-amber-50/70 p-3 rounded-2xl border border-amber-200">
                    {verse.text}
                  </p>
                ) : showHint ? (
                  <div className="bg-amber-50/70 p-3.5 rounded-2xl border border-amber-200">
                    <span className="text-[11px] font-bold text-amber-700 block mb-1">
                      💡 초성 힌트:
                    </span>
                    <p className="font-mono text-base text-amber-900 tracking-widest leading-relaxed break-keep">
                      {getChosungHint(verse.text)}
                    </p>
                  </div>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-slate-400 text-sm font-medium">
                      구절이 가려졌습니다. 마이크를 켜고 말씀 전체를 암송해보세요.
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      (다 외운 후 잠시 멈추거나 아래 '채점하기'를 누르면 채점됩니다)
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 3) 채점 결과 카드 (5초 동안 유지: 맞은 부분 녹색 / 틀린 부분 빨간색) */}
          {gradingResult && (
            <div
              role="status"
              aria-live="polite"
              className={`mt-3 p-4 sm:p-5 rounded-3xl border-2 shadow-md transition-all animate-fade-in ${
                gradingResult.passed
                  ? 'bg-emerald-50/80 border-emerald-400'
                  : 'bg-rose-50/80 border-rose-400'
              }`}
            >
              {/* 채점 헤더 및 5초 카운트다운 */}
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-2">
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full text-white shadow-xs ${
                      gradingResult.passed ? 'bg-emerald-600' : 'bg-rose-600'
                    }`}
                  >
                    {gradingResult.passed ? '🎉 암송 통과' : '⚠️ 재도전 필요'} · 일치율 {gradingResult.accuracy}%
                  </span>
                  <span className="text-xs font-bold text-slate-600">
                    {gradingResult.passed
                      ? `${countdown}초 후 다음으로 이동`
                      : `${countdown}초 후 다시 시작`}
                  </span>
                </div>
                <div className="flex items-center space-x-2 text-[11px] font-bold">
                  <span className="text-emerald-700 flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    <span>맞음</span>
                  </span>
                  <span className="text-rose-600 flex items-center space-x-1">
                    <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
                    <span>틀림</span>
                  </span>
                </div>
              </div>

              {/* 5초 진행 바 게이지 */}
              <div className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden mb-3">
                <div
                  className={`h-full transition-all duration-1000 ease-linear rounded-full ${
                    gradingResult.passed ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                  style={{ width: `${Math.max(0, (countdown / 5) * 100)}%` }}
                />
              </div>

              {/* 녹색/빨간색으로 변환된 발화 텍스트 채점 표시 */}
              <div className="bg-white/95 rounded-2xl p-3.5 border border-slate-200/90 shadow-inner mb-3">
                <span className="text-[11px] font-bold text-slate-500 block mb-1">
                  내 암송 발화 채점:
                </span>
                <p className="text-base sm:text-lg font-bold leading-relaxed break-keep">
                  {gradingResult.segments.map((seg, i) => (
                    <span
                      key={i}
                      className={
                        seg.correct
                          ? 'text-emerald-700 bg-emerald-100/70 rounded-xs px-0.5'
                          : 'text-rose-600 bg-rose-100/90 underline decoration-rose-400 rounded-xs px-0.5'
                      }
                    >
                      {seg.text}
                    </span>
                  ))}
                </p>
              </div>

              {/* 원문 말씀과 대조 */}
              <div className="bg-white/80 rounded-2xl p-3 border border-slate-200/70 text-xs mb-3">
                <p className="font-bold text-slate-600 mb-0.5">원문 구절 ({verse.reference}):</p>
                <p className="text-slate-800 font-medium leading-relaxed">{verse.text}</p>
              </div>

              {/* 5초 대기 중 즉시 실행 버튼 */}
              <div>
                {gradingResult.passed ? (
                  <button
                    onClick={handlePassNext}
                    className="w-full py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md shadow-emerald-200 flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <span>지금 바로 넘어가기 ({countdown}초)</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button
                    onClick={handleFailRetry}
                    className="w-full py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm shadow-md shadow-rose-200 flex items-center justify-center space-x-1.5 transition-all cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>지금 바로 다시하기 ({countdown}초)</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 4) 실시간 음성 인식 및 채점 텍스트 창 (암송 진행 중) */}
        {!isFinished && isReciting && !isGrading && (
          <div className="mt-4">
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-slate-500 flex items-center space-x-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isListening ? 'bg-indigo-600 animate-ping' : 'bg-slate-300'
                    }`}
                  />
                  <span>
                    {isListening
                      ? '실시간 음성 변환 중... (외운 후 채점하기를 누르세요)'
                      : '마이크가 일시 중지되었습니다'}
                  </span>
                </span>
                {liveEvaluation && liveEvaluation.spokenChars > 0 && (
                  <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                    일치율 {liveEvaluation.accuracy}%
                  </span>
                )}
              </div>

              <p className="text-sm font-medium text-slate-800 min-h-[1.75rem] break-keep">
                {liveEvaluation && liveEvaluation.spokenChars > 0 ? (
                  <span className="font-bold">
                    "
                    {liveEvaluation.segments.map((seg, i) => (
                      <span
                        key={i}
                        className={
                          seg.correct
                            ? 'text-emerald-600 bg-emerald-50 rounded-xs'
                            : 'text-rose-600 bg-rose-50 underline decoration-rose-400 rounded-xs'
                        }
                      >
                        {seg.text}
                      </span>
                    ))}
                    "
                  </span>
                ) : (
                  <span className="text-slate-400 text-xs">
                    외운 말씀을 말씀하시면 텍스트로 변환되어 맞은 부분은 녹색, 틀린 부분은 빨간색으로 표시됩니다.
                  </span>
                )}
              </p>

              {/* 채점하기 즉시 버튼 */}
              {heardText && (
                <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-400">
                    <span className="text-emerald-600 font-bold">녹색: 맞음</span>
                    <span className="text-slate-300 mx-1">|</span>
                    <span className="text-rose-600 font-bold">빨간색: 틀림</span>
                  </span>
                  <button
                    onClick={handleManualGrade}
                    className="py-1 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    채점하기
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Floating Bottom Control Bar */}
      {!isFinished && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] z-30 shadow-lg">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            {/* 힌트 버튼 */}
            <button
              onClick={() => {
                if (!isReciting) setIsReciting(true);
                setShowHint((prev) => !prev);
              }}
              className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors cursor-pointer w-16 ${
                showHint ? 'text-amber-600 bg-amber-50' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Lightbulb className="w-5 h-5 mb-0.5" />
              <span className="text-[11px] font-medium">초성 힌트</span>
            </button>

            {/* 마이크 메인 버튼 */}
            <div className="relative pb-5">
              <button
                onClick={
                  isGrading
                    ? undefined
                    : isListening
                    ? handleManualGrade
                    : isReciting
                    ? startListening
                    : handleStartReciting
                }
                disabled={!isSupported || isGrading}
                aria-label={
                  isGrading
                    ? '채점 결과 확인 중'
                    : isListening
                    ? '암송 마치고 채점하기'
                    : '암송 시작'
                }
                aria-pressed={isListening}
                className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-xl transition-all cursor-pointer transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                  isGrading
                    ? gradingResult?.passed
                      ? 'bg-emerald-600 shadow-emerald-200'
                      : 'bg-rose-600 shadow-rose-200'
                    : isListening
                    ? 'bg-rose-500 shadow-rose-200 animate-mic-pulse'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-300'
                }`}
              >
                {isGrading ? (
                  <Check className="w-7 h-7" />
                ) : isListening ? (
                  <Mic className="w-7 h-7" />
                ) : (
                  <MicOff className="w-7 h-7" />
                )}
              </button>
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[11px] font-bold text-slate-500 whitespace-nowrap">
                {isGrading
                  ? `채점 확인 중 (${countdown}s)`
                  : isListening
                  ? '터치 시 채점'
                  : isReciting
                  ? '이어서 암송'
                  : '암송 시작'}
              </span>
            </div>

            {/* 다시 하기 / 도움말 버튼 */}
            {isReciting ? (
              <button
                onClick={handleRestartAll}
                className="flex flex-col items-center justify-center p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer w-16"
                title="처음부터 다시 암송합니다"
              >
                <RotateCcw className="w-5 h-5 mb-0.5 text-slate-600" />
                <span className="text-[11px] font-medium">다시 시작</span>
              </button>
            ) : (
              <button
                onClick={() => handleSpeak(verse.text)}
                className="flex flex-col items-center justify-center p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer w-16"
                title="말씀 듣기"
              >
                <HelpCircle className="w-5 h-5 mb-0.5 text-slate-600" />
                <span className="text-[11px] font-medium">말씀 듣기</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
