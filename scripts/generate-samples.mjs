// Generates sample images into ./samples for testing the workflow without
// real photos.
//
//   node scripts/generate-samples.mjs               -> 5 detailed 800x600 images
//   node scripts/generate-samples.mjs --count 1000  -> 1000 unique 400x300
//                                                      images in ./samples/perf
//
// Bulk images vary by hue so every file has a distinct content hash (the app
// rejects byte-identical imports as duplicates).
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const CRC_TABLE = new Int32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  CRC_TABLE[n] = c
}

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

function encodePng(pixels, width, height, { level = 9 } = {}) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  const raw = Buffer.alloc(height * (1 + width * 3))
  let offset = 0
  for (let y = 0; y < height; y += 1) {
    raw[offset] = 0 // filter: none
    offset += 1
    for (let x = 0; x < width; x += 1) {
      const i = (y * width + x) * 3
      raw[offset] = pixels[i]
      raw[offset + 1] = pixels[i + 1]
      raw[offset + 2] = pixels[i + 2]
      offset += 3
    }
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value))
}

function mix(a, b, t) {
  return Math.round(a + (b - a) * clamp01(t))
}

const WIDTH = 800
const HEIGHT = 600

// Each sample: background gradient + a simple shape motif.
const SAMPLES = [
  {
    name: 'sample-1-sunset-lake.png',
    top: [252, 165, 90],
    bottom: [86, 60, 120],
    draw(x, y, px) {
      const cx = WIDTH / 2
      const cy = HEIGHT * 0.62
      const d = Math.hypot(x - cx, y - cy)
      if (d < 70)
        px.set([255, 214, 130]) // low sun
      else if (y > HEIGHT * 0.78) px.set([40, 44, 82]) // water band
    },
  },
  {
    name: 'sample-2-forest-fog.png',
    top: [206, 224, 210],
    bottom: [46, 92, 74],
    draw(x, y, px) {
      const trunk = Math.abs(((x % 130) - 65) / 12)
      if (trunk < 1 && y > HEIGHT * 0.35) px.set([54, 66, 52])
      if (y < HEIGHT * 0.18) px.set([238, 244, 238]) // fog band
    },
  },
  {
    name: 'sample-3-city-night.png',
    top: [16, 20, 44],
    bottom: [58, 40, 88],
    draw(x, y, px) {
      const windowX = x % 46
      const windowY = (y - 80) % 60
      if (x > 60 && x < WIDTH - 60 && y > 80 && y < HEIGHT - 60) {
        if (
          windowX > 8 &&
          windowX < 26 &&
          windowY > 10 &&
          windowY < 30 &&
          (x * 7 + y * 13) % 5 > 1
        ) {
          px.set([255, 208, 110]) // lit windows
        }
      }
    },
  },
  {
    name: 'sample-4-desert-dunes.png',
    top: [250, 214, 160],
    bottom: [176, 116, 74],
    draw(x, y, px) {
      const dune = Math.sin(x / 90) * 40 + HEIGHT * 0.6
      if (y > dune) px.set([216, 156, 100])
      const dune2 = Math.sin(x / 140 + 2) * 30 + HEIGHT * 0.78
      if (y > dune2) px.set([150, 96, 62])
    },
  },
  {
    name: 'sample-5-workspace.png',
    top: [235, 238, 242],
    bottom: [188, 196, 208],
    draw(x, y, px) {
      if (x > 160 && x < 640 && y > 160 && y < 420) px.set([62, 68, 84]) // laptop body
      if (x > 190 && x < 610 && y > 190 && y < 390) px.set([118, 158, 255]) // screen
      if (x > 320 && x < 480 && y > 430 && y < 460) px.set([150, 156, 170]) // keyboard base
    },
  },
]

// --- Bulk mode (--count N): small unique gradient images, generated fast. ---

const BULK_WIDTH = 400
const BULK_HEIGHT = 300
const BULK_MAX_COUNT = 5000

function parseCount(argv) {
  const raw = argv.findIndex((arg) => arg === '--count' || arg.startsWith('--count='))
  if (raw === -1) return null
  const value = argv[raw] === '--count' ? argv[raw + 1] : argv[raw].slice('--count='.length)
  const count = Number.parseInt(value, 10)
  if (!Number.isInteger(count) || count < 1 || count > BULK_MAX_COUNT) {
    console.error(`--count expects an integer between 1 and ${BULK_MAX_COUNT} (got: ${value})`)
    process.exit(1)
  }
  return count
}

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l)
  const f = (n) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return [f(0), f(8), f(4)]
}

/**
 * Rows are solid colors (vertical gradient + per-index stripe phase), so the
 * pixel row is materialized once and repeated across the row with doubling
 * copies instead of per-pixel loops. Keeps 1000-image generation in seconds.
 */
function encodeBulkPng(index) {
  const hue = (index * 137.508) % 360 // golden-angle rotation: distinct per image
  const top = hslToRgb(hue, 0.6, 0.72)
  const bottom = hslToRgb(hue, 0.6, 0.28)
  const phase = (index % 97) * 0.65
  const pixels = Buffer.alloc(BULK_WIDTH * BULK_HEIGHT * 3)
  const row = Buffer.alloc(BULK_WIDTH * 3)
  for (let y = 0; y < BULK_HEIGHT; y += 1) {
    const t = y / (BULK_HEIGHT - 1)
    const stripe = 0.82 + 0.18 * Math.sin(y * 0.22 + phase)
    row[0] = Math.round(mix(top[0], bottom[0], t) * stripe)
    row[1] = Math.round(mix(top[1], bottom[1], t) * stripe)
    row[2] = Math.round(mix(top[2], bottom[2], t) * stripe)
    // Doubling copy: 3 bytes -> row of BULK_WIDTH*3 bytes.
    let written = 3
    while (written < row.length) {
      row.copy(row, written, 0, Math.min(written, row.length - written))
      written *= 2
    }
    row.copy(pixels, y * BULK_WIDTH * 3)
  }
  return encodePng(pixels, BULK_WIDTH, BULK_HEIGHT, { level: 1 })
}

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'samples')
mkdirSync(outDir, { recursive: true })

const count = parseCount(process.argv.slice(2))

if (count === null) {
  for (const sample of SAMPLES) {
    const pixels = Buffer.alloc(WIDTH * HEIGHT * 3)
    for (let y = 0; y < HEIGHT; y += 1) {
      const t = y / (HEIGHT - 1)
      for (let x = 0; x < WIDTH; x += 1) {
        const i = (y * WIDTH + x) * 3
        pixels[i] = mix(sample.top[0], sample.bottom[0], t)
        pixels[i + 1] = mix(sample.top[1], sample.bottom[1], t)
        pixels[i + 2] = mix(sample.top[2], sample.bottom[2], t)
        const px = pixels.subarray(i, i + 3)
        sample.draw(x, y, px)
      }
    }
    const file = join(outDir, sample.name)
    writeFileSync(file, encodePng(pixels, WIDTH, HEIGHT))
    console.log(`Wrote ${file}`)
  }
  console.log(`\n${SAMPLES.length} sample images created in ${outDir}`)
} else {
  const perfDir = join(outDir, 'perf')
  mkdirSync(perfDir, { recursive: true })
  const startedAt = Date.now()
  for (let i = 0; i < count; i += 1) {
    const file = join(perfDir, `perf-${String(i + 1).padStart(4, '0')}.png`)
    writeFileSync(file, encodeBulkPng(i))
    if ((i + 1) % 200 === 0) console.log(`  ${i + 1}/${count}`)
  }
  const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(
    `\n${count} perf images (${BULK_WIDTH}x${BULK_HEIGHT}) created in ${perfDir} (${seconds}s)`,
  )
  console.log('Import them all at once to test large-batch performance.')
}
