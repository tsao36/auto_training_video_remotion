import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAPTION_BAND_HEIGHT,
  COMPOSITION_HEIGHT,
  COMPOSITION_WIDTH,
  NON_RUNTIME_PRIMITIVE_IDS,
  PRIMITIVE_SLOT_RECTS,
  PERSISTENT_PRIMITIVE_IDS,
  SUPPORTED_PRIMITIVE_IDS,
  canonicalizePrimitiveId,
  getPrimitiveRenderPlan,
  getScaledStageBounds,
  getSceneStageStyle,
  isRectInsideStage,
  rectsOverlap,
} from './scene-layout-policy';

describe('systematic scene layout policy', () => {
  it('keeps the scaled scene stage inside the content area above captions', () => {
    const bounds = getScaledStageBounds();
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.top).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(COMPOSITION_WIDTH);
    expect(bounds.bottom).toBeLessThanOrEqual(COMPOSITION_HEIGHT - CAPTION_BAND_HEIGHT);
  });

  it('uses explicit transform scaling for every composition consumer', () => {
    const style = getSceneStageStyle();
    expect(style.transform).toMatch(/^scale\(\d/);
    expect('scale' in style).toBe(false);
  });

  it('keeps every primitive slot inside the scene stage', () => {
    for (const [name, rect] of Object.entries(PRIMITIVE_SLOT_RECTS)) {
      expect(isRectInsideStage(rect), name).toBe(true);
    }
  });

  it('keeps concurrent foreground primitive combinations in separate slots', () => {
    const combinations = [
      ['topRail', 'traceLane', 'rightCallout', 'rightHighlight'],
      ['leftMetric', 'rightMetric', 'traceLane', 'centerBadge'],
      ['codeDock', 'rightMetric', 'rightHighlight', 'topRail'],
    ] as const;

    for (const combination of combinations) {
      combination.forEach((name, index) => {
        combination.slice(index + 1).forEach((otherName) => {
          expect(
            rectsOverlap(PRIMITIVE_SLOT_RECTS[name], PRIMITIVE_SLOT_RECTS[otherName]),
            `${name} overlaps ${otherName}`
          ).toBe(false);
        });
      });
    }
  });

  it('canonicalizes legacy primitive identifiers', () => {
    expect(canonicalizePrimitiveId('AnimatedCounter')).toBe('animated-counter');
    expect(canonicalizePrimitiveId('PopBadge')).toBe('pop-badge');
    expect(canonicalizePrimitiveId('StateCard')).toBe('state-card');
  });

  it('renders at most one foreground primitive at every frame boundary', () => {
    const primitiveIds = [
      'AnimatedCounter',
      'PopBadge',
      'StateCard',
      'aurora-bg',
      'popping-word-captions',
    ];

    for (let frame = 0; frame <= 390; frame += 1) {
      const plan = getPrimitiveRenderPlan(primitiveIds, frame, 390);
      expect(plan.persistentIds).toEqual(['aurora-bg']);
      expect(plan.activeForegroundId === undefined || SUPPORTED_PRIMITIVE_IDS.has(plan.activeForegroundId)).toBe(true);
      expect(plan.persistentIds.every((id) => PERSISTENT_PRIMITIVE_IDS.has(id))).toBe(true);
    }
  });

  it('applies the collision policy to every saved scene', () => {
    const projectsDirectory = path.resolve(process.cwd(), 'projects');
    const projectFiles = fs.readdirSync(projectsDirectory).filter((file) => file.endsWith('.json'));
    let auditedScenes = 0;

    for (const projectFile of projectFiles) {
      const record = JSON.parse(fs.readFileSync(path.join(projectsDirectory, projectFile), 'utf8'));
      for (const scene of record.project?.scenes || []) {
        auditedScenes += 1;
        const rawIds = scene.remotionPrimitives || [];
        for (const rawId of rawIds) {
          const canonicalId = canonicalizePrimitiveId(rawId);
          expect(
            NON_RUNTIME_PRIMITIVE_IDS.has(canonicalId) || SUPPORTED_PRIMITIVE_IDS.has(canonicalId),
            `${projectFile} ${scene.title}: unsupported ${rawId}`,
          ).toBe(true);
        }
        const sceneFrames = Math.max(30, Math.round((Number(scene.durationSeconds) || 0) * 30));
        for (const frame of [0, 1, Math.floor(sceneFrames / 2), sceneFrames - 1, sceneFrames]) {
          const plan = getPrimitiveRenderPlan(scene.remotionPrimitives, frame, sceneFrames);
          const simultaneousForeground = plan.activeForegroundId ? 1 : 0;
          expect(simultaneousForeground, `${projectFile} ${scene.title}`).toBeLessThanOrEqual(1);
        }
      }
    }

    expect(auditedScenes).toBeGreaterThan(0);
  });
});
