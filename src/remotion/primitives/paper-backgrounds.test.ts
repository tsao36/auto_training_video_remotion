import { describe, expect, it } from 'vitest';
import { getPaperTextureSeed } from './paper-backgrounds';

describe('getPaperTextureSeed', () => {
  it('keeps a fixed seed when texture animation is disabled', () => {
    expect(getPaperTextureSeed(120, 300, 24, false, 30)).toBe(24);
  });

  it('advances deterministically across the composition duration', () => {
    expect(getPaperTextureSeed(0, 300, 10, true, 30)).toBe(10);
    expect(getPaperTextureSeed(300, 300, 10, true, 30)).toBe(1010);
    expect(getPaperTextureSeed(150, 300, 10, true, 30)).toBe(
      getPaperTextureSeed(150, 300, 10, true, 30),
    );
  });

  it('posterizes nearby frames to the same texture seed', () => {
    expect(getPaperTextureSeed(1, 300, 0, true, 30)).toBe(
      getPaperTextureSeed(4, 300, 0, true, 30),
    );
  });

  it('handles a zero-length composition safely', () => {
    expect(getPaperTextureSeed(0, 0, 7, true, 30)).toBe(7);
  });
});
