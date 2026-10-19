import { X, Mic, Volume2, Lightbulb, SkipForward, Smartphone, CheckCircle2 } from 'lucide-react';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl border border-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-900">말씀암송 50 사용 안내</h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="py-4 space-y-5 text-sm text-slate-600">
          {/* Section 1 */}
          <div>
            <h3 className="font-bold text-slate-900 flex items-center space-x-1.5 mb-2">
              <Mic className="w-4 h-4 text-indigo-600" />
              <span>실시간 음성인식 암송 방식</span>
            </h3>
            <p className="text-xs leading-relaxed text-slate-600">
              별도의 유료 API 서버 없이 <strong>스마트폰 자체의 음성인식 엔진(Web Speech API)</strong>을 활용합니다.
              문장이 길어서 생기는 인식 끊김을 방지하기 위해 각 구절을 <strong>자연스러운 마디(구/절)</strong>로 나누어 순서대로 진행합니다.
            </p>
          </div>

          {/* Section 2 */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2.5">
            <h4 className="font-bold text-xs text-slate-800">💡 음성 인식이 잘 안 될 때 꿀팁</h4>
            
            <div className="flex items-start space-x-2 text-xs">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <div>
                <strong>마이크 권한:</strong> 첫 실행 시 브라우저에서 마이크 사용을 꼭 <strong>'허용'</strong>해주세요.
              </div>
            </div>

            <div className="flex items-start space-x-2 text-xs">
              <Volume2 className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <strong>발음 듣기:</strong> 발음이 헷갈릴 때는 상단의 스피커 버튼을 눌러 정답 낭독을 먼저 들어보세요.
              </div>
            </div>

            <div className="flex items-start space-x-2 text-xs">
              <Lightbulb className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <strong>초성 힌트:</strong> 기억이 나지 않을 땐 하단 '초성 힌트'를 켜서 앞 글자 자음을 확인하세요.
              </div>
            </div>

            <div className="flex items-start space-x-2 text-xs">
              <SkipForward className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <strong>마디 통과(스킵):</strong> 성경 특유의 고어나 잡음 때문에 음성인식이 막히면 '통과' 버튼을 눌러 다음 마디로 넘어갈 수 있습니다.
              </div>
            </div>
          </div>

          {/* Section 3: PWA Install */}
          <div>
            <h3 className="font-bold text-slate-900 flex items-center space-x-1.5 mb-2">
              <Smartphone className="w-4 h-4 text-emerald-600" />
              <span>스마트폰 홈 화면에 앱으로 추가하기 (PWA)</span>
            </h3>
            <ul className="text-xs space-y-1.5 list-disc list-inside text-slate-600 leading-relaxed">
              <li>
                <strong>아이폰 (Safari):</strong> 하단 <strong>공유 버튼(네모+화살표)</strong>을 누른 후 <strong>[홈 화면에 추가]</strong>를 선택하세요.
              </li>
              <li>
                <strong>안드로이드 (Chrome):</strong> 상단 또는 주소창의 <strong>[앱 설치]</strong> 버튼을 누르거나 메뉴(⋮)에서 <strong>[홈 화면에 추가]</strong>를 선택하세요.
              </li>
            </ul>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-colors cursor-pointer"
          >
            확인했습니다
          </button>
        </div>
      </div>
    </div>
  );
}
