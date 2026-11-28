import { describe, expect, it } from 'vitest';
import {
  REMOTION_ELEMENT_REGISTRY,
  getSceneRuntimeElementIds,
  isAiSelectableSceneElement,
  isSceneRuntimeElement,
} from './element-registry';

describe('RemotionUI element registry', () => {
  it('adds exactly two curated items from every RemotionUI category', () => {
    const categories = new Set(REMOTION_ELEMENT_REGISTRY.map((item) => item.category));
    expect(categories.size).toBe(10);
    for (const category of categories) {
      expect(
        REMOTION_ELEMENT_REGISTRY.filter((item) => item.category === category),
        category
      ).toHaveLength(2);
    }
  });

  it('only offers scene-runtime elements to the AI selector', () => {
    const runtime = new Set(getSceneRuntimeElementIds());
    for (const item of REMOTION_ELEMENT_REGISTRY.filter((entry) => entry.sceneRuntime)) {
      expect(runtime.has(item.id), item.id).toBe(true);
      expect(isSceneRuntimeElement(item.id)).toBe(true);
    }
    for (const item of REMOTION_ELEMENT_REGISTRY.filter((entry) => !entry.sceneRuntime)) {
      expect(isSceneRuntimeElement(item.id), item.id).toBe(false);
    }
  });

  it('keeps GPU-only elements opt-in rather than auto-selected by AI', () => {
    for (const item of REMOTION_ELEMENT_REGISTRY.filter((entry) => entry.requiresGl)) {
      expect(isAiSelectableSceneElement(item.id), item.id).toBe(false);
    }
  });

  it('keeps transition and composition lanes out of per-scene rendering', () => {
    expect(REMOTION_ELEMENT_REGISTRY.filter((item) => item.kind === 'transition').map((item) => item.id))
      .toEqual(['transition-card-flip', 'chromatic-aberration-wipe']);
    expect(REMOTION_ELEMENT_REGISTRY.filter((item) => item.kind === 'composition').map((item) => item.id))
      .toEqual(['data-story', 'browser-flow']);
  });
});
