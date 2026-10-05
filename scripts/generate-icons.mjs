// Regenerates resources/icon.ico (multi-size) from the 1024x1024 master
// resources/icon.png. Windows picks the closest embedded size for the
// taskbar, title bar, Alt-Tab, and Explorer, so a proper .ico carries
// 16/24/32/48/64/128/256 entries instead of one 256 image that gets blurry
// when downscaled.
//
// Entries up to 128px are stored as 32bpp BMP DIBs (maximum compatibility);
// the 256px entry is PNG-compressed (the Vista+ convention that keeps the
// file small). Run: node scripts/generate-icons.mjs
import { deflateSync, inflateSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const BMP_SIZES = [16, 24, 32, 48, 64, 128]
const PNG_SIZE = 256

// ---------------------------------------------------------------------------
// Minimal PNG decoder (8-bit truecolor RGB/RGBA, non-interlaced) — enough for
// the master icon; anything else fails loudly.
// ---------------------------------------------------------------------------

/** Per-byte unfiltering: 0=None 1=Sub 2=Up 3=Average 4=Paeth. */
function unfilterByte(filter, a, b, c) {
  switch (filter) {
    case 1:
      return a
    case 2:
      return b
    case 3:
      return (a + b) >> 1
    case 4: {
      const pa = Math.abs(b - c)
      const pb = Math.abs(a - c)
      const pc = Math.abs(a + b - 2 * c)
      return pa <= pb && pa <= pc ? a : pb <= pc ? b : c
    }
    default:
      return 0
  }
}

function decodePng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error('Not a PNG file')

  let width = 0
  let height = 0
  let colorType = 0
  const idat = []
  let pos = 8
  while (pos + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(pos)
    const type = buffer.toString('ascii', pos + 4, pos + 8)
    const data = buffer.subarray(pos + 8, pos + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      const bitDepth = data[8]
      colorType = data[9]
      const interlace = data[12]
      if (bitDepth !== 8) throw new Error(`Unsupported bit depth: ${bitDepth}`)
      if (colorType !== 2 && colorType !== 6)
        throw new Error(`Unsupported color type: ${colorType} (need RGB/RGBA)`)
      if (interlace !== 0) throw new Error('Interlaced PNG is not supported')
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    pos += 12 + length
  }

  const bpp = colorType === 6 ? 4 : 3
  const stride = width * bpp
  const raw = inflateSync(Buffer.concat(idat))
  const scanlines = Buffer.alloc(height * stride)
  let prev = Buffer.alloc(stride)
  let p = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[p]
    p += 1
    const cur = scanlines.subarray(y * stride, (y + 1) * stride)
    for (let i = 0; i < stride; i += 1) {
      const a = i >= bpp ? cur[i - bpp] : 0
      const b = prev[i]
      const c = i >= bpp ? prev[i - bpp] : 0
      const predictor = unfilterByte(filter, a, b, c)
      cur[i] = (raw[p + i] + predictor) & 0xff
    }
    p += stride
    prev = cur
  }

  const rgba = Buffer.alloc(width * height * 4)
  if (bpp === 4) {
    scanlines.copy(rgba)
  } else {
    for (let i = 0, o = 0; i < scanlines.length; i += 3, o += 4) {
      rgba[o] = scanlines[i]
      rgba[o + 1] = scanlines[i + 1]
      rgba[o + 2] = scanlines[i + 2]
      rgba[o + 3] = 0xff
    }
  }
  return { width, height, rgba }
}

// ---------------------------------------------------------------------------
// Box-filter (area-average) downscale with premultiplied alpha so
// transparent edges do not bleed dark halos into the small sizes.
// ---------------------------------------------------------------------------

function resize(rgba, sw, sh, tw, th) {
  const out = Buffer.alloc(tw * th * 4)
  const sx = sw / tw
  const sy = sh / th
  for (let ty = 0; ty < th; ty += 1) {
    const y0 = ty * sy
    const y1 = (ty + 1) * sy
    for (let tx = 0; tx < tw; tx += 1) {
      const x0 = tx * sx
      const x1 = (tx + 1) * sx
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      let area = 0
      for (let y = Math.floor(y0); y < Math.ceil(y1); y += 1) {
        const fy = Math.min(y1, y + 1) - Math.max(y0, y)
        for (let x = Math.floor(x0); x < Math.ceil(x1); x += 1) {
          const fx = Math.min(x1, x + 1) - Math.max(x0, x)
          const w = fy * fx
          const i = (y * sw + x) * 4
          r += rgba[i] * rgba[i + 3] * w
          g += rgba[i + 1] * rgba[i + 3] * w
          b += rgba[i + 2] * rgba[i + 3] * w
          a += rgba[i + 3] * w
          area += w
        }
      }
      const o = (ty * tw + tx) * 4
      out[o] = a > 0 ? Math.round(r / a) : 0
      out[o + 1] = a > 0 ? Math.round(g / a) : 0
      out[o + 2] = a > 0 ? Math.round(b / a) : 0
      out[o + 3] = Math.round(a / area)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// ICO assembly
// ---------------------------------------------------------------------------

function bmpDibEntry(rgba, w, h) {
  // BITMAPINFOHEADER + bottom-up 32bpp BGRA pixels + all-zero AND mask.
  const maskRow = ((w + 31) >> 5) * 4
  const buf = Buffer.alloc(40 + h * w * 4 + h * maskRow)
  buf.writeUInt32LE(40, 0) // biSize
  buf.writeInt32LE(w, 4) // biWidth
  buf.writeInt32LE(h * 2, 8) // biHeight: XOR mask + AND mask
  buf.writeUInt16LE(1, 12) // biPlanes
  buf.writeUInt16LE(32, 14) // biBitCount
  let o = 40
  for (let y = h - 1; y >= 0; y -= 1) {
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4
      buf[o] = rgba[i + 2]
      buf[o + 1] = rgba[i + 1]
      buf[o + 2] = rgba[i]
      buf[o + 3] = rgba[i + 3]
      o += 4
    }
  }
  return buf
}

function pngChunk(type, data) {
  const CRC_TABLE = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    CRC_TABLE[n] = c
  }
  let crc = 0xffffffff
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  for (const byte of body) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const trailer = Buffer.alloc(4)
  trailer.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
  return Buffer.concat([length, body, trailer])
}

function encodePngEntry(rgba, w, h) {
  const raw = Buffer.alloc(h * (1 + w * 4))
  let o = 0
  for (let y = 0; y < h; y += 1) {
    raw[o] = 0 // filter: none
    o += 1
    for (let x = 0; x < w; x += 1) {
      const i = (y * w + x) * 4
      raw[o] = rgba[i]
      raw[o + 1] = rgba[i + 1]
      raw[o + 2] = rgba[i + 2]
      raw[o + 3] = rgba[i + 3]
      o += 4
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function buildIco(images) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved
  header.writeUInt16LE(1, 2) // type: icon
  header.writeUInt16LE(images.length, 4)
  const directory = Buffer.alloc(images.length * 16)
  let offset = header.length + directory.length
  const blobs = []
  images.forEach((image, index) => {
    const entry = index * 16
    const dimension = image.size >= 256 ? 0 : image.size // 0 encodes 256
    directory[entry] = dimension
    directory[entry + 1] = dimension
    directory[entry + 4] = 1 // planes
    directory[entry + 6] = 32 // bit count
    directory.writeUInt32LE(image.data.length, entry + 8)
    directory.writeUInt32LE(offset, entry + 12)
    blobs.push(image.data)
    offset += image.data.length
  })
  return Buffer.concat([header, directory, ...blobs])
}

// ---------------------------------------------------------------------------

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = decodePng(readFileSync(resolve(root, 'resources/icon.png')))
console.log(
  `Master icon: ${source.width}x${source.height} (${(source.rgba.length / 1024 / 1024).toFixed(1)} MB decoded)`,
)

const images = [...BMP_SIZES, PNG_SIZE].map((size) => {
  const rgba = resize(source.rgba, source.width, source.height, size, size)
  const data = size === PNG_SIZE ? encodePngEntry(rgba, size, size) : bmpDibEntry(rgba, size, size)
  console.log(
    `  ${String(size).padStart(3)}x${String(size).padEnd(3)} -> ${(data.length / 1024).toFixed(1)} KB`,
  )
  return { size, data }
})

const ico = buildIco(images)
const outPath = resolve(root, 'resources/icon.ico')
writeFileSync(outPath, ico)
console.log(`\nWrote ${outPath} (${(ico.length / 1024).toFixed(1)} KB, ${images.length} entries)`)
