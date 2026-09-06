import imageCompression, { type Options as CompressionOptions } from 'browser-image-compression';
import {
  MAX_UPLOAD_SIZE_BYTES,
  UPLOAD_CONTENT_TYPES,
  type UploadContentType,
} from '@kaipos/shared/schemas/products';
import { ApiError } from '@kaipos/app-runtime';
import { generateUploadUrl } from './products-api.js';

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type UploadImageErrorCode =
  | 'BRANCH_REQUIRED'
  | 'UNSUPPORTED_TYPE'
  | 'TOO_LARGE'
  | 'UPLOAD_FAILED'
  | 'ASSETS_NOT_CONFIGURED';

export class UploadImageError extends Error {
  readonly code: UploadImageErrorCode;

  constructor(code: UploadImageErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'UploadImageError';
    this.code = code;
  }
}

const ERROR_MESSAGES: Record<UploadImageErrorCode, string> = {
  BRANCH_REQUIRED: 'Selecciona una sucursal antes de subir la imagen.',
  UNSUPPORTED_TYPE: 'Formato no soportado. Usa JPG, PNG o WEBP.',
  TOO_LARGE: 'La imagen supera el máximo de 10 MB incluso después de comprimirla.',
  ASSETS_NOT_CONFIGURED: 'El almacenamiento de imágenes no está configurado en este entorno.',
  UPLOAD_FAILED: 'No pudimos subir la imagen. Inténtalo de nuevo.',
};

export function uploadErrorMessage(code: UploadImageErrorCode): string {
  return ERROR_MESSAGES[code];
}

// ---------------------------------------------------------------------------
// Compression
// ---------------------------------------------------------------------------

// Product photos are shown at thumbnail / card sizes, so 1600px on the long
// edge at ~1 MB WebP is plenty. The backend still enforces the 10 MB cap; the
// compression only exists so phone camera shots (5–12 MB) fit comfortably.
//
// `useWebWorker` is off on purpose: the library bootstraps its worker with an
// `importScripts` from a public CDN (jsdelivr), which is a runtime dependency
// on a third party and breaks offline / any future CSP. One image on the main
// thread costs well under a second and the upload button is already disabled
// while it runs.
export const COMPRESSION_OPTIONS: CompressionOptions = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1600,
  fileType: 'image/webp',
  useWebWorker: false,
  initialQuality: 0.85,
};

function isUploadContentType(type: string): type is UploadContentType {
  return (UPLOAD_CONTENT_TYPES as readonly string[]).includes(type);
}

function extensionFor(type: UploadContentType): string {
  switch (type) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/webp':
      return '.webp';
  }
}

// The lib is typed to return a `File`, but some browsers hand back a bare
// `Blob` (no `name`). Normalise so callers always get a real File with a name
// whose extension matches the actual MIME type.
function toNamedFile(blob: Blob, originalName: string, type: UploadContentType): File {
  const name = originalName.replace(/\.[^.]+$/, '') + extensionFor(type);
  if (blob instanceof File && blob.name === name && blob.type === type) return blob;
  return new File([blob], name, { type, lastModified: Date.now() });
}

/**
 * Validates the MIME type, compresses to WebP (falling back to the original
 * file when compression fails or produces an unsupported type) and enforces
 * the shared 10 MB cap on whatever is about to be uploaded.
 */
export async function prepareImageForUpload(file: File): Promise<File> {
  if (!isUploadContentType(file.type)) {
    throw new UploadImageError('UNSUPPORTED_TYPE');
  }

  let prepared: File = file;
  try {
    const compressed: Blob = await imageCompression(file, COMPRESSION_OPTIONS);
    // Safari can ignore the requested `fileType` and return e.g. image/png or
    // an empty type; only trust the result if it's something the API accepts.
    if (isUploadContentType(compressed.type)) {
      prepared = toNamedFile(compressed, file.name, compressed.type);
    }
  } catch {
    // Compression is best-effort: fall back to the original and let the size
    // check below decide.
    prepared = file;
  }

  if (prepared.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new UploadImageError('TOO_LARGE');
  }
  return prepared;
}

// ---------------------------------------------------------------------------
// Upload
// ---------------------------------------------------------------------------

export interface UploadProductImageInput {
  branchId: string | null | undefined;
  file: File;
}

/**
 * Full client-side flow for a product (or variant) image: validate + compress,
 * presign with the real content type / size, PUT to S3, return the public URL.
 * Every failure surfaces as an `UploadImageError` so callers can map `code`
 * through `uploadErrorMessage`.
 */
export async function uploadProductImage({
  branchId,
  file,
}: UploadProductImageInput): Promise<string> {
  if (!branchId) {
    throw new UploadImageError('BRANCH_REQUIRED');
  }

  const prepared = await prepareImageForUpload(file);
  // `prepareImageForUpload` guarantees the type is one of UPLOAD_CONTENT_TYPES.
  const contentType = prepared.type as UploadContentType;

  let uploadUrl: string;
  let publicUrl: string;
  try {
    ({ uploadUrl, publicUrl } = await generateUploadUrl({
      branchId,
      contentType,
      fileSize: prepared.size,
    }));
  } catch (err) {
    if (err instanceof ApiError && err.code === 'ASSETS_NOT_CONFIGURED') {
      throw new UploadImageError('ASSETS_NOT_CONFIGURED', err.message);
    }
    throw new UploadImageError('UPLOAD_FAILED', err instanceof Error ? err.message : undefined);
  }

  let putRes: Response;
  try {
    putRes = await fetch(uploadUrl, {
      method: 'PUT',
      headers: { 'content-type': contentType },
      body: prepared,
    });
  } catch (err) {
    throw new UploadImageError('UPLOAD_FAILED', err instanceof Error ? err.message : undefined);
  }
  if (!putRes.ok) {
    throw new UploadImageError('UPLOAD_FAILED', `S3 upload failed: ${putRes.status}`);
  }

  return publicUrl;
}
