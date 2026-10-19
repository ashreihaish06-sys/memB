import { defineConfig } from '@vite-pwa/assets-generator/config'

// `npm run generate-pwa-assets` 로 public/ 아래 PNG 아이콘을 favicon.svg 에서 다시 만들 수 있습니다.
// (maskable / apple-touch-icon 은 모서리 투명 영역이 검게 보이지 않도록 배경색으로 채웁니다)
export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    transparent: {
      sizes: [64, 192, 512],
      favicons: [[48, 'favicon.ico']]
    },
    maskable: {
      sizes: [512],
      padding: 0,
      resizeOptions: { background: '#4f46e5' }
    },
    apple: {
      sizes: [180],
      padding: 0,
      resizeOptions: { background: '#4f46e5' }
    }
  },
  images: ['public/favicon.svg']
})

