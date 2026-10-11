import type { Device, DeviceOS, Suite } from './types'

type Row = [
  id: string,
  name: string,
  brand: string,
  kind: Device['kind'],
  os: DeviceOS,
  width: number,
  height: number,
  dpr: number,
  extra?: Partial<Device>
]

const island = (top = 59): Partial<Device> => ({
  cutout: 'island',
  safeArea: { top, right: 0, bottom: 34, left: 0 },
  radius: 48
})
const notch = (top = 47): Partial<Device> => ({
  cutout: 'notch',
  safeArea: { top, right: 0, bottom: 34, left: 0 },
  radius: 42
})
const punch = (top = 32): Partial<Device> => ({
  cutout: 'punch',
  safeArea: { top, right: 0, bottom: 16, left: 0 },
  radius: 30
})

/* Viewport sizes are CSS pixels as reported by the device's default browser. */
const ROWS: Row[] = [
  // Apple phones
  ['iphone-se', 'iPhone SE', 'Apple', 'phone', 'ios', 375, 667, 2, { cutout: 'none', radius: 0 }],
  ['iphone-13-mini', 'iPhone 13 mini', 'Apple', 'phone', 'ios', 375, 812, 3, notch(50)],
  ['iphone-14', 'iPhone 14', 'Apple', 'phone', 'ios', 390, 844, 3, notch()],
  ['iphone-15', 'iPhone 15', 'Apple', 'phone', 'ios', 393, 852, 3, island()],
  ['iphone-15-pro-max', 'iPhone 15 Pro Max', 'Apple', 'phone', 'ios', 430, 932, 3, island()],
  ['iphone-16', 'iPhone 16', 'Apple', 'phone', 'ios', 393, 852, 3, island()],
  ['iphone-16-pro', 'iPhone 16 Pro', 'Apple', 'phone', 'ios', 402, 874, 3, island(62)],
  ['iphone-16-pro-max', 'iPhone 16 Pro Max', 'Apple', 'phone', 'ios', 440, 956, 3, island(62)],
  ['iphone-17', 'iPhone 17', 'Apple', 'phone', 'ios', 402, 874, 3, island(62)],
  ['iphone-air', 'iPhone Air', 'Apple', 'phone', 'ios', 420, 912, 3, island(62)],
  ['iphone-17-pro-max', 'iPhone 17 Pro Max', 'Apple', 'phone', 'ios', 440, 956, 3, island(62)],
  // Android phones
  ['android-small', 'Android Small', 'Generic', 'phone', 'android', 360, 640, 3, { cutout: 'none', radius: 0 }],
  ['android-medium', 'Android Medium', 'Generic', 'phone', 'android', 360, 800, 3, punch()],
  ['pixel-8', 'Pixel 8', 'Google', 'phone', 'android', 412, 915, 2.625, punch()],
  ['pixel-9', 'Pixel 9', 'Google', 'phone', 'android', 412, 923, 2.625, punch()],
  ['pixel-9-pro-xl', 'Pixel 9 Pro XL', 'Google', 'phone', 'android', 448, 998, 3, punch()],
  ['pixel-10', 'Pixel 10', 'Google', 'phone', 'android', 412, 923, 2.625, punch()],
  ['galaxy-s24', 'Galaxy S24', 'Samsung', 'phone', 'android', 360, 780, 3, punch()],
  ['galaxy-s25', 'Galaxy S25', 'Samsung', 'phone', 'android', 360, 780, 3, punch()],
  ['galaxy-s25-ultra', 'Galaxy S25 Ultra', 'Samsung', 'phone', 'android', 412, 891, 3.5, punch()],
  ['galaxy-a55', 'Galaxy A55', 'Samsung', 'phone', 'android', 412, 915, 2.625, punch()],
  ['oneplus-13', 'OnePlus 13', 'OnePlus', 'phone', 'android', 412, 919, 3.5, punch()],
  ['nothing-phone-3', 'Nothing Phone (3)', 'Nothing', 'phone', 'android', 412, 919, 2.625, punch()],
  // Foldables
  ['z-fold-folded', 'Galaxy Z Fold (folded)', 'Samsung', 'foldable', 'android', 344, 882, 3, punch()],
  ['z-fold-open', 'Galaxy Z Fold (open)', 'Samsung', 'foldable', 'android', 690, 829, 2.625, { radius: 18 }],
  ['z-flip', 'Galaxy Z Flip', 'Samsung', 'foldable', 'android', 412, 1006, 2.625, punch()],
  ['pixel-fold-open', 'Pixel Fold (open)', 'Google', 'foldable', 'android', 841, 701, 2.625, { radius: 18 }],
  ['surface-duo', 'Surface Duo', 'Microsoft', 'foldable', 'android', 540, 720, 2.5, { radius: 6 }],
  // Tablets
  ['ipad-mini', 'iPad mini', 'Apple', 'tablet', 'ipados', 744, 1133, 2, { radius: 22 }],
  ['ipad', 'iPad', 'Apple', 'tablet', 'ipados', 820, 1180, 2, { radius: 20 }],
  ['ipad-air-13', 'iPad Air 13"', 'Apple', 'tablet', 'ipados', 1024, 1366, 2, { radius: 20 }],
  ['ipad-pro-11', 'iPad Pro 11"', 'Apple', 'tablet', 'ipados', 834, 1210, 2, { radius: 22 }],
  ['ipad-pro-13', 'iPad Pro 13"', 'Apple', 'tablet', 'ipados', 1032, 1376, 2, { radius: 22 }],
  ['galaxy-tab-s9', 'Galaxy Tab S9', 'Samsung', 'tablet', 'android', 800, 1280, 2, { radius: 16 }],
  ['pixel-tablet', 'Pixel Tablet', 'Google', 'tablet', 'android', 800, 1280, 2, { radius: 16 }],
  ['surface-pro', 'Surface Pro', 'Microsoft', 'tablet', 'windows', 912, 1368, 2, { radius: 8, mobile: false }],
  ['kindle-fire-hd', 'Fire HD 10', 'Amazon', 'tablet', 'android', 800, 1280, 1.5, { radius: 12 }],
  ['nest-hub', 'Nest Hub', 'Google', 'tablet', 'android', 1024, 600, 2, { radius: 12 }],
  // Laptops
  ['laptop-hd', 'Laptop HD', 'Generic', 'laptop', 'windows', 1366, 768, 1],
  ['laptop-hidpi', 'Laptop HiDPI', 'Generic', 'laptop', 'windows', 1440, 900, 2],
  ['macbook-air-13', 'MacBook Air 13"', 'Apple', 'laptop', 'macos', 1470, 956, 2],
  ['macbook-pro-14', 'MacBook Pro 14"', 'Apple', 'laptop', 'macos', 1512, 982, 2],
  ['macbook-pro-16', 'MacBook Pro 16"', 'Apple', 'laptop', 'macos', 1728, 1117, 2],
  ['chromebook', 'Chromebook', 'Google', 'laptop', 'chromeos', 1280, 800, 1.5],
  // Desktops
  ['desktop-1080p', 'Desktop 1080p', 'Generic', 'desktop', 'windows', 1920, 1080, 1],
  ['desktop-1440p', 'Desktop 1440p', 'Generic', 'desktop', 'windows', 2560, 1440, 1],
  ['desktop-4k-150', '4K at 150%', 'Generic', 'desktop', 'windows', 2560, 1440, 1.5],
  ['imac-27', 'iMac 5K', 'Apple', 'desktop', 'macos', 2560, 1440, 2],
  ['ultrawide', 'Ultrawide 21:9', 'Generic', 'desktop', 'windows', 3440, 1440, 1],
  // Watch
  ['apple-watch', 'Apple Watch 45mm', 'Apple', 'watch', 'watchos', 198, 242, 2, { radius: 40, cutout: 'none' }],
  // Free-form
  ['responsive', 'Responsive', 'Facet', 'responsive', 'other', 480, 800, 2, { mobile: false, touch: false }]
]

export const BUILTIN_DEVICES: Device[] = ROWS.map(
  ([id, name, brand, kind, os, width, height, dpr, extra]) => {
    const handheld = kind === 'phone' || kind === 'tablet' || kind === 'foldable' || kind === 'watch'
    return { id, name, brand, kind, os, width, height, dpr, mobile: handheld, touch: handheld, ...extra }
  }
)

export const RESPONSIVE_ID = 'responsive'

export const BUILTIN_SUITES: Suite[] = [
  { id: 'default', name: 'Essentials', deviceIds: ['iphone-17', 'ipad', 'macbook-air-13'], builtin: true },
  { id: 'phones', name: 'Phones', deviceIds: ['iphone-se', 'iphone-17', 'iphone-17-pro-max', 'android-small', 'pixel-10', 'galaxy-s25'], builtin: true },
  { id: 'tablets', name: 'Tablets', deviceIds: ['ipad-mini', 'ipad', 'ipad-pro-13', 'galaxy-tab-s9'], builtin: true },
  { id: 'desktops', name: 'Desktops', deviceIds: ['laptop-hd', 'macbook-air-13', 'desktop-1080p'], builtin: true },
  { id: 'apple', name: 'Apple', deviceIds: ['iphone-se', 'iphone-17', 'ipad', 'macbook-air-13'], builtin: true },
  { id: 'extremes', name: 'Extremes', deviceIds: ['apple-watch', 'z-fold-folded', 'android-small', 'ultrawide'], builtin: true }
]

/** Common framework breakpoints, offered as one-click free-form panes. */
export const FRAMEWORK_BREAKPOINTS: Record<string, number[]> = {
  Tailwind: [640, 768, 1024, 1280, 1536],
  Bootstrap: [576, 768, 992, 1200, 1400],
  'Material UI': [600, 900, 1200, 1536]
}

const chromeMajor = (version: string): string => version.split('.')[0] || '140'

/**
 * Builds the UA string a device's default browser would send. `chromeVersion`
 * is the embedded Chromium version so Android/desktop strings stay current.
 */
export function userAgentFor(os: DeviceOS, mobile: boolean, chromeVersion: string): string {
  const cr = `${chromeMajor(chromeVersion)}.0.0.0`
  const blink = `AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${cr}`
  switch (os) {
    case 'ios':
      return 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
    case 'ipados':
      return 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1'
    case 'watchos':
      return 'Mozilla/5.0 (Watch; CPU Watch OS 11_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
    case 'android':
      return `Mozilla/5.0 (Linux; Android 10; K) ${blink}${mobile ? ' Mobile' : ''} Safari/537.36`
    case 'macos':
      return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) ${blink} Safari/537.36`
    case 'chromeos':
      return `Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) ${blink} Safari/537.36`
    case 'windows':
      return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) ${blink} Safari/537.36`
    default:
      return ''
  }
}

export function platformFor(os: DeviceOS): string {
  switch (os) {
    case 'ios':
      return 'iPhone'
    case 'ipados':
      return 'iPad'
    case 'android':
      return 'Linux armv81'
    case 'macos':
      return 'MacIntel'
    case 'windows':
      return 'Win32'
    case 'chromeos':
      return 'Linux x86_64'
    default:
      return ''
  }
}
