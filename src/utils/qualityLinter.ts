import {
  DEFAULT_CONTENT_LANGUAGE,
  getContentLanguage,
  QualityIssue,
  QualityReport,
  SceneSpec,
  TrainingProject,
  VisualTemplate,
} from '../types/training';
import { collectSceneTextForTermCheck, findRegionalTermMatches } from './regionalTerms';

const INTERNAL_TEMPLATE_IDS: ReadonlySet<string> = new Set<VisualTemplate>([
  'title-hero',
  'architecture-flow',
  'signal-waveform',
  'protocol-timeline',
  'comparison-matrix',
  'debug-checklist',
  'packet-frame',
  'state-machine',
  'code-log',
  'kpi-metrics',
  'fault-tree',
  'summary-takeaways',
  'pptx-slide',
]);

export interface QualityLintOptions {
  /** When true, missing TTS audio on scenes with scripts becomes an error instead of a warning. */
  requireAudio?: boolean;
}

function isCjkLanguage(language?: string): boolean {
  const code = getContentLanguage(language || DEFAULT_CONTENT_LANGUAGE).value;
  return code === 'zh-TW' || code === 'zh-CN' || code === 'ja-JP' || code === 'ko-KR';
}

function isMostlyLatinAllCaps(text: string): boolean {
  const letters = text.match(/[A-Za-z]/g) || [];
  if (letters.length < 12) return false;
  return text === text.toUpperCase();
}

function getSceneDiagramItemCount(scene: SceneSpec): number {
  const diagram = scene.diagramData;
  if (!diagram) return 0;
  return Math.max(
    diagram.nodes?.length || 0,
    diagram.waveformChannels?.length || 0,
    diagram.protocolSteps?.length || 0,
    diagram.comparisonRows?.length || 0,
    diagram.packetFields?.length || 0,
    diagram.stateNodes?.length || 0,
    diagram.stateTransitions?.length || 0,
    diagram.codeLines?.length || 0,
    diagram.kpiMetrics?.length || 0,
    diagram.faultBranches?.length || 0,
    diagram.simChannels?.length || 0,
    diagram.simPackets?.length || 0,
    diagram.ofdmRuBlocks?.length || 0,
    diagram.mloLinks?.length || 0,
    diagram.rfLinkStages?.length || 0
  );
}

export function evaluateProjectQuality(
  project: Pick<TrainingProject, 'scenes' | 'language' | 'title'>,
  options: QualityLintOptions = {}
): QualityReport {
  const issues: QualityIssue[] = [];
  const scenes: SceneSpec[] = Array.isArray(project.scenes) ? project.scenes : [];
  const langMeta = getContentLanguage(project.language || DEFAULT_CONTENT_LANGUAGE);
  const cjk = isCjkLanguage(project.language);

  if (scenes.length === 0) {
    issues.push({
      level: 'error',
      code: 'empty-scenes',
      message: '專案沒有任何場景，無法預覽或輸出影片。',
    });
  }

  const maxTitleLen = cjk ? 34 : 72;
  const maxPointLen = cjk ? 42 : 84;
  const nonPptxScenes: SceneSpec[] = [];

  for (let index = 0; index < scenes.length; index++) {
    const scene = scenes[index];
    const sceneNo = index + 1;
    const isPptx = scene.template === 'pptx-slide';
    if (!isPptx) {
      nonPptxScenes.push(scene);
    }

    const title = (scene.title || '').trim();
    const subtitle = (scene.subtitle || '').trim();
    const script = (scene.script || '').trim();
    const duration = Number(scene.durationSeconds) || 0;

    if (!isPptx && !title) {
      issues.push({
        level: 'error',
        code: 'scene-title-missing',
        message: `場景 ${sceneNo} (${scene.id}) 缺少標題。`,
        sceneIndex: index,
        sceneId: scene.id,
      });
    }

    if (!isPptx && title.length > maxTitleLen) {
      issues.push({
        level: 'warning',
        code: 'headline-too-long',
        message: `場景 ${sceneNo} 標題長度為 ${title.length} 字（建議不超過 ${maxTitleLen} 字），可能導致排版過擠。`,
        sceneIndex: index,
        sceneId: scene.id,
      });
    }

    if (!isPptx && isMostlyLatinAllCaps(title)) {
      issues.push({
        level: 'warning',
        code: 'all-caps-headline',
        message: `場景 ${sceneNo} 標題為全大寫英文，建議改用正常大小寫以提升可讀性。`,
        sceneIndex: index,
        sceneId: scene.id,
      });
    }

    if (
      INTERNAL_TEMPLATE_IDS.has(title.toLowerCase()) ||
      INTERNAL_TEMPLATE_IDS.has(subtitle.toLowerCase())
    ) {
      issues.push({
        level: 'error',
        code: 'implementation-label',
        message: `場景 ${sceneNo} 標題或副標題暴露了內部模板識別字（${title || subtitle}），請改為面向觀眾的文字。`,
        sceneIndex: index,
        sceneId: scene.id,
      });
    }

    if (!isPptx) {
      const points = Array.isArray(scene.keyPoints) ? scene.keyPoints : [];
      if (points.length > 5) {
        issues.push({
          level: 'warning',
          code: 'too-many-points',
          message: `場景 ${sceneNo} 包含 ${points.length} 個重點條目（建議 5 個以內），畫面資訊過密。`,
          sceneIndex: index,
          sceneId: scene.id,
        });
      }
      for (const point of points) {
        if (typeof point === 'string' && point.trim().length > maxPointLen) {
          issues.push({
            level: 'warning',
            code: 'point-too-long',
            message: `場景 ${sceneNo} 有重點條目超過 ${maxPointLen} 字，建議精簡以提高投影片掃讀效率。`,
            sceneIndex: index,
            sceneId: scene.id,
          });
          break;
        }
      }

      const primitiveCount = scene.remotionPrimitives?.length || 0;
      const diagramItemCount = getSceneDiagramItemCount(scene);
      const visualUnitCount = points.length + primitiveCount + diagramItemCount;
      if (primitiveCount > 4) {
        issues.push({
          level: 'warning',
          code: 'too-many-primitives',
          message: `場景 ${sceneNo} 同時使用 ${primitiveCount} 個 Remotion 元素，建議保留 4 個以內，避免視覺焦點競爭。`,
          sceneIndex: index,
          sceneId: scene.id,
        });
      }
      if (visualUnitCount > 10) {
        issues.push({
          level: 'warning',
          code: 'scene-too-dense',
          message: `場景 ${sceneNo} 同時呈現約 ${visualUnitCount} 個視覺單位，建議拆分場景或移除次要資訊，保留單一清楚焦點。`,
          sceneIndex: index,
          sceneId: scene.id,
        });
      }
    }

    if (duration < 3) {
      issues.push({
        level: 'warning',
        code: 'scene-too-short',
        message: `場景 ${sceneNo} 時長僅 ${duration} 秒，建議至少 3 秒以上。`,
        sceneIndex: index,
        sceneId: scene.id,
      });
    }

    if (script.length > 0) {
      const audioReady = scene.tts?.status === 'ready' && Boolean(scene.tts?.audioUrl);
      if (!audioReady) {
        issues.push({
          level: options.requireAudio ? 'error' : 'warning',
          code: 'narration-audio-missing',
          message: `場景 ${sceneNo} 有旁白稿但尚未完成語音合成，渲染結果將缺少此幕配音。`,
          sceneIndex: index,
          sceneId: scene.id,
        });
      }

      if (duration >= 6 && !scene.tts?.actualDurationSec) {
        const estimatedSec = script.length / langMeta.charsPerSecond;
        if (estimatedSec > duration * 1.9) {
          issues.push({
            level: 'warning',
            code: 'script-too-long-for-duration',
            message: `場景 ${sceneNo} 旁白預估需約 ${Math.round(estimatedSec)} 秒，但場景時長僅 ${duration} 秒，語音可能被截斷。`,
            sceneIndex: index,
            sceneId: scene.id,
          });
        }
      }
    }

    const termMatches = findRegionalTermMatches(collectSceneTextForTermCheck(scene), langMeta.value);
    if (termMatches.length > 0) {
      const summary = termMatches
        .slice(0, 4)
        .map((m) => `「${m.wrong}」→「${m.preferred}」`)
        .join('、');
      const more = termMatches.length > 4 ? ` 等 ${termMatches.length} 項` : '';
      issues.push({
        level: 'warning',
        code: 'regional-terminology',
        message: `場景 ${sceneNo} 偵測到不符合「${langMeta.label}」的技術術語：${summary}${more}。`,
        sceneIndex: index,
        sceneId: scene.id,
      });
    }
  }

  if (nonPptxScenes.length >= 4) {
    const distinctTemplates = new Set(nonPptxScenes.map((s) => s.template));
    if (distinctTemplates.size < 3) {
      issues.push({
        level: 'warning',
        code: 'weak-scene-differentiation',
        message: `目前 ${nonPptxScenes.length} 個非 PPTX 場景僅使用 ${distinctTemplates.size} 種視覺模板，建議至少搭配 3 種模板避免視覺單調。`,
      });
    }
  }

  const anyScript = scenes.some((s) => (s.script || '').trim().length > 0);
  if (scenes.length > 0 && !anyScript) {
    issues.push({
      level: 'info',
      code: 'intentional-silence',
      message: '所有場景皆無旁白稿，將輸出靜音影片。',
    });
  }

  const errorCount = issues.filter((i) => i.level === 'error').length;
  const warningCount = issues.filter((i) => i.level === 'warning').length;
  const infoCount = issues.filter((i) => i.level === 'info').length;

  return {
    passed: errorCount === 0,
    errorCount,
    warningCount,
    infoCount,
    issues,
  };
}
