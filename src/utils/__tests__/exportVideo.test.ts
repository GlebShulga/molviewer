import { describe, it, expect } from 'vitest';
import {
  getSupportedVideoFormats,
  videoExtension,
  turntableAngle,
  evenDimension,
  tailHoldMs,
} from '../exportVideo';

const supports = (...types: string[]) => (t: string) => types.includes(t);

describe('getSupportedVideoFormats', () => {
  it('prefers MP4 (H.264) over WebM when both are supported', () => {
    const formats = getSupportedVideoFormats(
      supports('video/mp4;codecs=avc1', 'video/webm;codecs=vp9', 'video/webm')
    );
    expect(formats).toEqual([
      { format: 'mp4', mimeType: 'video/mp4;codecs=avc1' },
      { format: 'webm', mimeType: 'video/webm;codecs=vp9' },
    ]);
  });

  it('falls back to WebM only', () => {
    const formats = getSupportedVideoFormats(supports('video/webm;codecs=vp8'));
    expect(formats).toEqual([{ format: 'webm', mimeType: 'video/webm;codecs=vp8' }]);
  });

  it('accepts a bare video/mp4 container', () => {
    expect(getSupportedVideoFormats(supports('video/mp4'))).toEqual([
      { format: 'mp4', mimeType: 'video/mp4' },
    ]);
  });

  it('returns nothing when recording is unsupported or throws', () => {
    expect(getSupportedVideoFormats(() => false)).toEqual([]);
    expect(
      getSupportedVideoFormats(() => {
        throw new Error('nope');
      })
    ).toEqual([]);
  });

  it('returns nothing without MediaRecorder (jsdom)', () => {
    expect(getSupportedVideoFormats()).toEqual([]);
  });
});

describe('videoExtension', () => {
  it('maps mime types to extensions', () => {
    expect(videoExtension('video/mp4;codecs=avc1')).toBe('mp4');
    expect(videoExtension('VIDEO/MP4')).toBe('mp4');
    expect(videoExtension('video/webm;codecs=vp9')).toBe('webm');
    expect(videoExtension('')).toBe('webm');
  });
});

describe('turntableAngle', () => {
  it('covers exactly one turn over the duration', () => {
    expect(turntableAngle(0, 4000)).toBe(0);
    expect(turntableAngle(2000, 4000)).toBeCloseTo(Math.PI);
    expect(turntableAngle(4000, 4000)).toBeCloseTo(Math.PI * 2);
  });

  it('clamps outside the recording window', () => {
    expect(turntableAngle(-10, 4000)).toBe(0);
    expect(turntableAngle(9000, 4000)).toBeCloseTo(Math.PI * 2);
    expect(turntableAngle(10, 0)).toBeCloseTo(Math.PI * 2);
  });
});

describe('evenDimension', () => {
  it('rounds down to an even size of at least 2', () => {
    expect(evenDimension(1280)).toBe(1280);
    expect(evenDimension(1281)).toBe(1280);
    expect(evenDimension(719.6)).toBe(718);
    expect(evenDimension(1)).toBe(2);
  });
});

describe('tailHoldMs', () => {
  it('does not hold at normal frame rates', () => {
    expect(tailHoldMs(16.7)).toBe(0);
    expect(tailHoldMs(33)).toBe(0);
    expect(tailHoldMs(NaN)).toBe(0);
  });

  it('holds a few frames when rendering is slow, capped at 1 s', () => {
    expect(tailHoldMs(100)).toBe(300);
    expect(tailHoldMs(350)).toBe(1000);
  });
});
