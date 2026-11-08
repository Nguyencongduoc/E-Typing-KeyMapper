const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

function createPng(width, height, pixelFn) {
  const bytesPerPixel = 4;
  const scanlineLength = width * bytesPerPixel;
  const rawData = Buffer.alloc((scanlineLength + 1) * height);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (scanlineLength + 1);
    rawData[rowOffset] = 0; // Filter type: None
    for (let x = 0; x < width; x++) {
      const pxOffset = rowOffset + 1 + x * bytesPerPixel;
      const [r, g, b, a] = pixelFn(x, y, width, height);
      rawData[pxOffset] = r;
      rawData[pxOffset + 1] = g;
      rawData[pxOffset + 2] = b;
      rawData[pxOffset + 3] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);

  function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const idatChunk = makeChunk('IDAT', compressed);
  const ihdrChunk = makeChunk('IHDR', ihdr);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function iconPixel(x, y, w, h) {
  const nx = x / (w - 1);
  const ny = y / (h - 1);

  // Rounded rectangle check
  const r = 0.2;
  const dx = Math.max(Math.abs(nx - 0.5) - (0.5 - r), 0);
  const dy = Math.max(Math.abs(ny - 0.5) - (0.5 - r), 0);
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist > r) return [0, 0, 0, 0];

  // Border: cyan/sky-blue #38bdf8
  const isBorder = dist > r - 0.08 || nx < 0.08 || nx > 0.92 || ny < 0.08 || ny > 0.92;
  if (isBorder) return [56, 189, 248, 255];

  // Background: dark slate #0f172a
  // Keyboard illustration in center
  // Key 1 (left)
  const inKeyLeft = nx >= 0.22 && nx <= 0.44 && ny >= 0.32 && ny <= 0.68;
  const inKeyRight = nx >= 0.56 && nx <= 0.78 && ny >= 0.32 && ny <= 0.68;
  const inSpace = nx >= 0.28 && nx <= 0.72 && ny >= 0.74 && ny <= 0.86;

  if (inKeyLeft || inKeyRight || inSpace) {
    return [56, 189, 248, 255]; // cyan key
  }

  return [15, 23, 42, 255]; // slate background
}

const iconsDir = path.resolve(__dirname, '..', 'icons');
fs.mkdirSync(iconsDir, { recursive: true });

for (const size of [16, 32, 48, 128]) {
  const buf = createPng(size, size, iconPixel);
  fs.writeFileSync(path.join(iconsDir, `icon${size}.png`), buf);
}
console.log('Icons generated successfully: 16, 32, 48, 128px.');

