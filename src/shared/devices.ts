import type { Device, DeviceKind, DeviceOS, Suite } from './types'

/*
 * The device catalogue. Sizes are CSS pixels as the device's default browser
 * reports them, in the device's natural orientation.
 *
 * Apple publishes logical resolutions, so those are exact. Android makers do
 * not: the CSS viewport is the panel resolution divided by a density the
 * maker picks, and it shifts with the user's display-size setting. Values
 * here follow the factory default; entries marked `approx` are derived from
 * the panel resolution because no measured value was available.
 *
 * Compiled from Apple's specifications, the Chrome DevTools device list,
 * yesviz.com, screensize.io and webmobilefirst.com.
 */

type Extra = Partial<Device>
type Row = [id: string, name: string, w: number, h: number, dpr: number, year?: number, extra?: Extra]

const island = (top = 59): Extra => ({ cutout: 'island', safeArea: { top, right: 0, bottom: 34, left: 0 }, radius: 48 })
const notch = (top = 47): Extra => ({ cutout: 'notch', safeArea: { top, right: 0, bottom: 34, left: 0 }, radius: 42 })
const punch = (top = 32): Extra => ({ cutout: 'punch', safeArea: { top, right: 0, bottom: 16, left: 0 }, radius: 28 })
const flat: Extra = { cutout: 'none', radius: 0 }
const est: Extra = { approx: true }
const both = (...parts: Extra[]): Extra => Object.assign({}, ...parts)

interface Group {
  brand: string
  kind: DeviceKind
  os: DeviceOS
  rows: Row[]
}

const GROUPS: Group[] = [
  /* ---------------- phones ---------------- */
  {
    brand: 'Apple',
    kind: 'phone',
    os: 'ios',
    rows: [
      ['iphone-18-pro-max', 'iPhone 18 Pro Max', 440, 956, 3, 2026, island(62)],
      ['iphone-18-pro', 'iPhone 18 Pro', 402, 874, 3, 2026, island(62)],
      ['iphone-17-pro-max', 'iPhone 17 Pro Max', 440, 956, 3, 2025, island(62)],
      ['iphone-17-pro', 'iPhone 17 Pro', 402, 874, 3, 2025, island(62)],
      ['iphone-air', 'iPhone Air', 420, 912, 3, 2025, island(62)],
      ['iphone-17', 'iPhone 17', 402, 874, 3, 2025, island(62)],
      ['iphone-17e', 'iPhone 17e', 390, 844, 3, 2026, notch()],
      ['iphone-16e', 'iPhone 16e', 390, 844, 3, 2025, notch()],
      ['iphone-16-pro-max', 'iPhone 16 Pro Max', 440, 956, 3, 2024, island(62)],
      ['iphone-16-pro', 'iPhone 16 Pro', 402, 874, 3, 2024, island(62)],
      ['iphone-16-plus', 'iPhone 16 Plus', 430, 932, 3, 2024, island()],
      ['iphone-16', 'iPhone 16', 393, 852, 3, 2024, island()],
      ['iphone-15-pro-max', 'iPhone 15 Pro Max', 430, 932, 3, 2023, island()],
      ['iphone-15-pro', 'iPhone 15 Pro', 393, 852, 3, 2023, island()],
      ['iphone-15-plus', 'iPhone 15 Plus', 430, 932, 3, 2023, island()],
      ['iphone-15', 'iPhone 15', 393, 852, 3, 2023, island()],
      ['iphone-14-pro-max', 'iPhone 14 Pro Max', 430, 932, 3, 2022, island()],
      ['iphone-14-pro', 'iPhone 14 Pro', 393, 852, 3, 2022, island()],
      ['iphone-14-plus', 'iPhone 14 Plus', 428, 926, 3, 2022, notch()],
      ['iphone-14', 'iPhone 14', 390, 844, 3, 2022, notch()],
      ['iphone-se', 'iPhone SE (2nd / 3rd gen)', 375, 667, 2, 2022, flat],
      ['iphone-13-pro-max', 'iPhone 13 Pro Max', 428, 926, 3, 2021, notch()],
      ['iphone-13', 'iPhone 13 / 13 Pro', 390, 844, 3, 2021, notch()],
      ['iphone-13-mini', 'iPhone 13 mini', 375, 812, 3, 2021, notch(50)],
      ['iphone-12-pro-max', 'iPhone 12 Pro Max', 428, 926, 3, 2020, notch()],
      ['iphone-12', 'iPhone 12 / 12 Pro', 390, 844, 3, 2020, notch()],
      ['iphone-12-mini', 'iPhone 12 mini', 375, 812, 3, 2020, notch(50)],
      ['iphone-11-pro-max', 'iPhone 11 Pro Max', 414, 896, 3, 2019, notch(44)],
      ['iphone-11-pro', 'iPhone 11 Pro', 375, 812, 3, 2019, notch(44)],
      ['iphone-11', 'iPhone 11', 414, 896, 2, 2019, notch(48)],
      ['iphone-xs-max', 'iPhone XS Max', 414, 896, 3, 2018, notch(44)],
      ['iphone-xr', 'iPhone XR', 414, 896, 2, 2018, notch(48)],
      ['iphone-x', 'iPhone X / XS', 375, 812, 3, 2017, notch(44)],
      ['iphone-8-plus', 'iPhone 6 Plus / 6s Plus / 7 Plus / 8 Plus', 414, 736, 3, 2017, flat],
      ['iphone-8', 'iPhone 6 / 6s / 7 / 8', 375, 667, 2, 2017, flat],
      ['iphone-5', 'iPhone 5 / 5s / 5c / SE (1st gen)', 320, 568, 2, 2016, flat],
      ['iphone-4', 'iPhone 4 / 4s', 320, 480, 2, 2011, flat]
    ]
  },
  {
    brand: 'Samsung',
    kind: 'phone',
    os: 'android',
    rows: [
      ['galaxy-s26-ultra', 'Galaxy S26 Ultra', 412, 891, 3.5, 2026, punch()],
      ['galaxy-s26-plus', 'Galaxy S26+', 412, 891, 3.5, 2026, punch()],
      ['galaxy-s26', 'Galaxy S26', 360, 780, 3, 2026, punch()],
      ['galaxy-s25-ultra', 'Galaxy S25 Ultra', 412, 891, 3.5, 2025, punch()],
      ['galaxy-s25-edge', 'Galaxy S25 Edge', 412, 891, 3.5, 2025, punch()],
      ['galaxy-s25-plus', 'Galaxy S25+', 412, 891, 3.5, 2025, punch()],
      ['galaxy-s25', 'Galaxy S25', 360, 780, 3, 2025, punch()],
      ['galaxy-s24-ultra', 'Galaxy S24 Ultra', 384, 832, 3.75, 2024, punch()],
      ['galaxy-s24-plus', 'Galaxy S24+', 384, 832, 3.75, 2024, punch()],
      ['galaxy-s24', 'Galaxy S24', 360, 780, 3, 2024, punch()],
      ['galaxy-s23-ultra', 'Galaxy S23 Ultra', 384, 824, 3.75, 2023, punch()],
      ['galaxy-s23-plus', 'Galaxy S23+', 384, 832, 2.8125, 2023, punch()],
      ['galaxy-s23', 'Galaxy S23', 360, 780, 3, 2023, punch()],
      ['galaxy-s22-ultra', 'Galaxy S22 Ultra', 384, 824, 3.75, 2022, punch()],
      ['galaxy-s22-plus', 'Galaxy S22+', 384, 832, 2.8125, 2022, punch()],
      ['galaxy-s22', 'Galaxy S22', 360, 780, 3, 2022, punch()],
      ['galaxy-s21-ultra', 'Galaxy S21 Ultra', 384, 854, 3.75, 2021, punch()],
      ['galaxy-s21-plus', 'Galaxy S21+', 384, 854, 2.8125, 2021, punch()],
      ['galaxy-s21', 'Galaxy S21', 360, 800, 3, 2021, punch()],
      ['galaxy-s20-ultra', 'Galaxy S20 Ultra', 412, 915, 3.5, 2020, punch()],
      ['galaxy-s20-plus', 'Galaxy S20+', 384, 854, 3.75, 2020, punch()],
      ['galaxy-s20', 'Galaxy S20', 360, 800, 4, 2020, punch()],
      ['galaxy-s20-fe', 'Galaxy S20 FE', 412, 914, 2.625, 2020, punch()],
      ['galaxy-s10-plus', 'Galaxy S10+', 412, 869, 3.5, 2019, punch()],
      ['galaxy-s10', 'Galaxy S10', 360, 760, 4, 2019, punch()],
      ['galaxy-s9', 'Galaxy S8 / S8+ / S9 / S9+', 360, 740, 4, 2018, { cutout: 'none', radius: 24 }],
      ['galaxy-s7', 'Galaxy S6 / S7', 360, 640, 4, 2016, flat],
      ['galaxy-s5', 'Galaxy S5', 360, 640, 3, 2014, flat],
      ['galaxy-note20-ultra', 'Galaxy Note20 Ultra', 412, 883, 3.5, 2020, punch()],
      ['galaxy-note20', 'Galaxy Note20', 412, 915, 2.625, 2020, punch()],
      ['galaxy-note10-plus', 'Galaxy Note10+', 412, 869, 3.5, 2019, punch()],
      ['galaxy-note9', 'Galaxy Note 8 / Note 9', 360, 740, 4, 2018, flat],
      ['galaxy-a56', 'Galaxy A56', 412, 892, 2.625, 2025, both(punch(), est)],
      ['galaxy-a55', 'Galaxy A55', 412, 892, 2.625, 2024, punch()],
      ['galaxy-a54', 'Galaxy A54', 412, 892, 2.625, 2023, punch()],
      ['galaxy-a36', 'Galaxy A36', 412, 892, 2.625, 2025, both(punch(), est)],
      ['galaxy-a35', 'Galaxy A35', 412, 892, 2.625, 2024, punch()],
      ['galaxy-a52', 'Galaxy A51 / A52 / A53', 412, 915, 2.625, 2022, punch()],
      ['galaxy-a50', 'Galaxy A50', 412, 892, 2.625, 2019, punch()],
      ['galaxy-a32', 'Galaxy A32', 412, 915, 2.625, 2021, punch()],
      ['galaxy-a16', 'Galaxy A15 / A16', 384, 832, 2.8125, 2024, both(punch(), est)],
      ['galaxy-a06', 'Galaxy A05 / A06', 360, 800, 2, 2024, both(punch(), est)]
    ]
  },
  {
    brand: 'Google',
    kind: 'phone',
    os: 'android',
    rows: [
      ['pixel-11-pro-xl', 'Pixel 11 Pro XL', 448, 997, 3, 2026, both(punch(), est)],
      ['pixel-11-pro', 'Pixel 11 Pro', 410, 914, 3.125, 2026, both(punch(), est)],
      ['pixel-11', 'Pixel 11', 412, 924, 2.625, 2026, both(punch(), est)],
      ['pixel-10-pro-xl', 'Pixel 10 Pro XL', 448, 997, 3, 2025, punch()],
      ['pixel-10-pro', 'Pixel 10 Pro', 410, 914, 3.125, 2025, both(punch(), est)],
      ['pixel-10', 'Pixel 10', 412, 924, 2.625, 2025, punch()],
      ['pixel-9-pro-xl', 'Pixel 9 Pro XL', 448, 997, 3, 2024, punch()],
      ['pixel-9-pro', 'Pixel 9 Pro', 410, 914, 3.125, 2024, both(punch(), est)],
      ['pixel-9', 'Pixel 9 / 9a', 412, 924, 2.625, 2024, punch()],
      ['pixel-8-pro', 'Pixel 8 Pro', 448, 997, 3, 2023, punch()],
      ['pixel-8', 'Pixel 8 / 8a', 412, 915, 2.625, 2023, punch()],
      ['pixel-7-pro', 'Pixel 7 Pro', 412, 892, 3.5, 2022, punch()],
      ['pixel-7', 'Pixel 7 / 7a', 412, 915, 2.625, 2022, punch()],
      ['pixel-6-pro', 'Pixel 6 Pro', 412, 892, 3.5, 2021, punch()],
      ['pixel-6', 'Pixel 6 / 6a', 412, 915, 2.625, 2021, punch()],
      ['pixel-5', 'Pixel 4a / 5', 393, 851, 2.75, 2020, punch()],
      ['pixel-4-xl', 'Pixel 4 XL', 412, 869, 3.5, 2019, flat],
      ['pixel-4', 'Pixel 4', 393, 830, 2.75, 2019, flat],
      ['pixel-3-xl', 'Pixel 3 XL', 412, 846, 3.5, 2018, flat],
      ['pixel-3', 'Pixel 3', 393, 786, 2.75, 2018, flat],
      ['pixel-2-xl', 'Pixel 2 XL', 412, 823, 3.5, 2017, flat],
      ['pixel-2', 'Pixel / Pixel 2', 412, 732, 2.625, 2017, flat],
      ['nexus-6p', 'Nexus 6 / 6P', 412, 732, 3.5, 2015, flat],
      ['nexus-5x', 'Nexus 5X', 412, 732, 2.625, 2015, flat],
      ['nexus-5', 'Nexus 5', 360, 640, 3, 2013, flat]
    ]
  },
  {
    brand: 'OnePlus',
    kind: 'phone',
    os: 'android',
    rows: [
      ['oneplus-13', 'OnePlus 13', 412, 905, 3.5, 2025, punch()],
      ['oneplus-12', 'OnePlus 12', 412, 905, 3.5, 2024, punch()],
      ['oneplus-nord-4', 'OnePlus Nord 4', 413, 924, 3, 2024, both(punch(), est)],
      ['oneplus-9-pro', 'OnePlus 9 Pro / 10 Pro / 11', 412, 919, 3.5, 2023, punch()],
      ['oneplus-9', 'OnePlus 8 / 9 / Nord', 412, 915, 2.625, 2021, punch()],
      ['oneplus-8-pro', 'OnePlus 8 Pro', 412, 906, 3.5, 2020, punch()],
      ['oneplus-7-pro', 'OnePlus 7 Pro / 7T Pro', 412, 892, 3.5, 2019, flat],
      ['oneplus-6t', 'OnePlus 6T / 7', 412, 892, 2.625, 2019, flat]
    ]
  },
  {
    brand: 'Xiaomi',
    kind: 'phone',
    os: 'android',
    rows: [
      ['xiaomi-15-ultra', 'Xiaomi 14 Ultra / 15 Ultra', 411, 914, 3.5, 2025, both(punch(), est)],
      ['xiaomi-15', 'Xiaomi 14 / 15', 400, 890, 3, 2025, both(punch(), est)],
      ['xiaomi-14t', 'Xiaomi 13T / 14T', 407, 904, 3, 2024, both(punch(), est)],
      ['redmi-note-14', 'Redmi Note 10 to Note 14', 393, 873, 2.75, 2024, punch()],
      ['redmi-note-9', 'Redmi Note 7 / 8 / 9', 393, 851, 2.75, 2020, punch()],
      ['xiaomi-mi-10t', 'Xiaomi Mi 10T / 10T Pro', 393, 873, 2.75, 2020, punch()],
      ['xiaomi-mi-10', 'Xiaomi Mi 9 / Mi 10', 393, 851, 2.75, 2020, punch()],
      ['xiaomi-mi-8', 'Xiaomi Mi 8', 393, 817, 2.75, 2018, flat],
      ['redmi-13c', 'Redmi 12 / 13C / A3', 360, 800, 2, 2024, both(punch(), est)],
      ['poco-x6-pro', 'POCO X6 Pro / F6', 407, 904, 3, 2024, both(punch(), est)]
    ]
  },
  {
    brand: 'Huawei',
    kind: 'phone',
    os: 'android',
    rows: [
      ['huawei-p40-pro', 'Huawei P40 Pro', 400, 880, 3, 2020, punch()],
      ['huawei-p40', 'Huawei P30 / P30 Pro / P40', 360, 780, 3, 2020, punch()],
      ['huawei-mate-30-pro', 'Huawei Mate 30 Pro', 392, 800, 3, 2019, flat],
      ['huawei-mate-20-pro', 'Huawei Mate 20 Pro', 360, 780, 4, 2018, flat],
      ['huawei-nova-7', 'Huawei Nova 6 / 7', 360, 800, 3, 2020, punch()],
      ['huawei-p20-pro', 'Huawei P20 Pro', 360, 747, 3, 2018, flat],
      ['honor-9x', 'Honor 8X / 9X', 360, 780, 3, 2019, flat]
    ]
  },
  {
    brand: 'Sony',
    kind: 'phone',
    os: 'android',
    rows: [
      ['xperia-1', 'Xperia 1', 411, 960, 4, 2019, flat],
      ['xperia-5', 'Xperia 5 / 10', 360, 840, 3, 2019, flat],
      ['xperia-z5', 'Xperia Z3 / Z5 / XZ', 360, 640, 3, 2016, flat]
    ]
  },
  {
    brand: 'Motorola',
    kind: 'phone',
    os: 'android',
    rows: [
      ['moto-edge-50', 'Motorola Edge 50', 412, 915, 2.625, 2024, both(punch(), est)],
      ['moto-g-power', 'Moto G Power / G Stylus', 412, 915, 2.625, 2024, both(punch(), est)],
      ['moto-g8', 'Moto G8', 360, 780, 2, 2020, flat],
      ['moto-g4', 'Moto G4', 360, 640, 3, 2016, flat]
    ]
  },
  {
    brand: 'Other',
    kind: 'phone',
    os: 'android',
    rows: [
      ['nothing-phone-3', 'Nothing Phone (3)', 420, 933, 3, 2025, both(punch(), est)],
      ['nothing-phone-2', 'Nothing Phone (1) / (2)', 412, 915, 2.625, 2023, both(punch(), est)],
      ['oppo-find-x8', 'OPPO Reno / Find X', 360, 800, 3, 2024, both(punch(), est)],
      ['realme-12', 'realme 11 / 12', 360, 800, 3, 2024, both(punch(), est)],
      ['vivo-v30', 'vivo V30 / X100', 393, 873, 2.75, 2024, both(punch(), est)],
      ['vivo-y20', 'vivo Y20', 385, 854, 1.875, 2020, flat],
      ['tecno-spark', 'Tecno Spark / Infinix Hot', 360, 806, 2, 2024, both(punch(), est)],
      ['fairphone-5', 'Fairphone 5', 408, 900, 3, 2023, both(punch(), est)],
      ['asus-rog-8', 'ASUS ROG Phone 8', 393, 873, 2.75, 2024, both(punch(), est)],
      ['lg-g8', 'LG G7 / G8 ThinQ', 360, 780, 4, 2019, flat],
      ['lg-g6', 'LG G6', 360, 720, 4, 2017, flat],
      ['lg-k51s', 'LG K51S', 360, 800, 2, 2020, flat],
      ['htc-u12', 'HTC U11+ / U12+', 360, 720, 4, 2018, flat],
      ['htc-one-m9', 'HTC One M8 / M9', 360, 640, 3, 2015, flat],
      ['blackberry-keyone', 'BlackBerry KEYone', 360, 540, 3, 2017, flat],
      ['blackberry-passport', 'BlackBerry Passport', 504, 504, 2.85, 2014, flat],
      ['blackberry-z30', 'BlackBerry Z30', 360, 640, 2, 2013, flat],
      ['lumia-950-xl', 'Lumia 950 XL', 411, 731, 3.5, 2015, flat],
      ['lumia-650', 'Lumia 650', 360, 640, 2, 2016, flat],
      ['lumia-520', 'Lumia 520', 320, 480, 1.5, 2013, flat],
      ['jiophone-2', 'JioPhone 2 (KaiOS)', 240, 320, 1, 2018, flat]
    ]
  },
  {
    brand: 'Generic',
    kind: 'phone',
    os: 'android',
    rows: [
      ['android-360x800', 'Android 360 × 800 (most common)', 360, 800, 3, 0, punch()],
      ['android-393x873', 'Android 393 × 873', 393, 873, 2.75, 0, punch()],
      ['android-412x915', 'Android 412 × 915', 412, 915, 2.625, 0, punch()],
      ['android-384x832', 'Android 384 × 832', 384, 832, 2.8125, 0, punch()],
      ['android-small', 'Android Small 360 × 640', 360, 640, 3, 0, flat],
      ['android-medium', 'Android 360 × 780', 360, 780, 3, 0, punch()],
      ['phone-320', 'Smallest phones 320 × 568', 320, 568, 2, 0, flat]
    ]
  },

  /* ---------------- foldables ---------------- */
  {
    brand: 'Apple',
    kind: 'foldable',
    os: 'ios',
    rows: [
      ['iphone-duo-folded', 'iPhone Duo (folded)', 466, 678, 3, 2026, both(island(), est)],
      ['iphone-duo-open', 'iPhone Duo (open)', 890, 626, 3, 2026, both({ radius: 18 }, est)]
    ]
  },
  {
    brand: 'Samsung',
    kind: 'foldable',
    os: 'android',
    rows: [
      ['z-fold-7-folded', 'Galaxy Z Fold 7 (folded)', 412, 960, 2.625, 2025, both(punch(), est)],
      ['z-fold-7-open', 'Galaxy Z Fold 7 (open)', 984, 1092, 2, 2025, both({ radius: 18 }, est)],
      ['z-fold-folded', 'Galaxy Z Fold 5 / 6 (folded)', 344, 882, 2.625, 2023, punch()],
      ['z-fold-open', 'Galaxy Z Fold 5 / 6 (open)', 690, 829, 2.625, 2023, { radius: 18 }],
      ['z-fold-2-open', 'Galaxy Z Fold 2 (open)', 884, 1104, 2, 2020, { radius: 18 }],
      ['z-flip-8', 'Galaxy Z Flip 7 / 8', 360, 840, 3, 2026, both(punch(), est)],
      ['z-flip', 'Galaxy Z Flip to Flip 6', 412, 1004, 2.625, 2024, punch()]
    ]
  },
  {
    brand: 'Google',
    kind: 'foldable',
    os: 'android',
    rows: [
      ['pixel-11-pro-fold-open', 'Pixel 9 / 10 / 11 Pro Fold (open)', 791, 820, 2.625, 2026, both({ radius: 18 }, est)],
      ['pixel-pro-fold-folded', 'Pixel 9 / 10 / 11 Pro Fold (folded)', 412, 924, 2.625, 2026, both(punch(), est)],
      ['pixel-fold-open', 'Pixel Fold (open)', 841, 701, 2.625, 2023, { radius: 18 }]
    ]
  },
  {
    brand: 'Microsoft',
    kind: 'foldable',
    os: 'android',
    rows: [
      ['surface-duo', 'Surface Duo (one screen)', 540, 720, 2.5, 2020, { radius: 6 }],
      ['surface-duo-span', 'Surface Duo (spanned)', 1114, 720, 2.5, 2020, { radius: 6 }]
    ]
  },

  /* ---------------- tablets ---------------- */
  {
    brand: 'Apple',
    kind: 'tablet',
    os: 'ipados',
    rows: [
      ['ipad-pro-13', 'iPad Pro 13" (M4 / M5)', 1032, 1376, 2, 2025, { radius: 22 }],
      ['ipad-pro-11', 'iPad Pro 11" (M4 / M5)', 834, 1210, 2, 2025, { radius: 22 }],
      ['ipad-air-13', 'iPad Air 13"', 1024, 1366, 2, 2025, { radius: 20 }],
      ['ipad-air-11', 'iPad Air 11"', 820, 1180, 2, 2025, { radius: 20 }],
      ['ipad', 'iPad (10th gen / A16)', 820, 1180, 2, 2025, { radius: 20 }],
      ['ipad-mini', 'iPad mini (6th gen / A17 Pro)', 744, 1133, 2, 2024, { radius: 22 }],
      ['ipad-pro-12-9', 'iPad Pro 12.9"', 1024, 1366, 2, 2022, { radius: 18 }],
      ['ipad-pro-11-2018', 'iPad Pro 11" (2018 to 2022)', 834, 1194, 2, 2022, { radius: 18 }],
      ['ipad-10-2', 'iPad 10.2" (7th to 9th gen)', 810, 1080, 2, 2021],
      ['ipad-air-3', 'iPad Air 3 / iPad Pro 10.5"', 834, 1112, 2, 2019],
      ['ipad-9-7', 'iPad 9.7" / Air 2 / mini 5', 768, 1024, 2, 2019],
      ['ipad-original', 'iPad 1 / 2 / mini 1', 768, 1024, 1, 2012]
    ]
  },
  {
    brand: 'Samsung',
    kind: 'tablet',
    os: 'android',
    rows: [
      ['galaxy-tab-s10-ultra', 'Galaxy Tab S8 to S10 Ultra', 924, 1480, 2, 2024, both({ radius: 16 }, est)],
      ['galaxy-tab-s10-plus', 'Galaxy Tab S8+ to S10+', 876, 1400, 2, 2024, both({ radius: 16 }, est)],
      ['galaxy-tab-s9', 'Galaxy Tab S7 / S8 / S9', 800, 1280, 2, 2023, { radius: 16 }],
      ['galaxy-tab-a9-plus', 'Galaxy Tab A8 / A9+', 800, 1280, 1.5, 2023, both({ radius: 12 }, est)],
      ['galaxy-tab-s6-lite', 'Galaxy Tab S6 Lite', 800, 1333, 1.5, 2022, both({ radius: 12 }, est)]
    ]
  },
  {
    brand: 'Other',
    kind: 'tablet',
    os: 'android',
    rows: [
      ['pixel-tablet', 'Pixel Tablet', 800, 1280, 2, 2023, { radius: 16 }],
      ['oneplus-pad', 'OnePlus Pad', 1000, 1400, 2, 2023, both({ radius: 16 }, est)],
      ['xiaomi-pad-6', 'Xiaomi Pad 6', 900, 1440, 2, 2023, both({ radius: 16 }, est)],
      ['lenovo-tab-p11', 'Lenovo Tab P11 / P12', 800, 1333, 1.5, 2023, both({ radius: 12 }, est)],
      ['huawei-matepad-pro', 'Huawei MatePad Pro', 800, 1280, 2, 2020, { radius: 12 }],
      ['kindle-fire-hd', 'Amazon Fire HD 10', 800, 1280, 1.5, 2023, { radius: 12 }],
      ['fire-hd-8', 'Amazon Fire HD 8', 601, 962, 1.33, 2022, both({ radius: 12 }, est)],
      ['fire-7', 'Amazon Fire 7', 600, 1024, 1, 2022, { radius: 8 }],
      ['kindle-fire-hdx', 'Kindle Fire HDX', 800, 1280, 2, 2013, { radius: 8 }],
      ['nexus-10', 'Nexus 10', 800, 1280, 2, 2012, { radius: 8 }],
      ['nexus-9', 'Nexus 9', 768, 1024, 2, 2014, { radius: 8 }],
      ['nexus-7', 'Nexus 7', 600, 960, 2, 2013, { radius: 8 }],
      ['lg-g-pad-5', 'LG G Pad 5', 600, 960, 2, 2019, { radius: 8 }]
    ]
  },
  {
    brand: 'Microsoft',
    kind: 'tablet',
    os: 'windows',
    rows: [
      ['surface-pro-11', 'Surface Pro 8 to 11', 960, 1440, 2, 2024, { radius: 8, mobile: false }],
      ['surface-pro', 'Surface Pro 4 to 7', 912, 1368, 2, 2019, { radius: 8, mobile: false }],
      ['surface-pro-x', 'Surface Pro X', 960, 1440, 2, 2019, { radius: 8, mobile: false }],
      ['surface-go', 'Surface Go', 800, 1200, 1.5, 2021, { radius: 8, mobile: false }]
    ]
  },

  /* ---------------- laptops ---------------- */
  {
    brand: 'Apple',
    kind: 'laptop',
    os: 'macos',
    rows: [
      ['macbook-air-13', 'MacBook Air 13" (M2 to M5)', 1470, 956, 2, 2025],
      ['macbook-air-15', 'MacBook Air 15"', 1710, 1107, 2, 2025],
      ['macbook-pro-14', 'MacBook Pro 14"', 1512, 982, 2, 2025],
      ['macbook-pro-16', 'MacBook Pro 16"', 1728, 1117, 2, 2025],
      ['macbook-pro-13', 'MacBook Pro 13" / Air 13" (Retina)', 1440, 900, 2, 2022],
      ['macbook-pro-16-2019', 'MacBook Pro 16" (2019)', 1792, 1120, 2, 2019],
      ['macbook-pro-15', 'MacBook Pro 15" (Retina)', 1680, 1050, 2, 2019],
      ['macbook-12', 'MacBook 12"', 1280, 800, 2, 2017],
      ['macbook-air-13-2017', 'MacBook Air 13" (2010 to 2017)', 1440, 900, 1, 2017],
      ['macbook-air-11', 'MacBook Air 11"', 1366, 768, 1, 2015]
    ]
  },
  {
    brand: 'Windows',
    kind: 'laptop',
    os: 'windows',
    rows: [
      ['laptop-1536', 'Full HD laptop at 125% (most common)', 1536, 864, 1.25, 0],
      ['laptop-hd', 'HD laptop 1366 × 768', 1366, 768, 1, 0],
      ['laptop-fhd-150', 'Full HD laptop at 150%', 1280, 720, 1.5, 0],
      ['laptop-fhd', 'Full HD laptop at 100%', 1920, 1080, 1, 0],
      ['laptop-1920x1200-125', '1920 × 1200 laptop at 125%', 1536, 960, 1.25, 0],
      ['laptop-1920x1200-150', '1920 × 1200 laptop at 150%', 1280, 800, 1.5, 0],
      ['laptop-hidpi', '2880 × 1800 laptop at 200%', 1440, 900, 2, 0],
      ['laptop-qhd-150', '2560 × 1600 laptop at 150%', 1707, 1067, 1.5, 0],
      ['laptop-4k-250', '4K laptop at 250%', 1536, 864, 2.5, 0],
      ['laptop-1600x900', 'HD+ laptop 1600 × 900', 1600, 900, 1, 0],
      ['dell-xps-13', 'Dell XPS 13', 1280, 800, 1.5, 2024, est],
      ['thinkpad-x1', 'ThinkPad X1 Carbon', 1536, 960, 1.25, 2024, est],
      ['hp-spectre-14', 'HP Spectre x360 14', 1440, 900, 2, 2024, est],
      ['framework-13', 'Framework Laptop 13', 1504, 1003, 1.5, 2023, est]
    ]
  },
  {
    brand: 'Microsoft',
    kind: 'laptop',
    os: 'windows',
    rows: [
      ['surface-laptop-7', 'Surface Laptop 7 13.8"', 1536, 1024, 1.5, 2024, est],
      ['surface-laptop-13', 'Surface Laptop 13.5"', 1504, 1003, 1.5, 2022],
      ['surface-laptop-15', 'Surface Laptop 15"', 1664, 1110, 1.5, 2022],
      ['surface-laptop-studio', 'Surface Laptop Studio', 1600, 1067, 1.5, 2023, est],
      ['surface-book-13', 'Surface Book 13.5"', 1500, 1000, 2, 2020],
      ['surface-book-15', 'Surface Book 15"', 1620, 1080, 2, 2020]
    ]
  },
  {
    brand: 'Google',
    kind: 'laptop',
    os: 'chromeos',
    rows: [
      ['chromebook', 'Chromebook HD', 1366, 768, 1, 0],
      ['chromebook-plus', 'Chromebook Plus (Full HD)', 1536, 864, 1.25, 2024, est],
      ['pixelbook', 'Pixelbook', 1200, 800, 2, 2017]
    ]
  },

  /* ---------------- desktops ---------------- */
  {
    brand: 'Apple',
    kind: 'desktop',
    os: 'macos',
    rows: [
      ['imac-24', 'iMac 24"', 2240, 1260, 2, 2024],
      ['imac-27', 'iMac 27" 5K / Studio Display', 2560, 1440, 2, 2022],
      ['pro-display-xdr', 'Pro Display XDR', 3008, 1692, 2, 2019],
      ['imac-21-4k', 'iMac 21.5" 4K', 2048, 1152, 2, 2019],
      ['imac-21', 'iMac 21.5"', 1920, 1080, 1, 2017]
    ]
  },
  {
    brand: 'Monitor',
    kind: 'desktop',
    os: 'windows',
    rows: [
      ['desktop-1080p', 'Full HD 1920 × 1080 (most common)', 1920, 1080, 1, 0],
      ['desktop-1440p', 'QHD 2560 × 1440', 2560, 1440, 1, 0],
      ['desktop-4k', '4K 3840 × 2160 at 100%', 3840, 2160, 1, 0],
      ['desktop-4k-150', '4K at 150%', 2560, 1440, 1.5, 0],
      ['desktop-4k-200', '4K at 200%', 1920, 1080, 2, 0],
      ['desktop-1920x1200', 'WUXGA 1920 × 1200', 1920, 1200, 1, 0],
      ['desktop-1680x1050', 'WSXGA+ 1680 × 1050', 1680, 1050, 1, 0],
      ['desktop-1600x900', 'HD+ 1600 × 900', 1600, 900, 1, 0],
      ['desktop-1440x900', 'WXGA+ 1440 × 900', 1440, 900, 1, 0],
      ['desktop-1280x1024', 'SXGA 1280 × 1024', 1280, 1024, 1, 0],
      ['desktop-1280x720', 'HD 1280 × 720', 1280, 720, 1, 0],
      ['desktop-1024x768', 'XGA 1024 × 768', 1024, 768, 1, 0],
      ['desktop-2560x1600', 'WQXGA 2560 × 1600', 2560, 1600, 1, 0],
      ['ultrawide-1080', 'Ultrawide 2560 × 1080', 2560, 1080, 1, 0],
      ['ultrawide', 'Ultrawide 3440 × 1440', 3440, 1440, 1, 0],
      ['ultrawide-1600', 'Ultrawide 3840 × 1600', 3840, 1600, 1, 0],
      ['super-ultrawide', 'Super ultrawide 5120 × 1440', 5120, 1440, 1, 0],
      ['monitor-portrait', 'Portrait monitor 1080 × 1920', 1080, 1920, 1, 0]
    ]
  },

  /* ---------------- TVs, consoles, displays ---------------- */
  {
    brand: 'TV',
    kind: 'tv',
    os: 'other',
    rows: [
      ['tv-1080p', 'Smart TV 1080p', 1920, 1080, 1, 0],
      ['tv-4k', 'Smart TV 4K', 1920, 1080, 2, 0],
      ['tv-720p', 'Smart TV 720p', 1280, 720, 1, 0],
      ['xbox', 'Xbox (Edge)', 1920, 1080, 1, 2020, est],
      ['steam-deck', 'Steam Deck', 1280, 800, 1, 2022],
      ['nintendo-switch', 'Nintendo Switch', 1280, 720, 1, 2017]
    ]
  },
  {
    brand: 'Smart display',
    kind: 'other',
    os: 'android',
    rows: [
      ['nest-hub', 'Nest Hub', 1024, 600, 2, 2021, { radius: 12 }],
      ['nest-hub-max', 'Nest Hub Max', 1280, 800, 2, 2019, { radius: 12 }],
      ['echo-show-15', 'Echo Show 15', 1920, 1080, 1, 2021, both({ radius: 8 }, est)],
      ['echo-show-8', 'Echo Show 8 / 10', 1280, 800, 1, 2021, both({ radius: 12 }, est)],
      ['echo-show-5', 'Echo Show 5', 960, 480, 1, 2021, both({ radius: 12 }, est)],
      ['kindle-paperwhite', 'Kindle Paperwhite', 758, 1024, 1, 2021, both({ radius: 4 }, est)],
      ['family-hub', 'Samsung Family Hub fridge', 1080, 1920, 1, 2022, est]
    ]
  },

  /* ---------------- watches ---------------- */
  {
    brand: 'Apple',
    kind: 'watch',
    os: 'watchos',
    rows: [
      ['apple-watch-ultra', 'Apple Watch Ultra', 205, 251, 2, 2024, { radius: 44, cutout: 'none' }],
      ['apple-watch-46', 'Apple Watch 46mm (Series 10 / 11)', 208, 248, 2, 2025, { radius: 44, cutout: 'none' }],
      ['apple-watch-42-s10', 'Apple Watch 42mm (Series 10 / 11)', 187, 223, 2, 2025, { radius: 40, cutout: 'none' }],
      ['apple-watch', 'Apple Watch 45mm (Series 7 to 9)', 198, 242, 2, 2023, { radius: 40, cutout: 'none' }],
      ['apple-watch-41', 'Apple Watch 41mm (Series 7 to 9)', 176, 215, 2, 2023, { radius: 36, cutout: 'none' }],
      ['apple-watch-44', 'Apple Watch 44mm (Series 4 to 6, SE)', 184, 224, 2, 2022, { radius: 36, cutout: 'none' }],
      ['apple-watch-40', 'Apple Watch 40mm (Series 4 to 6, SE)', 162, 197, 2, 2022, { radius: 32, cutout: 'none' }],
      ['apple-watch-38', 'Apple Watch 38mm (Series 1 to 3)', 136, 170, 2, 2017, { radius: 28, cutout: 'none' }]
    ]
  },
  {
    brand: 'Wear OS',
    kind: 'watch',
    os: 'android',
    rows: [
      ['pixel-watch', 'Pixel Watch', 192, 192, 2, 2024, { radius: 96, cutout: 'none' }],
      ['galaxy-watch', 'Galaxy Watch', 180, 180, 2, 2024, { radius: 90, cutout: 'none' }],
      ['wear-os-large', 'Wear OS 1.4" round', 227, 227, 2, 2022, { radius: 113, cutout: 'none' }]
    ]
  }
]

const HANDHELD: DeviceKind[] = ['phone', 'foldable', 'tablet', 'watch']

const RESPONSIVE: Device = {
  id: 'responsive',
  name: 'Responsive',
  brand: 'Facet',
  kind: 'responsive',
  os: 'other',
  width: 480,
  height: 800,
  dpr: 2,
  mobile: false,
  touch: false
}

export const BUILTIN_DEVICES: Device[] = [
  ...GROUPS.flatMap(({ brand, kind, os, rows }) =>
    rows.map(([id, name, width, height, dpr, year, extra]): Device => {
      const handheld = HANDHELD.includes(kind)
      return { id, name, brand, kind, os, width, height, dpr, year: year || undefined, mobile: handheld, touch: handheld, ...extra }
    })
  ),
  RESPONSIVE
]

export const RESPONSIVE_ID = 'responsive'

export const KIND_LABELS: Record<DeviceKind, string> = {
  phone: 'Phones',
  foldable: 'Foldables',
  tablet: 'Tablets',
  laptop: 'Laptops',
  desktop: 'Desktops',
  tv: 'TVs and consoles',
  watch: 'Watches',
  other: 'Smart displays',
  responsive: 'Resizable'
}

export const BUILTIN_SUITES: Suite[] = [
  { id: 'default', name: 'Essentials', deviceIds: ['iphone-17', 'ipad', 'macbook-air-13'], builtin: true },
  { id: 'popular', name: 'Most common sizes', deviceIds: ['android-360x800', 'iphone-16', 'android-412x915', 'ipad', 'laptop-1536', 'desktop-1080p'], builtin: true },
  { id: 'phones', name: 'Phones', deviceIds: ['iphone-se', 'iphone-17', 'iphone-18-pro-max', 'galaxy-s26', 'pixel-11', 'android-360x800'], builtin: true },
  { id: 'latest', name: 'Latest flagships', deviceIds: ['iphone-18-pro-max', 'iphone-18-pro', 'galaxy-s26-ultra', 'pixel-11-pro', 'z-fold-7-open'], builtin: true },
  { id: 'tablets', name: 'Tablets', deviceIds: ['ipad-mini', 'ipad', 'ipad-pro-13', 'galaxy-tab-s9'], builtin: true },
  { id: 'desktops', name: 'Laptops and desktops', deviceIds: ['laptop-hd', 'laptop-1536', 'macbook-air-13', 'desktop-1080p', 'desktop-1440p'], builtin: true },
  { id: 'apple', name: 'Apple', deviceIds: ['iphone-se', 'iphone-17', 'iphone-18-pro-max', 'ipad', 'macbook-air-13'], builtin: true },
  { id: 'foldables', name: 'Foldables', deviceIds: ['z-fold-folded', 'z-fold-open', 'z-fold-7-open', 'z-flip', 'pixel-11-pro-fold-open'], builtin: true },
  { id: 'extremes', name: 'Extremes', deviceIds: ['apple-watch', 'phone-320', 'z-fold-folded', 'ultrawide', 'super-ultrawide'], builtin: true }
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
