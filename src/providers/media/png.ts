/**
 * Tiny real PNG writers for fixture mode — always produce readable files.
 * Minimal valid PNG encoder (no external deps).
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import crypto from "crypto";

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** Write a solid-color PNG of given size (RGBA). */
export function encodePng(
  width: number,
  height: number,
  rgba: [number, number, number, number] = [72, 61, 139, 255]
): Buffer {
  const w = Math.max(1, Math.min(width, 2048));
  const h = Math.max(1, Math.min(height, 2048));
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const rowStart = y * (w * 4 + 1);
    raw[rowStart] = 0; // filter none
    for (let x = 0; x < w; x++) {
      const i = rowStart + 1 + x * 4;
      // Subtle gradient so it's not a "blank failure" look
      const t = (x + y) % 32;
      raw[i] = Math.min(255, rgba[0] + t);
      raw[i + 1] = Math.min(255, rgba[1] + Math.floor(t / 2));
      raw[i + 2] = Math.min(255, rgba[2]);
      raw[i + 3] = rgba[3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const compressed = zlib.deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function resolveDims(
  aspectRatio?: string,
  width?: number,
  height?: number
): { width: number; height: number } {
  if (width && height) return { width, height };
  const map: Record<string, [number, number]> = {
    "1:1": [1024, 1024],
    "4:5": [1080, 1350],
    "16:9": [1920, 1080],
    "9:16": [1080, 1920],
    "3:2": [1500, 1000],
    "2:3": [1000, 1500],
  };
  const pair = map[aspectRatio ?? "1:1"] ?? [1024, 1024];
  // Fixture files stay small for git/tests; live OpenAI uses full size on download
  return { width: width ?? Math.min(pair[0], 64), height: height ?? Math.min(pair[1], 64) };
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function writeFixturePng(opts: {
  outputDir: string;
  width?: number;
  height?: number;
  aspectRatio?: string;
  seed?: string;
}): { mediaPath: string; width: number; height: number; generationId: string } {
  const dims = resolveDims(opts.aspectRatio, opts.width, opts.height);
  ensureDir(opts.outputDir);
  const generationId = `fix_${crypto
    .createHash("sha1")
    .update(opts.seed ?? `${Date.now()}-${Math.random()}`)
    .digest("hex")
    .slice(0, 16)}`;
  const filename = `${generationId}.png`;
  const mediaPath = path.join(opts.outputDir, filename);
  // Deterministic-ish color from seed
  const h = crypto.createHash("md5").update(opts.seed ?? generationId).digest();
  const rgba: [number, number, number, number] = [
    40 + (h[0]! % 160),
    40 + (h[1]! % 160),
    40 + (h[2]! % 160),
    255,
  ];
  const buf = encodePng(dims.width, dims.height, rgba);
  fs.writeFileSync(mediaPath, buf);
  return { mediaPath, width: dims.width, height: dims.height, generationId };
}

export function isReadableImageFile(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const st = fs.statSync(filePath);
    if (!st.isFile() || st.size < 32) return false;
    const fd = fs.openSync(filePath, "r");
    const header = Buffer.alloc(8);
    fs.readSync(fd, header, 0, 8, 0);
    fs.closeSync(fd);
    // PNG signature
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (header.equals(png)) return true;
    // JPEG
    if (header[0] === 0xff && header[1] === 0xd8) return true;
    // WebP "RIFF"
    if (header.slice(0, 4).toString("ascii") === "RIFF") return true;
    return st.size > 100; // allow other binary if sizable
  } catch {
    return false;
  }
}

export function defaultStorageDir(): string {
  return (
    process.env.HNE_MEDIA_DIR?.trim() ||
    path.join(process.cwd(), "storage", "generated")
  );
}
