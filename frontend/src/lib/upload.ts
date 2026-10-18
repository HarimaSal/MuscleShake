import { api } from '../api';
import type { Media } from '../types';

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_VIDEO_SECONDS = 180;
const CHUNK_SIZE = 1024 * 1024;

export interface UploadResult {
  media: Media;
  width?: number;
  height?: number;
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return image;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

async function compressImage(file: File): Promise<{ blob: Blob; width: number; height: number; thumb: string }> {
  const image = await loadImage(file);
  const maxEdge = 1920;
  const scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  let quality = 0.82;
  let blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  while (blob && blob.size > 500 * 1024 && quality > 0.6) {
    quality -= 0.06;
    blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  }

  const thumbCanvas = document.createElement('canvas');
  const thumbScale = Math.min(1, 480 / Math.max(width, height));
  thumbCanvas.width = Math.round(width * thumbScale);
  thumbCanvas.height = Math.round(height * thumbScale);
  thumbCanvas.getContext('2d')!.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
  const thumb = thumbCanvas.toDataURL('image/jpeg', 0.7);
  if (!blob) throw new Error('图片压缩失败');
  return { blob, width, height, thumb };
}

async function readVideo(file: File): Promise<{ duration: number; width: number; height: number; thumb: string }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = url;
  video.muted = true;
  video.playsInline = true;
  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('无法读取视频信息'));
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    video.currentTime = Math.min(1, duration / 3 || 0);
    await new Promise<void>((resolve) => {
      video.onseeked = () => resolve();
      setTimeout(resolve, 800);
    });
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 720 / Math.max(video.videoWidth || 720, video.videoHeight || 1280));
    canvas.width = Math.round((video.videoWidth || 720) * scale);
    canvas.height = Math.round((video.videoHeight || 1280) * scale);
    canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return {
      duration,
      width: video.videoWidth,
      height: video.videoHeight,
      thumb: canvas.toDataURL('image/jpeg', 0.7),
    };
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
}

export async function uploadMedia(
  file: File,
  options: {
    watermark?: boolean;
    onProgress?: (progress: number, phase: string) => void;
    signal?: AbortSignal;
    onSession?: (uploadId: string) => void;
  } = {},
): Promise<UploadResult> {
  const isVideo = file.type.startsWith('video/');
  const isImage = file.type.startsWith('image/');
  api
    .post('/api/config/events', {
      name: 'media_upload_start',
      props: { type: isVideo ? 'video' : 'image', size: file.size, count: 1 },
    })
    .catch(() => undefined);
  if (!isImage && !isVideo) throw new Error('暂不支持该格式，请使用 JPG/PNG/WebP 或 MP4/MOV');
  if (isVideo) {
    if (file.size > MAX_VIDEO_BYTES) throw new Error('视频请在 200MB 以内，或到电脑端上传');
    const meta = await readVideo(file);
    if (!meta.duration || meta.duration > MAX_VIDEO_SECONDS + 1) {
      throw new Error('视频请在 3 分钟内，或到电脑端上传');
    }
    return uploadWithMeta(file, {
      mime: file.type || 'video/mp4',
      type: 'video',
      size: file.size,
      thumb: meta.thumb,
      durationSec: meta.duration,
      width: meta.width,
      height: meta.height,
      ...options,
    });
  }

  try {
    const compressed = await compressImage(file);
    return uploadWithMeta(file, {
      mime: 'image/jpeg',
      type: 'image',
      size: compressed.blob.size,
      blob: compressed.blob,
      thumb: compressed.thumb,
      width: compressed.width,
      height: compressed.height,
      ...options,
    });
  } catch {
    // 无法解码（如部分 HEIC）时按原图上传
    if (file.size > 20 * 1024 * 1024) throw new Error('图片处理失败，且原图超过 20MB');
    return uploadWithMeta(file, {
      mime: file.type || 'image/jpeg',
      type: 'image',
      size: file.size,
      blob: file,
      ...options,
    });
  }
}

async function uploadWithMeta(
  file: File,
  meta: {
    mime: string;
    type: 'image' | 'video';
    size: number;
    blob?: Blob;
    thumb?: string;
    durationSec?: number;
    width?: number;
    height?: number;
    watermark?: boolean;
    onProgress?: (progress: number, phase: string) => void;
    signal?: AbortSignal;
    onSession?: (uploadId: string) => void;
  },
): Promise<UploadResult> {
  const started = Date.now();
  const session = await api.post('/api/media/upload-sessions', {
    fileName: file.name,
    mime: meta.mime,
    sizeBytes: meta.size,
    type: meta.type,
    durationSec: meta.durationSec,
    width: meta.width,
    height: meta.height,
    watermark: !!meta.watermark,
  });
  meta.onSession?.(session.uploadId);
  const blob = meta.blob ?? file;
  try {
    for (let index = 0; index < session.totalChunks; index++) {
      if (meta.signal?.aborted) throw new Error('已取消上传');
      const start = index * CHUNK_SIZE;
      const chunk = blob.slice(start, Math.min(blob.size, start + CHUNK_SIZE));
      await api.chunk(`/api/media/upload/${session.uploadId}/chunk?index=${index}`, chunk);
      meta.onProgress?.(Math.round(((index + 1) / session.totalChunks) * 100), 'uploading');
    }
    meta.onProgress?.(100, 'processing');
    const media = await api.post(`/api/media/upload/${session.uploadId}/complete`, {
      thumb: meta.thumb,
      width: meta.width,
      height: meta.height,
      durationSec: meta.durationSec,
    });
    api
      .post('/api/config/events', {
        name: 'media_upload_result',
        props: { result: 'success', media_type: meta.type, duration: Date.now() - started, retry_times: 0 },
      })
      .catch(() => undefined);
    return { media, width: meta.width, height: meta.height };
  } catch (err) {
    await api.del(`/api/media/upload/${session.uploadId}`).catch(() => undefined);
    api
      .post('/api/config/events', {
        name: 'media_upload_result',
        props: {
          result: 'fail',
          media_type: meta.type,
          duration: Date.now() - started,
          fail_reason: err instanceof Error ? err.message : 'unknown',
        },
      })
      .catch(() => undefined);
    throw err;
  }
}

export function validateFiles(files: FileList | File[]): File[] {
  return Array.from(files).slice(0, 9);
}
