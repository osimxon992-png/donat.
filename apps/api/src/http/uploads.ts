import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { badRequest } from '../lib/errors';

const SIGNATURES: { ext: string; mime: string; test: (b: Buffer) => boolean }[] = [
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

export function imageUpload(maxBytes: number) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1 },
  }).single('image');
}

/**
 * Persist an uploaded image after checking its magic bytes (the client-supplied MIME type
 * and filename are ignored). Returns the public path. SVG is rejected (script injection risk).
 */
export async function saveImage(file: Express.Multer.File | undefined, uploadDir: string): Promise<string> {
  if (!file) throw badRequest('No image uploaded (field name "image")');
  const kind = SIGNATURES.find((s) => s.test(file.buffer));
  if (!kind) throw badRequest('Only PNG, JPEG or WebP images are allowed');
  await fs.mkdir(uploadDir, { recursive: true });
  const name = `${crypto.randomBytes(16).toString('hex')}.${kind.ext}`;
  await fs.writeFile(path.join(uploadDir, name), file.buffer, { flag: 'wx' });
  return `/uploads/${name}`;
}
