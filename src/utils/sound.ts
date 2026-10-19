let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (audioCtx) return audioCtx;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = new Ctor();
  return audioCtx;
}

/**
 * 사용자 터치(제스처) 안에서 호출해야 합니다.
 * iOS Safari 등은 제스처 없이 만든/중단된 AudioContext 의 소리를 막기 때문에,
 * 마이크 버튼을 누를 때 미리 깨워 두어 이후 음성인식 이벤트에서 효과음이 나게 합니다.
 */
export function unlockAudio(): void {
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  } catch {
    // 오디오를 쓸 수 없는 환경이면 효과음 없이 진행
  }
}

/** 마디 성공 효과음 (C 메이저 아르페지오) + 짧은 진동 */
export function playSuccessChime(): void {
  try {
    navigator.vibrate?.(25);
  } catch {
    // ignore
  }

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume();

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

    playNote(523.25, now, 0.12);
    playNote(659.25, now + 0.08, 0.15);
    playNote(783.99, now + 0.16, 0.28);
  } catch {
    // 오디오 재생 실패 시 조용히 무시
  }
}

