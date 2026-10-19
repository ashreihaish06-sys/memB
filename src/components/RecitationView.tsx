import { useState, useEffect, useMemo, useRef } from 'react';
import type { Verse } from '../types/verse';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import {
  toJamoText,
  matchChunk,
  getChosungHint,
  diffSpokenText,
  type JamoText,
  type DiffSegment
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
  SkipForward,
  RotateCcw,
  Sparkles,
  ChevronRight,
  AlertCircle
} from 'lucide-react';

/**
 * 통과 기준 유사도.
 * - 확정(final) 결과: 한두 단어 오인식은 허용
 * - 중간(interim) 결과: 아직 말하는 중일 수 있으므로 거의 완벽히 맞을 때만 즉시 통과
 */
const FINAL_THRESHOLD = 0.7;
const INTERIM_THRESHOLD = 0.88;

/** 채점 결과 유지 시간 (3초) */
const GRADING_HOLD_MS = 3000;

interface GradingResult {
  segments: DiffSegment[];
  similarity: number;
  passed: boolean;
}

interface RecitationViewProps {
  verse: Verse;
  onBack: () => void;
  onComplete: (verseId: number) => void;
  onNextVerse?: () => void;
  isNextAvailable?: boolean;
}

const EMPTY_SPOKEN: JamoText = { jamo: '', rawIndex: [] };

export function RecitationView({
  verse,
  onBack,
  onComplete,
  onNextVerse,
  isNextAvailable
}: RecitationViewProps) {
  const totalChunks = verse.chunks.length;
  const chunkJamo = useMemo(() => verse.chunks.map((c) => toJamoText(c).jamo), [verse]);

  const [chunkIndex, setChunkIndex] = useState<number>(0);
  const [isReciting, setIsReciting] = useState<boolean>(false);
  const [skipped, setSkipped] = useState<number[]>([]);
  const [showHint, setShowHint] = useState<boolean>(false);
  const [heardText, setHeardText] = useState<string>('');
  const [score, setScore] = useState<number>(0);
  const [gradingResult, setGradingResult] = useState<GradingResult | null>(null);

  // 음성 이벤트 콜백에서 최신 값을 읽기 위한 진행 상태
  const progressRef = useRef({ index: 0, consumed: 0 });
  const spokenRef = useRef<JamoText>(EMPTY_SPOKEN);
  const skippedRef = useRef<number[]>([]);
  const gradingTimerRef = useRef<number | null>(null);

  const isFinished = chunkIndex >= totalChunks;
  const isFullyRecited = isFinished && skipped.length === 0;

  const { isSupported, isListening, errorMessage, startListening, stopListening } =
    useSpeechRecognition({ onTranscript: (text, isFinal) => handleTranscript(text, isFinal) });

  function clearGradingTimer() {
    if (gradingTimerRef.current !== null) {
      window.clearTimeout(gradingTimerRef.current);
      gradingTimerRef.current = null;
    }
  }

  function showGradingFor3Seconds(result: GradingResult) {
    clearGradingTimer();
    setGradingResult(result);
    gradingTimerRef.current = window.setTimeout(() => {
      setGradingResult(null);
      gradingTimerRef.current = null;
    }, GRADING_HOLD_MS);
  }

  // 화면을 떠나면 낭독 및 채점 타이머 중지
  useEffect(() => {
    return () => {
      cancelSpeech();
      clearGradingTimer();
    };
  }, []);

  function finishVerse() {
    stopListening();
    if (skippedRef.current.length === 0) {
      onComplete(verse.id);
      // 폭죽은 필요한 순간에만 불러와 초기 번들을 줄인다
      void import('canvas-confetti')
        .then(({ default: confetti }) => confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } }))
        .catch(() => undefined);
    }
  }

  function handleTranscript(raw: string, isFinal: boolean) {
    const p = progressRef.current;
    if (p.index >= totalChunks) return;

    const spoken = toJamoText(raw);
    spokenRef.current = spoken;

    const threshold = isFinal ? FINAL_THRESHOLD : INTERIM_THRESHOLD;
    const prevIndex = p.index;
    let firstMatchStart = p.consumed;
    let matched = 0;
    let matchedSimilaritySum = 0;
    let lastSimilarity = 0;

    // 한 번에 여러 마디를 이어 말한 경우를 위해 연속으로 통과시킨다
    while (p.index < totalChunks) {
      const result = matchChunk(chunkJamo[p.index], spoken, p.consumed, threshold);
      lastSimilarity = result.similarity;
      if (!result.isMatch) break;
      if (matched === 0) {
        firstMatchStart = result.start;
      }
      matchedSimilaritySum += result.similarity;
      p.consumed = result.end;
      p.index += 1;
      matched += 1;
    }

    if (matched > 0) {
      playSuccessChime();
      setChunkIndex(p.index);
      setShowHint(false);

      // 방금 통과한 구간에 대해 변환된 음성 텍스트를 맞은 부분(녹색)/틀린 부분(빨간색)으로 3초간 표시
      const matchedTargetText = verse.chunks.slice(prevIndex, p.index).join(' ');
      const rawStart =
        firstMatchStart < spoken.rawIndex.length ? spoken.rawIndex[firstMatchStart] : 0;
      const rawEnd =
        p.consumed > 0 && p.consumed - 1 < spoken.rawIndex.length
          ? spoken.rawIndex[p.consumed - 1] + 1
          : raw.length;
      const matchedSpoken = raw.slice(rawStart, rawEnd).trim();
      const segments = diffSpokenText(matchedTargetText, matchedSpoken || matchedTargetText);

      showGradingFor3Seconds({
        segments,
        similarity: Math.round((matchedSimilaritySum / matched) * 100) / 100,
        passed: true
      });

      lastSimilarity = 0;
      if (p.index >= totalChunks) finishVerse();
    }

    // 아직 소비되지 않은(= 현재 마디를 위해 들린) 부분 추출
    const startRaw = p.consumed < spoken.rawIndex.length ? spoken.rawIndex[p.consumed] : raw.length;
    const currentHeard = raw.slice(startRaw).trim();

    if (matched === 0 && isFinal && currentHeard.length > 0 && p.index < totalChunks) {
      // 통과 기준 미달인 발화도 맞은 부분(녹색)/틀린 부분(빨간색)으로 3초간 채점 결과 유지
      const targetChunk = verse.chunks[p.index];
      const segments = diffSpokenText(targetChunk, currentHeard);
      showGradingFor3Seconds({
        segments,
        similarity: lastSimilarity,
        passed: false
      });

      // 마디 길이의 절반 이상을 말했으나 틀린 경우 다음 재시도를 위해 입력 버퍼를 비움
      if (spoken.jamo.length - p.consumed >= chunkJamo[p.index].length * 0.5) {
        p.consumed = spoken.jamo.length;
        setHeardText('');
        setScore(0);
        return;
      }
    }

    setScore(lastSimilarity);
    setHeardText(currentHeard);
  }

  function handleStartReciting() {
    cancelSpeech();
    setIsReciting(true);
    startListening();
  }

  // 음성이 인식되지 않을 때 현재 구간을 건너뜀 (완료 기록에는 반영되지 않음)
  function handleSkipChunk() {
    const p = progressRef.current;
    if (p.index >= totalChunks) return;

    if (!isReciting) setIsReciting(true);

    skippedRef.current = [...skippedRef.current, p.index];
    setSkipped(skippedRef.current);

    p.consumed = spokenRef.current.jamo.length; // 지금까지 들린 발화는 이 마디에 쓴 것으로 처리
    p.index += 1;
    setChunkIndex(p.index);
    setShowHint(false);
    setScore(0);
    setHeardText('');
    if (p.index >= totalChunks) finishVerse();
  }

  function handleRestart() {
    stopListening();
    clearGradingTimer();
    progressRef.current = { index: 0, consumed: spokenRef.current.jamo.length };
    skippedRef.current = [];
    setSkipped([]);
    setChunkIndex(0);
    setIsReciting(false);
    setShowHint(false);
    setScore(0);
    setHeardText('');
    setGradingResult(null);
  }

  function handleClearHeard() {
    clearGradingTimer();
    progressRef.current.consumed = spokenRef.current.jamo.length;
    setHeardText('');
    setScore(0);
    setGradingResult(null);
  }

  // 낭독 음성이 마이크로 다시 인식되지 않도록 듣기 중이면 마이크부터 끈다
  function handleSpeak(text: string) {
    if (isListening) stopListening();
    speak(text);
  }

  function handleBack() {
    stopListening();
    cancelSpeech();
    clearGradingTimer();
    onBack();
  }

  const currentChunk = verse.chunks[chunkIndex] ?? '';
  const liveDiffSegments = useMemo(
    () => (heardText && currentChunk ? diffSpokenText(currentChunk, heardText) : []),
    [currentChunk, heardText]
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
          {/* 진행 게이지 */}
          <div className="mb-4">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-500 mb-1.5">
              <span>{isReciting ? '암송 진행도' : '전체 구절 확인'}</span>
              <span className="text-indigo-600">
                {Math.round((Math.min(chunkIndex, totalChunks) / totalChunks) * 100)}%
              </span>
            </div>
            <div className="flex space-x-1.5">
              {verse.chunks.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                    idx < chunkIndex
                      ? skipped.includes(idx)
                        ? 'bg-amber-400'
                        : 'bg-emerald-500'
                      : isReciting && idx === chunkIndex
                      ? 'bg-indigo-500 animate-pulse'
                      : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
          </div>

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
            /* 암송 종료 카드 */
            <div
              className={`bg-white rounded-3xl p-6 border shadow-lg text-center my-4 animate-fade-in ${
                isFullyRecited ? 'border-emerald-200' : 'border-amber-200'
              }`}
            >
              <div
                className={`w-16 h-16 rounded-2xl mx-auto flex items-center justify-center mb-4 shadow-inner ${
                  isFullyRecited ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'
                }`}
              >
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">
                {isFullyRecited ? '구절 암송 완성!' : '한 번 더 도전해볼까요?'}
              </h3>
              <p
                className={`text-xs font-semibold mb-4 ${
                  isFullyRecited ? 'text-emerald-600' : 'text-amber-600'
                }`}
              >
                {isFullyRecited
                  ? '마음에 하나님의 말씀이 새겨졌습니다.'
                  : `건너뛴 구간이 ${skipped.length}개 있어 완료로 기록되지 않았어요.`}
              </p>

              <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-100 mb-6">
                <p className="text-xs font-bold text-indigo-700 mb-1">{verse.reference}</p>
                <p className="text-sm font-medium text-slate-800 leading-relaxed">{verse.text}</p>
              </div>

              <div className="flex space-x-2">
                <button
                  onClick={handleRestart}
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
            /* 1) 암송 시작 전: 전체 문장을 한 번에 제시 */
            <div className="p-6 rounded-3xl bg-white border border-slate-200 shadow-sm my-2 animate-fade-in">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                  전체 구절
                </span>
                <span className="text-xs text-slate-400">
                  암송 버튼을 누르면 문장이 가려집니다
                </span>
              </div>
              <p className="text-lg sm:text-xl font-bold text-slate-900 leading-relaxed tracking-wide break-keep">
                {verse.text}
              </p>
            </div>
          ) : (
            /* 2) 암송 중: 제시된 문장이 사라지고, 내부적으로 맞춘 부분만 순차 표시 */
            <div className="p-6 rounded-3xl bg-white border-2 border-indigo-500 shadow-md shadow-indigo-100 my-2 transition-all">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full flex items-center space-x-1">
                  <Check className="w-3.5 h-3.5" />
                  <span>암송 중 ({chunkIndex} / {totalChunks})</span>
                </span>
                <button
                  onClick={handleRestart}
                  className="text-xs text-slate-500 hover:text-indigo-600 flex items-center space-x-1 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>본문 다시 보기</span>
                </button>
              </div>

              <div className="min-h-[6rem] flex flex-col justify-center">
                <p className="text-lg sm:text-xl font-bold leading-relaxed tracking-wide break-keep">
                  {verse.chunks.map((chunk, idx) => {
                    if (idx < chunkIndex) {
                      const wasSkipped = skipped.includes(idx);
                      return (
                        <span
                          key={idx}
                          className={`inline transition-all duration-300 ${
                            wasSkipped ? 'text-amber-600' : 'text-emerald-700'
                          }`}
                        >
                          {chunk}{' '}
                        </span>
                      );
                    }
                    if (idx === chunkIndex && showHint) {
                      return (
                        <span
                          key={idx}
                          className="inline font-mono text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-lg text-base tracking-widest"
                        >
                          {getChosungHint(currentChunk)}{' '}
                        </span>
                      );
                    }
                    return null;
                  })}
                  {chunkIndex === 0 && !showHint && (
                    <span className="text-slate-400 text-sm font-normal">
                      문장이 가려졌습니다. 처음부터 소리 내어 암송해보세요. (맞춘 부분이 차례대로 나타납니다)
                    </span>
                  )}
                </p>
              </div>

              {score > 0 && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                  <span>현재 구간 음성 일치도</span>
                  <span className="font-semibold text-indigo-600">{Math.round(score * 100)}%</span>
                </div>
              )}
            </div>
          )}

          {/* 채점 결과 표시 (3초간 유지: 맞은 부분 녹색 / 틀린 부분 빨간색) */}
          {gradingResult && (
            <div
              role="status"
              aria-live="polite"
              className={`mt-3 p-4 rounded-2xl border-2 shadow-sm transition-all animate-fade-in ${
                gradingResult.passed
                  ? 'bg-emerald-50/60 border-emerald-300'
                  : 'bg-rose-50/60 border-rose-300'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      gradingResult.passed
                        ? 'bg-emerald-600 text-white'
                        : 'bg-rose-600 text-white'
                    }`}
                  >
                    {gradingResult.passed ? '구간 통과' : '재도전 필요'} · {Math.round(gradingResult.similarity * 100)}%
                  </span>
                  <span className="text-[11px] font-semibold text-slate-500">
                    채점 결과 (3초간 표시)
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
              <p className="text-base font-bold leading-relaxed break-keep bg-white/90 rounded-xl px-3 py-2 border border-slate-200/80">
                {gradingResult.segments.map((seg, i) => (
                  <span
                    key={i}
                    className={
                      seg.correct
                        ? 'text-emerald-700 bg-emerald-100/70 rounded-xs px-0.5'
                        : 'text-rose-600 bg-rose-100/80 underline decoration-rose-400 rounded-xs px-0.5'
                    }
                  >
                    {seg.text}
                  </span>
                ))}
              </p>
            </div>
          )}
        </div>

        {/* 실시간 음성 인식 및 채점 텍스트 */}
        {!isFinished && (
          <div className="mt-4">
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-500 flex items-center space-x-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isListening ? 'bg-indigo-600 animate-ping' : 'bg-slate-300'
                    }`}
                  />
                  <span>
                    {isListening
                      ? '실시간 음성 변환 및 채점 중...'
                      : isReciting
                      ? '마이크가 일시 중지되었습니다'
                      : '구절을 숙지한 뒤 아래 암송 버튼을 눌러주세요'}
                  </span>
                </span>
                <div className="flex items-center space-x-2">
                  {heardText && (
                    <span className="text-[11px] font-semibold">
                      <span className="text-emerald-600">녹색: 맞음</span>
                      <span className="text-slate-300 mx-1">|</span>
                      <span className="text-rose-600">빨간색: 틀림</span>
                    </span>
                  )}
                  {(heardText || gradingResult) && (
                    <button
                      onClick={handleClearHeard}
                      className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      비우기
                    </button>
                  )}
                </div>
              </div>
              <p className="text-sm font-medium text-slate-800 min-h-[1.5rem] break-keep">
                {heardText && liveDiffSegments.length > 0 ? (
                  <span className="font-bold">
                    "
                    {liveDiffSegments.map((seg, i) => (
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
                    {isReciting
                      ? '외운 말씀을 말하면 텍스트로 변환되어 맞은 부분은 녹색, 틀린 부분은 빨간색으로 표시됩니다.'
                      : '암송 버튼을 누르면 위 문장이 사라지고 음성 인식이 시작됩니다.'}
                  </span>
                )}
              </p>
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
                onClick={isListening ? stopListening : handleStartReciting}
                disabled={!isSupported}
                aria-label={isListening ? '음성 인식 중지' : '암송 시작'}
                aria-pressed={isListening}
                className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-xl transition-all cursor-pointer transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                  isListening
                    ? 'bg-rose-500 shadow-rose-200 animate-mic-pulse'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-300'
                }`}
              >
                {isListening ? <Mic className="w-7 h-7" /> : <MicOff className="w-7 h-7" />}
              </button>
              <span className="absolute bottom-0 left-1/2 -translate-x-1/2 text-[11px] font-bold text-slate-500 whitespace-nowrap">
                {isListening ? '암송 중 (터치 시 일시정지)' : isReciting ? '이어서 암송' : '암송 시작'}
              </span>
            </div>

            {/* 마디 건너뛰기 버튼 */}
            <button
              onClick={handleSkipChunk}
              className="flex flex-col items-center justify-center p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer w-16"
              title="음성 인식이 잘 안 될 때 현재 구간을 건너뜁니다 (완료 기록에는 반영되지 않음)"
            >
              <SkipForward className="w-5 h-5 mb-0.5 text-slate-600" />
              <span className="text-[11px] font-medium">건너뛰기</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
