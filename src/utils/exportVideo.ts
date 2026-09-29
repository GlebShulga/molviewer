import { paintWatermark } from './exportImage';

/**
 * Turntable video export: records the WebGL canvas while the camera orbits the
 * molecule once, using canvas.captureStream() + MediaRecorder (no encoder
 * dependency). Each frame is composited into a 2D canvas together with the URL
 * watermark, and that 2D canvas is what gets recorded.
 */

export type VideoFormat = 'mp4' | 'webm';

export interface VideoFormatOption {
  format: VideoFormat;
  mimeType: string;
}

/** Candidates in preference order. H.264 MP4 is the most shareable. */
const MIME_CANDIDATES: Record<VideoFormat, string[]> = {
  mp4: ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4'],
  webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
};

export const TURNTABLE_DURATIONS = [4, 8, 12] as const;
export const DEFAULT_TURNTABLE_SECONDS = 8;
export const TURNTABLE_FPS = 30;
const DEFAULT_BITRATE = 8_000_000;

function defaultIsTypeSupported(type: string): boolean {
  return typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(type);
}

/**
 * Return the recordable formats, MP4 first (preferred when available), each
 * with the best supported mime type.
 */
export function getSupportedVideoFormats(
  isTypeSupported: (type: string) => boolean = defaultIsTypeSupported
): VideoFormatOption[] {
  const result: VideoFormatOption[] = [];
  for (const format of ['mp4', 'webm'] as const) {
    const mimeType = MIME_CANDIDATES[format].find((t) => {
      try {
        return isTypeSupported(t);
      } catch {
        return false;
      }
    });
    if (mimeType) result.push({ format, mimeType });
  }
  return result;
}

/** Whether this browser can record a canvas at all. */
export function isVideoExportSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    getSupportedVideoFormats().length > 0
  );
}

/** File extension for a recorded mime type (falls back to webm). */
export function videoExtension(mimeType: string): VideoFormat {
  return mimeType.toLowerCase().startsWith('video/mp4') ? 'mp4' : 'webm';
}

/** Camera angle (radians) for a turntable that completes one turn in durationMs. */
export function turntableAngle(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return Math.PI * 2;
  return Math.PI * 2 * Math.min(1, Math.max(0, elapsedMs / durationMs));
}

/** Round down to an even pixel size (H.264 needs even dimensions). */
export function evenDimension(n: number): number {
  const v = Math.max(2, Math.floor(n));
  return v - (v % 2);
}

/**
 * How long to keep recording the final frame after the turn completes, given
 * the average frame interval. Zero at normal frame rates; up to 1 s when the
 * renderer is slow, which gives the encoder time to flush the tail.
 */
export function tailHoldMs(avgFrameIntervalMs: number): number {
  if (!(avgFrameIntervalMs > 40)) return 0;
  return Math.min(1000, Math.round(avgFrameIntervalMs * 3));
}

export interface TurntableTarget {
  /** The WebGL canvas. Must use preserveDrawingBuffer so it can be read any time. */
  canvas: HTMLCanvasElement;
  /** Rotate the view to `angle` radians away from the start pose. */
  setAngle: (angle: number) => void;
  /** CSS color painted behind the frame (for transparent scene backgrounds). */
  background: string;
}

export interface RecordTurntableOptions {
  seconds: number;
  mimeType: string;
  fps?: number;
  videoBitsPerSecond?: number;
  watermark?: string;
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

/**
 * Record one full turn. Resolves with the video blob, or null if cancelled.
 * The caller is responsible for saving and restoring the camera.
 */
export function recordTurntable(
  target: TurntableTarget,
  options: RecordTurntableOptions
): Promise<Blob | null> {
  const {
    seconds,
    mimeType,
    fps = TURNTABLE_FPS,
    videoBitsPerSecond = DEFAULT_BITRATE,
    watermark,
    onProgress,
    signal,
  } = options;

  if (signal?.aborted) return Promise.resolve(null);

  const source = target.canvas;
  const width = evenDimension(source.width);
  const height = evenDimension(source.height);
  const frame = document.createElement('canvas');
  frame.width = width;
  frame.height = height;
  const ctx = frame.getContext('2d');
  if (!ctx) return Promise.reject(new Error('2D canvas not available for video export.'));

  const drawFrame = () => {
    ctx.fillStyle = target.background;
    ctx.fillRect(0, 0, width, height);
    // preserveDrawingBuffer keeps the last rendered frame readable here.
    ctx.drawImage(source, 0, 0, width, height, 0, 0, width, height);
    if (watermark) paintWatermark(ctx, width, height, watermark);
  };

  target.setAngle(0);
  drawFrame();

  // A sampled stream (rather than captureStream(0) + requestFrame) keeps the
  // encoder fed with repeated frames when rendering is slow; with only a
  // handful of explicit frames Chrome's H.264 encoder can emit nothing.
  const stream = frame.captureStream(fps);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond });
  const chunks: Blob[] = [];
  const durationMs = seconds * 1000;

  return new Promise<Blob | null>((resolve, reject) => {
    let raf = 0;
    let start = -1;
    let cancelled = false;
    let settled = false;

    const cleanup = () => {
      cancelAnimationFrame(raf);
      signal?.removeEventListener('abort', onAbort);
      stream.getTracks().forEach((t) => t.stop());
    };

    const stop = () => {
      cancelAnimationFrame(raf);
      if (recorder.state !== 'inactive') recorder.stop();
    };

    const onAbort = () => {
      cancelled = true;
      stop();
    };

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      cleanup();
      if (settled) return;
      settled = true;
      if (cancelled) {
        resolve(null);
        return;
      }
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType });
      if (blob.size === 0) {
        reject(new Error('The browser produced an empty video. Try the other format.'));
        return;
      }
      resolve(blob);
    };
    recorder.onerror = (e) => {
      cleanup();
      if (settled) return;
      settled = true;
      const err = (e as unknown as { error?: Error }).error;
      reject(err ?? new Error('Video recording failed.'));
    };

    signal?.addEventListener('abort', onAbort, { once: true });

    // Rotation is driven by wall-clock time, so slow frames never change the
    // total angle: the video always shows exactly one turn over `seconds`.
    // The canvas we copy was rendered by R3F on the previous animation frame,
    // so the copied image lags the angle by at most one frame, which is
    // consistent across the whole clip.
    let frames = 0;
    let holdUntil = -1;
    const tick = (now: number) => {
      if (start < 0) start = now;
      const elapsed = now - start;
      frames++;
      target.setAngle(turntableAngle(elapsed, durationMs));
      drawFrame();
      onProgress?.(Math.min(1, elapsed / durationMs));
      if (elapsed >= durationMs) {
        // MediaRecorder can drop the last frames still in the encoder when
        // stopped. On slow renderers, hold the final frame briefly first.
        if (holdUntil < 0) holdUntil = now + tailHoldMs(elapsed / frames);
        if (now >= holdUntil) {
          stop();
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };

    try {
      recorder.start(1000);
    } catch (err) {
      cleanup();
      settled = true;
      reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
    raf = requestAnimationFrame(tick);
  });
}
