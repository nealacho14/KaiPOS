import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@kaipos/app-runtime';
import { MAX_UPLOAD_SIZE_BYTES } from '@kaipos/shared/schemas/products';
import imageCompression from 'browser-image-compression';
import { generateUploadUrl } from './products-api.js';
import {
  COMPRESSION_OPTIONS,
  UploadImageError,
  prepareImageForUpload,
  uploadErrorMessage,
  uploadProductImage,
} from './upload-image.js';

vi.mock('browser-image-compression', () => ({
  default: vi.fn(),
}));

vi.mock('./products-api.js', () => ({
  generateUploadUrl: vi.fn(),
}));

const compressionMock = vi.mocked(imageCompression);
const generateUploadUrlMock = vi.mocked(generateUploadUrl);

const MB = 1024 * 1024;

// Real bytes rather than a stubbed `.size`: the helper re-wraps compressed
// blobs into a new File, and that copy must report the same size.
function fakeFile(name: string, type: string, size: number): File {
  return new File([new Uint8Array(size)], name, { type });
}

const PRESIGN = {
  uploadUrl: 'https://bucket.s3.amazonaws.com/products/br-1/x.webp?sig=abc',
  publicUrl: 'https://cdn.example.com/products/br-1/x.webp',
  expiresIn: 60,
};

async function expectUploadError(promise: Promise<unknown>, code: UploadImageError['code']) {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(UploadImageError);
  expect((err as UploadImageError).code).toBe(code);
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  compressionMock.mockReset();
  generateUploadUrlMock.mockReset();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('uploadProductImage', () => {
  it('compresses with COMPRESSION_OPTIONS and presigns with the compressed type/size', async () => {
    const original = fakeFile('photo.jpg', 'image/jpeg', 3 * MB);
    const compressed = fakeFile('photo.jpg', 'image/webp', 600_000);
    compressionMock.mockResolvedValue(compressed);
    generateUploadUrlMock.mockResolvedValue(PRESIGN);

    const url = await uploadProductImage({ branchId: 'br-1', file: original });

    expect(url).toBe(PRESIGN.publicUrl);
    expect(compressionMock).toHaveBeenCalledTimes(1);
    expect(compressionMock).toHaveBeenCalledWith(original, COMPRESSION_OPTIONS);
    expect(generateUploadUrlMock).toHaveBeenCalledWith({
      branchId: 'br-1',
      contentType: 'image/webp',
      fileSize: 600_000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [putUrl, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(putUrl).toBe(PRESIGN.uploadUrl);
    expect(init.method).toBe('PUT');
    expect(init.headers).toEqual({ 'content-type': 'image/webp' });
    const body = init.body as File;
    expect(body).toBeInstanceOf(File);
    expect(body.type).toBe('image/webp');
    expect(body.name).toBe('photo.webp');
  });

  it('uploads a 12 MB PNG once compression brings it down to 0.8 MB', async () => {
    const original = fakeFile('big.png', 'image/png', 12 * MB);
    const compressed = fakeFile('big.png', 'image/webp', Math.round(0.8 * MB));
    compressionMock.mockResolvedValue(compressed);
    generateUploadUrlMock.mockResolvedValue(PRESIGN);

    await expect(uploadProductImage({ branchId: 'br-1', file: original })).resolves.toBe(
      PRESIGN.publicUrl,
    );
    expect(generateUploadUrlMock).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: 'image/webp', fileSize: Math.round(0.8 * MB) }),
    );
  });

  it('falls back to the original when compression throws, and rejects it above 10 MB', async () => {
    compressionMock.mockRejectedValue(new Error('canvas unavailable'));

    // Under the cap: the original goes through untouched.
    const small = fakeFile('small.jpg', 'image/jpeg', 2 * MB);
    generateUploadUrlMock.mockResolvedValue(PRESIGN);
    await expect(uploadProductImage({ branchId: 'br-1', file: small })).resolves.toBe(
      PRESIGN.publicUrl,
    );
    expect(generateUploadUrlMock).toHaveBeenCalledWith({
      branchId: 'br-1',
      contentType: 'image/jpeg',
      fileSize: 2 * MB,
    });
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].body).toBe(small);

    // Over the cap: TOO_LARGE before any network call.
    generateUploadUrlMock.mockClear();
    fetchMock.mockClear();
    const huge = fakeFile('huge.jpg', 'image/jpeg', MAX_UPLOAD_SIZE_BYTES + 1);
    await expectUploadError(uploadProductImage({ branchId: 'br-1', file: huge }), 'TOO_LARGE');
    expect(generateUploadUrlMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects image/gif with UNSUPPORTED_TYPE before compressing', async () => {
    const gif = fakeFile('anim.gif', 'image/gif', 100_000);

    await expectUploadError(
      uploadProductImage({ branchId: 'br-1', file: gif }),
      'UNSUPPORTED_TYPE',
    );
    expect(compressionMock).not.toHaveBeenCalled();
    expect(generateUploadUrlMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a non-ok PUT to UPLOAD_FAILED', async () => {
    compressionMock.mockResolvedValue(fakeFile('p.jpg', 'image/webp', 100_000));
    generateUploadUrlMock.mockResolvedValue(PRESIGN);
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    await expectUploadError(
      uploadProductImage({ branchId: 'br-1', file: fakeFile('p.jpg', 'image/jpeg', 100_000) }),
      'UPLOAD_FAILED',
    );
  });

  it('rejects with BRANCH_REQUIRED when no branch is selected', async () => {
    const file = fakeFile('p.jpg', 'image/jpeg', 100_000);

    await expectUploadError(uploadProductImage({ branchId: null, file }), 'BRANCH_REQUIRED');
    await expectUploadError(uploadProductImage({ branchId: undefined, file }), 'BRANCH_REQUIRED');
    await expectUploadError(uploadProductImage({ branchId: '', file }), 'BRANCH_REQUIRED');
    expect(compressionMock).not.toHaveBeenCalled();
  });

  it('maps ASSETS_NOT_CONFIGURED from the presign endpoint', async () => {
    compressionMock.mockResolvedValue(fakeFile('p.jpg', 'image/webp', 100_000));
    generateUploadUrlMock.mockRejectedValue(
      new ApiError('Asset storage not configured', 503, 'ASSETS_NOT_CONFIGURED'),
    );

    await expectUploadError(
      uploadProductImage({ branchId: 'br-1', file: fakeFile('p.jpg', 'image/jpeg', 100_000) }),
      'ASSETS_NOT_CONFIGURED',
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps any other presign failure to UPLOAD_FAILED', async () => {
    compressionMock.mockResolvedValue(fakeFile('p.jpg', 'image/webp', 100_000));
    generateUploadUrlMock.mockRejectedValue(new ApiError('Forbidden', 403, 'FORBIDDEN'));

    await expectUploadError(
      uploadProductImage({ branchId: 'br-1', file: fakeFile('p.jpg', 'image/jpeg', 100_000) }),
      'UPLOAD_FAILED',
    );
  });
});

describe('prepareImageForUpload', () => {
  it('keeps the original when the compressed result has an unsupported type', async () => {
    const original = fakeFile('photo.png', 'image/png', 500_000);
    // Safari may ignore `fileType` and hand back something else entirely.
    compressionMock.mockResolvedValue(fakeFile('photo.png', 'image/heic', 100_000));

    const prepared = await prepareImageForUpload(original);
    expect(prepared).toBe(original);
  });

  it('wraps a bare Blob result into a File with a matching extension', async () => {
    const original = fakeFile('photo.jpeg', 'image/jpeg', 500_000);
    compressionMock.mockResolvedValue(
      new Blob(['compressed'], { type: 'image/webp' }) as unknown as File,
    );

    const prepared = await prepareImageForUpload(original);
    expect(prepared).toBeInstanceOf(File);
    expect(prepared.name).toBe('photo.webp');
    expect(prepared.type).toBe('image/webp');
  });
});

describe('uploadErrorMessage', () => {
  it('returns Spanish copy for every code', () => {
    expect(uploadErrorMessage('BRANCH_REQUIRED')).toBe(
      'Selecciona una sucursal antes de subir la imagen.',
    );
    expect(uploadErrorMessage('UNSUPPORTED_TYPE')).toBe(
      'Formato no soportado. Usa JPG, PNG o WEBP.',
    );
    expect(uploadErrorMessage('TOO_LARGE')).toBe(
      'La imagen supera el máximo de 10 MB incluso después de comprimirla.',
    );
    expect(uploadErrorMessage('ASSETS_NOT_CONFIGURED')).toBe(
      'El almacenamiento de imágenes no está configurado en este entorno.',
    );
    expect(uploadErrorMessage('UPLOAD_FAILED')).toBe(
      'No pudimos subir la imagen. Inténtalo de nuevo.',
    );
  });
});
