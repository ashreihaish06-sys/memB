import { useState, useEffect, useRef } from 'react';
import type { Verse } from '../types/verse';
import { useSpeechRecognition, playSuccessChime } from '../hooks/useSpeechRecognition';
import { checkChunkMatch, getChosungHint } from '../utils/hangulMatcher';
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
import confetti from 'canvas-confetti';

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
  const [currentChunkIndex, setCurrentChunkIndex] = useState<number>(0);
  const [completedChunks, setCompletedChunks] = useState<boolean[]>(() =>
    new Array(verse.chunks.length).fill(false)
  );
  const [showHint, setShowHint] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [lastMatchScore, setLastMatchScore] = useState<number>(0);

  const {
    isSupported,
    isListening,
    fullSpokenText,
    errorMessage,
    startListening,
    stopListening,
    resetTranscript,
    speakText
  } = useSpeechRecognition();

  const currentChunk = verse.chunks[currentChunkIndex] || '';
  const isLastChunk = currentChunkIndex === verse.chunks.length - 1;
  const processedTextRef = useRef<string>('');

  // 구절 변경 시 초기화
  useEffect(() => {
    setCurrentChunkIndex(0);
    setCompletedChunks(new Array(verse.chunks.length).fill(false));
    setShowHint(false);
    setIsFinished(false);
    resetTranscript();
    processedTextRef.current = '';
  }, [verse, resetTranscript]);

  // 실시간 음성인식 텍스트 매칭 처리
  useEffect(() => {
    if (isFinished || !fullSpokenText || !currentChunk) return;

    // 현재 발화된 텍스트와 목표 마디 비교
    const { isMatch, similarity } = checkChunkMatch(currentChunk, fullSpokenText, 0.75);
    setLastMatchScore(similarity);

    if (isMatch) {
      // 성공 효과음
      playSuccessChime();

      // 마디 완료 처리
      setCompletedChunks(prev => {
        const next = [...prev];
        next[currentChunkIndex] = true;
        return next;
      });

      // 발화 텍스트 리셋
      resetTranscript();
      setShowHint(false);

      if (isLastChunk) {
        // 모든 마디 완성!
        setIsFinished(true);
        stopListening();
        onComplete(verse.id);

        // 컨페티 폭죽 효과
        try {
          confetti({
            particleCount: 80,
            spread: 70,
            origin: { y: 0.6 }
          });
        } catch {
          // ignore
        }
      } else {
        // 다음 마디로 이동
        setCurrentChunkIndex(prev => prev + 1);
      }
    }
  }, [fullSpokenText, currentChunk, currentChunkIndex, isLastChunk, isFinished, resetTranscript, stopListening, onComplete, verse.id]);

  // 수동 마디 통과 (스킵)
  const handleSkipChunk = () => {
    playSuccessChime();
    setCompletedChunks(prev => {
      const next = [...prev];
      next[currentChunkIndex] = true;
      return next;
    });

    resetTranscript();
    setShowHint(false);

    if (isLastChunk) {
      setIsFinished(true);
      stopListening();
      onComplete(verse.id);
      try {
        confetti({
          particleCount: 60,
          spread: 60,
          origin: { y: 0.6 }
        });
      } catch {
        // ignore
      }
    } else {
      setCurrentChunkIndex(prev => prev + 1);
    }
  };

  // 다시 처음부터 암송
  const handleRestart = () => {
    setCurrentChunkIndex(0);
    setCompletedChunks(new Array(verse.chunks.length).fill(false));
    setShowHint(false);
    setIsFinished(false);
    resetTranscript();
    setLastMatchScore(0);
  };

  const chosungHint = getChosungHint(currentChunk);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Top Navigation */}
      <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between shadow-xs">
        <button
          onClick={() => {
            stopListening();
            onBack();
          }}
          className="flex items-center space-x-1.5 text-slate-600 hover:text-slate-900 -ml-1 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
          <span className="text-sm font-medium">목록</span>
        </button>

        <div className="text-center">
          <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-semibold border border-indigo-100">
            #{verse.id} {verse.subCategory}
          </span>
          <h2 className="text-base font-bold text-slate-900 leading-tight">
            {verse.reference}
          </h2>
        </div>

        <button
          onClick={() => speakText(verse.text)}
          className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer"
          title="구절 전체 소리내어 듣기"
        >
          <Volume2 className="w-5 h-5" />
        </button>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-xl w-full mx-auto p-4 flex flex-col justify-between pb-28">
        <div>
          {/* Step Progress Bar */}
          <div className="mb-4">
            <div className="flex justify-between items-center text-xs font-semibold text-slate-500 mb-1.5">
              <span>암송 단계</span>
              <span className="text-indigo-600">
                {isFinished ? verse.chunks.length : currentChunkIndex + 1} / {verse.chunks.length} 마디
              </span>
            </div>
            <div className="flex space-x-1.5">
              {verse.chunks.map((_, idx) => (
                <div
                  key={idx}
                  className={`h-2 flex-1 rounded-full transition-all duration-300 ${
                    completedChunks[idx]
                      ? 'bg-emerald-500'
                      : idx === currentChunkIndex && !isFinished
                      ? 'bg-indigo-500 animate-pulse'
                      : 'bg-slate-200'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* 에러 메시지 알림 (마이크 미지원 등) */}
          {errorMessage && (
            <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start space-x-2.5 text-xs text-rose-700">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 암송 완료 축하 카드 */}
          {isFinished ? (
            <div className="bg-white rounded-3xl p-6 border border-emerald-200 shadow-lg text-center my-4 animate-in fade-in zoom-in-95 duration-300">
              <div className="w-16 h-16 rounded-2xl bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center mb-4 shadow-inner">
                <Sparkles className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-1">
                구절 암송 완성!
              </h3>
              <p className="text-xs text-emerald-600 font-semibold mb-4">
                마음에 하나님의 말씀이 새겨졌습니다.
              </p>

              <div className="bg-slate-50 rounded-2xl p-4 text-left border border-slate-100 mb-6">
                <p className="text-xs font-bold text-indigo-700 mb-1">{verse.reference}</p>
                <p className="text-sm font-medium text-slate-800 leading-relaxed">
                  {verse.text}
                </p>
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
          ) : (
            /* 마디 목록 카드 */
            <div className="space-y-3 my-2">
              {verse.chunks.map((chunk, idx) => {
                const isPassed = completedChunks[idx];
                const isCurrent = idx === currentChunkIndex;

                if (isPassed) {
                  // 이미 완성한 마디
                  return (
                    <div
                      key={idx}
                      className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex items-start space-x-3 transition-all"
                    >
                      <div className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </div>
                      <div className="flex-1">
                        <p className="text-base font-semibold text-emerald-950 leading-relaxed">
                          {chunk}
                        </p>
                      </div>
                    </div>
                  );
                }

                if (isCurrent) {
                  // 현재 말해야 하는 마디 (포커스 카드)
                  return (
                    <div
                      key={idx}
                      className="p-5 rounded-3xl bg-white border-2 border-indigo-500 shadow-md shadow-indigo-100 transition-all"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                          현재 마디 ({idx + 1} / {verse.chunks.length})
                        </span>
                        <button
                          onClick={() => speakText(chunk)}
                          className="text-xs text-slate-500 hover:text-indigo-600 flex items-center space-x-1 cursor-pointer"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>이 마디 듣기</span>
                        </button>
                      </div>

                      <p className="text-lg sm:text-xl font-bold text-slate-900 leading-relaxed tracking-wide my-2">
                        {chunk}
                      </p>

                      {/* 초성 힌트 표시 */}
                      {showHint && (
                        <div className="mt-3 p-3 bg-amber-50/80 border border-amber-200/80 rounded-xl text-amber-900 text-sm font-mono tracking-widest animate-in fade-in duration-200">
                          <span className="text-xs font-sans text-amber-600 font-bold block mb-0.5">💡 초성 힌트</span>
                          {chosungHint}
                        </div>
                      )}

                      {/* 실시간 음성 유사도 게이지 */}
                      {lastMatchScore > 0 && !isPassed && (
                        <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                          <span>음성 일치도</span>
                          <span className="font-semibold text-indigo-600">
                            {Math.round(lastMatchScore * 100)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                }

                // 아직 차례가 오지 않은 다음 마디들 (흐리게 표시)
                return (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-white/60 border border-slate-200/60 opacity-60 flex items-center space-x-3"
                  >
                    <div className="w-6 h-6 rounded-full bg-slate-100 text-slate-400 text-xs font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </div>
                    <p className="text-sm text-slate-400 select-none blur-[1.5px] hover:blur-none transition-all">
                      {chunk}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Real-time Voice Transcription Bubble */}
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
                  <span>{isListening ? '실시간 음성 인식 중...' : '마이크를 켜고 말씀하세요'}</span>
                </span>
                {fullSpokenText && (
                  <button
                    onClick={resetTranscript}
                    className="text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    비우기
                  </button>
                )}
              </div>
              <p className="text-sm font-medium text-slate-800 min-h-[1.5rem] break-keep">
                {fullSpokenText ? (
                  <span className="text-indigo-900 font-semibold">"{fullSpokenText}"</span>
                ) : (
                  <span className="text-slate-400 text-xs">
                    버튼을 누르고 위 문장을 또박또박 읽으면 자동으로 인식되어 넘어갑니다.
                  </span>
                )}
              </p>
            </div>
          </div>
        )}
      </main>

      {/* Floating Bottom Control Bar */}
      {!isFinished && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200/80 px-4 py-3 z-30 shadow-lg">
          <div className="max-w-xl mx-auto flex items-center justify-between">
            {/* 힌트 버튼 */}
            <button
              onClick={() => setShowHint(prev => !prev)}
              className={`flex flex-col items-center justify-center p-2 rounded-xl transition-colors cursor-pointer w-16 ${
                showHint ? 'text-amber-600 bg-amber-50' : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              <Lightbulb className="w-5 h-5 mb-0.5" />
              <span className="text-[11px] font-medium">초성 힌트</span>
            </button>

            {/* 마이크 메인 버튼 (크고 누르기 편한 중앙 버튼) */}
            <div className="relative">
              <button
                onClick={isListening ? stopListening : startListening}
                disabled={!isSupported}
                className={`w-16 h-16 rounded-full flex items-center justify-center text-white shadow-xl transition-all cursor-pointer transform active:scale-95 ${
                  isListening
                    ? 'bg-rose-500 shadow-rose-200 animate-mic-pulse'
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-300'
                }`}
              >
                {isListening ? <Mic className="w-7 h-7" /> : <MicOff className="w-7 h-7" />}
              </button>
              <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[11px] font-bold text-slate-500 whitespace-nowrap">
                {isListening ? '말씀하세요' : '터치하여 시작'}
              </span>
            </div>

            {/* 마디 건너뛰기 버튼 */}
            <button
              onClick={handleSkipChunk}
              className="flex flex-col items-center justify-center p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors cursor-pointer w-16"
              title="음성 인식이 잘 안 될 때 이 마디를 통과합니다"
            >
              <SkipForward className="w-5 h-5 mb-0.5 text-slate-600" />
              <span className="text-[11px] font-medium">통과(스킵)</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
