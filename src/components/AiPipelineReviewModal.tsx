import React, { useEffect, useState } from 'react';
import { Check, Copy, GitBranch, RefreshCw, Save, X } from 'lucide-react';
import { fetchRandomBrandPalette } from '../utils/colorPaletteApi';
import {
  CONTENT_LANGUAGES,
  DOMAIN_META,
  EFFECT_LABELS,
  TEMPLATE_LABELS,
  TechDomain,
  TrainingProject,
  VisualTemplate,
  RemotionEffect,
  MotionStyle,
  TtsProvider,
  ContentLanguage,
  SceneSpec,
} from '../types/training';

interface AiPipelineReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: TrainingProject;
  onApplyProject: (project: TrainingProject) => void;
}

const STAGES = [
  { key: 'input', label: '輸入內容', description: '主題與建立參數' },
  { key: 'source', label: '來源整理', description: '送給 AI 的文字' },
  { key: 'outline', label: 'AI 場景大綱', description: '標題、時間與旁白' },
  { key: 'json', label: 'Remotion JSON', description: '最終專案草稿' },
] as const;

export const AiPipelineReviewModal: React.FC<AiPipelineReviewModalProps> = ({
  isOpen,
  onClose,
  project,
  onApplyProject,
}) => {
  const [activeStage, setActiveStage] = useState<(typeof STAGES)[number]['key']>('input');
  const [copied, setCopied] = useState(false);
  const [applyNotice, setApplyNotice] = useState<string | null>(null);
  const [inputDraft, setInputDraft] = useState(project.topic || project.title);
  const [sourceDraft, setSourceDraft] = useState(project.aiGenerationStages?.source.rawText ?? project.rawSourceText);
  const [domainDraft, setDomainDraft] = useState<TechDomain>(project.domain);
  const [outlineDraft, setOutlineDraft] = useState(JSON.stringify(
    project.aiGenerationStages?.outline ?? {
      title: project.title,
      subtitle: project.subtitle,
      domain: project.domain,
      scenes: project.scenes,
    },
    null,
    2
  ));
  const [jsonDraft, setJsonDraft] = useState(
    project.aiGenerationStages?.remotionJson.json ?? JSON.stringify(project, null, 2)
  );
  const [odmDraft, setOdmDraft] = useState(Boolean(project.odmMode));
  const [languageDraft, setLanguageDraft] = useState<ContentLanguage>(project.language ?? 'zh-TW');
  const [durationDraft, setDurationDraft] = useState(project.targetDurationSeconds);
  const [fpsDraft, setFpsDraft] = useState(project.fps);
  const [widthDraft, setWidthDraft] = useState(project.width);
  const [heightDraft, setHeightDraft] = useState(project.height);
  const [colorPresetDraft, setColorPresetDraft] = useState<NonNullable<TrainingProject['colorScheme']>['preset']>(project.colorScheme?.preset ?? 'domain');
  const [primaryColorDraft, setPrimaryColorDraft] = useState(project.colorScheme?.primary ?? DOMAIN_META[project.domain].accentColor);
  const [secondaryColorDraft, setSecondaryColorDraft] = useState(project.colorScheme?.secondary ?? DOMAIN_META[project.domain].secondaryColor);
  const [surfaceColorDraft, setSurfaceColorDraft] = useState(project.colorScheme?.surface ?? '#12100E');
  const [paletteLoading, setPaletteLoading] = useState(false);
  const [paletteError, setPaletteError] = useState<string | null>(null);
  const [paletteSource, setPaletteSource] = useState<string | null>(null);
  const [paletteDraft, setPaletteDraft] = useState<string[]>(
    project.colorScheme?.palette?.length
      ? project.colorScheme.palette.slice(0, 5)
      : [project.colorScheme?.primary ?? DOMAIN_META[project.domain].accentColor, project.colorScheme?.secondary ?? DOMAIN_META[project.domain].secondaryColor, project.colorScheme?.surface ?? '#12100E', '#FCAEB2', '#F3667D']
  );

  useEffect(() => {
    if (!isOpen) return;
    setActiveStage('input');
    setApplyNotice(null);
    setInputDraft(project.topic || project.title);
    setSourceDraft(project.aiGenerationStages?.source.rawText ?? project.rawSourceText);
    setDomainDraft(project.domain);
    setOutlineDraft(JSON.stringify(project.aiGenerationStages?.outline ?? {
      title: project.title,
      subtitle: project.subtitle,
      domain: project.domain,
      scenes: project.scenes,
    }, null, 2));
    setJsonDraft(project.aiGenerationStages?.remotionJson.json ?? JSON.stringify(project, null, 2));
    setOdmDraft(Boolean(project.odmMode));
    setLanguageDraft(project.language ?? 'zh-TW');
    setDurationDraft(project.targetDurationSeconds);
    setFpsDraft(project.fps);
    setWidthDraft(project.width);
    setHeightDraft(project.height);
    setColorPresetDraft(project.colorScheme?.preset ?? 'domain');
    setPrimaryColorDraft(project.colorScheme?.primary ?? DOMAIN_META[project.domain].accentColor);
    setSecondaryColorDraft(project.colorScheme?.secondary ?? DOMAIN_META[project.domain].secondaryColor);
    setSurfaceColorDraft(project.colorScheme?.surface ?? '#12100E');
    setPaletteDraft(
      project.colorScheme?.palette?.length
        ? project.colorScheme.palette.slice(0, 5)
        : [project.colorScheme?.primary ?? DOMAIN_META[project.domain].accentColor, project.colorScheme?.secondary ?? DOMAIN_META[project.domain].secondaryColor, project.colorScheme?.surface ?? '#12100E', '#FCAEB2', '#F3667D']
    );
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose, project]);

  if (!isOpen) return null;

  const snapshot = project.aiGenerationStages;

  const activeText =
    activeStage === 'input'
      ? JSON.stringify({
          topic: inputDraft,
          rawText: sourceDraft,
          sourceType: project.sourceType,
          sourceFileName: project.sourceFileName,
          domain: domainDraft,
          language: languageDraft,
          odmMode: odmDraft,
          targetDurationSeconds: durationDraft,
          fps: fpsDraft,
          width: widthDraft,
          height: heightDraft,
        }, null, 2)
      : activeStage === 'source'
      ? JSON.stringify({
          topic: inputDraft,
          rawText: sourceDraft,
          sourceType: project.sourceType,
          sourceFileName: project.sourceFileName,
        }, null, 2)
      : activeStage === 'outline'
      ? outlineDraft
      : jsonDraft;

  const buildUsedSources = (target: TrainingProject, rawText: string) => {
    const sources: Array<{ kind: 'topic' | 'research' | 'pptx' | 'pdf'; label: string; chars: number }> = [];
    sources.push({ kind: 'topic', label: `主題：${inputDraft || target.topic || target.title}`, chars: (inputDraft || '').length });
    if (rawText.trim()) {
      sources.push({
        kind: target.sourceType === 'pptx' ? 'pptx' : target.sourceType === 'pdf' ? 'pdf' : 'research',
        label: target.sourceFileName || (target.sourceType === 'topic-llm' ? '補充技術筆記 / 大綱' : target.sourceType),
        chars: rawText.length,
      });
    }
    return sources;
  };

  const COLOR_PRESETS: Array<{ id: NonNullable<TrainingProject['colorScheme']>['preset']; label: string; primary: string; secondary: string; surface: string }> = [
    { id: 'domain', label: '依領域預設', primary: DOMAIN_META[domainDraft].accentColor, secondary: DOMAIN_META[domainDraft].secondaryColor, surface: '#12100E' },
    { id: 'champagne', label: '香檳金暖色', primary: '#D4B46A', secondary: '#A8843F', surface: '#12100E' },
    { id: 'blueprint', label: '藍圖科技藍', primary: '#38BDF8', secondary: '#2563EB', surface: '#0B1220' },
    { id: 'sage', label: '薄荷綠檯面', primary: '#98B896', secondary: '#5F8060', surface: '#101511' },
    { id: 'coral', label: '珊瑚警示色', primary: '#E58B78', secondary: '#A94F43', surface: '#17100F' },
    { id: 'mono', label: '單色高對比', primary: '#F3EFE8', secondary: '#837B6F', surface: '#111111' },
    { id: 'custom', label: '自訂配色', primary: primaryColorDraft, secondary: secondaryColorDraft, surface: surfaceColorDraft },
  ];

  const fetchRandomPalette = async () => {
    setPaletteLoading(true);
    setPaletteError(null);
    try {
      const result = await fetchRandomBrandPalette();
      const colors = [...result.colors].slice(0, 5);
      setPaletteDraft(colors);
      setPrimaryColorDraft(colors[0] || primaryColorDraft);
      setSecondaryColorDraft(colors[1] || secondaryColorDraft);
      setSurfaceColorDraft(colors[2] || surfaceColorDraft);
      setColorPresetDraft('custom');
      setPaletteSource(result.name);
    } catch (error) {
      setPaletteError(error instanceof Error ? error.message : '無法取得隨機配色');
    } finally {
      setPaletteLoading(false);
    }
  };

  const applyColorPreset = (preset: NonNullable<TrainingProject['colorScheme']>['preset']) => {
    setColorPresetDraft(preset);
    if (preset === 'custom') return;
    const selected = COLOR_PRESETS.find((item) => item.id === preset);
    if (!selected) return;
    setPrimaryColorDraft(selected.primary);
    setSecondaryColorDraft(selected.secondary);
    setSurfaceColorDraft(selected.surface);
    setPaletteDraft([selected.primary, selected.secondary, selected.surface, selected.primary, selected.secondary]);
  };

  const buildLogicNotes = (odmEnabled: boolean, language: ContentLanguage) => {
    const languageLabel = CONTENT_LANGUAGES.find((item) => item.value === language)?.label || language;
    return [
      `使用 ${languageLabel} 進行標題、旁白、要點與圖表文字生成。`,
      odmEnabled
        ? 'ODM 簡化：先用生活比喻與熟悉因果建立直覺，再定義專業術語；保留準確規格與工程因果，不刪除技術細節。'
        : '專業模式：直接以工程術語、規格、量測流程與根因分析組織內容。',
      '腳本與畫面分離：script 解釋 WHY/HOW，keyPoints 與 diagramData 保留短而可掃描的視覺錨點。',
    ];
  };

  const updateOutlineScene = (sceneIndex: number, patch: Partial<SceneSpec>) => {
    try {
      const parsed = JSON.parse(outlineDraft) as {
        title?: string;
        subtitle?: string;
        domain?: TechDomain;
        scenes?: SceneSpec[];
      };
      if (!Array.isArray(parsed.scenes)) return;
      parsed.scenes = parsed.scenes.map((scene, index) =>
        index === sceneIndex ? { ...scene, ...patch } : scene
      );
      const nextText = JSON.stringify(parsed, null, 2);
      setOutlineDraft(nextText);
      setJsonDraft(JSON.stringify({
        title: parsed.title,
        subtitle: parsed.subtitle,
        domain: parsed.domain,
        scenes: parsed.scenes,
      }, null, 2));
    } catch {
      setApplyNotice('無法解析場景大綱 JSON；請先修正 JSON 格式');
    }
  };

  const copyText = async () => {
    await navigator.clipboard.writeText(activeText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const applyChanges = async () => {
    try {
      let next = project;

      if (activeStage === 'input' || activeStage === 'source') {
        setApplyNotice('正在依新主題或來源重新生成場景與 Remotion JSON...');
        const topic = inputDraft.trim() || next.topic || next.title;
        const resp = await fetch('/api/llm/generate-plan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topic,
            durationSeconds: durationDraft,
            domain: domainDraft,
            odmMode: odmDraft,
            rawText: sourceDraft,
            defaultTtsProvider: next.ttsConfig.defaultProvider,
            language: languageDraft,
            colorPalette: paletteDraft.filter((color) => /^#[0-9A-Fa-f]{6}$/.test(color)).slice(0, 5),
            llmConfig: next.llmConfig,
          }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || '重新生成場景失敗');

        const generatedScenes = (Array.isArray(data.scenes) ? data.scenes : []).map((scene: any) => ({
          ...scene,
          tts: {
            ...(scene.tts ?? {}),
            provider: scene.tts?.provider ?? next.ttsConfig.defaultProvider,
            voiceId: scene.tts?.voiceId,
            speed: scene.tts?.speed ?? 1,
            status: 'idle' as const,
            audioUrl: undefined,
            actualDurationSec: undefined,
            error: undefined,
          },
        })) as TrainingProject['scenes'];
        if (!generatedScenes.length) throw new Error('AI 未產生任何場景');

        const generatedDomain = Object.prototype.hasOwnProperty.call(DOMAIN_META, data.domain)
          ? (data.domain as TechDomain)
          : domainDraft;
        const outline = {
          title: data.title || topic,
          subtitle: data.subtitle || next.subtitle,
          domain: generatedDomain,
          scenes: generatedScenes,
        };
        next = {
          ...next,
          title: data.title || topic,
          subtitle: data.subtitle || next.subtitle,
          topic,
          rawSourceText: sourceDraft,
          domain: generatedDomain,
          odmMode: odmDraft,
          language: languageDraft,
          targetDurationSeconds: durationDraft,
          fps: fpsDraft,
          width: widthDraft,
          height: heightDraft,
          colorScheme: {
            preset: colorPresetDraft,
            primary: primaryColorDraft,
            secondary: secondaryColorDraft,
            surface: surfaceColorDraft,
          },
          ttsDeferred: true,
          scenes: generatedScenes.map((scene) => ({
            ...scene,
            animation: { ...scene.animation, accentColor: primaryColorDraft },
          })),
          aiGenerationStages: {
            input: {
              topic,
              rawText: sourceDraft,
              sourceType: next.sourceType,
              sourceFileName: next.sourceFileName,
              odmMode: odmDraft,
              language: languageDraft,
              targetDurationSeconds: durationDraft,
              fps: fpsDraft,
              width: widthDraft,
              height: heightDraft,
            },
            source: {
              topic,
              rawText: sourceDraft,
              pptxSlideCount: next.aiGenerationStages?.source.pptxSlideCount,
              usedSources: buildUsedSources(next, sourceDraft),
              logicNotes: buildLogicNotes(odmDraft, languageDraft),
            },
            outline,
            remotionJson: {
              json: JSON.stringify(outline, null, 2),
            },
          },
        };
        setOutlineDraft(JSON.stringify(outline, null, 2));
        setJsonDraft(JSON.stringify(outline, null, 2));
      } else if (activeStage === 'outline') {
        const parsed = JSON.parse(outlineDraft) as {
          title?: string;
          subtitle?: string;
          domain?: TechDomain;
          scenes?: TrainingProject['scenes'];
        };
        if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
          throw new Error('AI 場景大綱 JSON 缺少 scenes 陣列或場景為空');
        }
        const scenes = parsed.scenes.map((scene, index) => {
          const existing = next.scenes[index];
          return {
            ...existing,
            ...scene,
            tts: {
              ...(existing?.tts ?? scene.tts),
              status: 'idle' as const,
              audioUrl: undefined,
              actualDurationSec: undefined,
              error: undefined,
            },
          };
        });
        next = {
          ...next,
          title: parsed.title ?? next.title,
          subtitle: parsed.subtitle ?? next.subtitle,
          domain: parsed.domain ?? domainDraft,
          topic: inputDraft.trim() || next.topic,
          colorScheme: {
            preset: colorPresetDraft,
            primary: primaryColorDraft,
            secondary: secondaryColorDraft,
            surface: surfaceColorDraft,
          },
          odmMode: odmDraft,
          language: languageDraft,
          targetDurationSeconds: durationDraft,
          fps: fpsDraft,
          width: widthDraft,
          height: heightDraft,
          ttsDeferred: true,
          scenes: scenes.map((scene) => ({
            ...scene,
            animation: { ...scene.animation, accentColor: primaryColorDraft },
          })),
          aiGenerationStages: {
            ...next.aiGenerationStages,
            outline: {
              title: parsed.title ?? next.title,
              subtitle: parsed.subtitle ?? next.subtitle,
              domain: parsed.domain ?? domainDraft,
              scenes,
            },
            remotionJson: {
              json: JSON.stringify({
                title: parsed.title ?? next.title,
                subtitle: parsed.subtitle ?? next.subtitle,
                domain: parsed.domain ?? domainDraft,
                scenes,
              }, null, 2),
            },
          } as TrainingProject['aiGenerationStages'],
        };
        setJsonDraft(JSON.stringify({
          title: next.title,
          subtitle: next.subtitle,
          domain: next.domain,
          scenes,
        }, null, 2));
      } else {
        const parsed = JSON.parse(jsonDraft) as Partial<TrainingProject>;
        if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) {
          throw new Error('Remotion JSON 缺少 scenes 陣列或場景為空');
        }
        const scenes = parsed.scenes.map((scene, index) => {
          const existing = next.scenes[index];
          return {
            ...existing,
            ...scene,
            tts: {
              ...(existing?.tts ?? scene.tts),
              status: 'idle' as const,
              audioUrl: undefined,
              actualDurationSec: undefined,
              error: undefined,
            },
          };
        }) as TrainingProject['scenes'];
        next = {
          ...next,
          ...parsed,
          id: next.id,
          title: parsed.title ?? next.title,
          subtitle: parsed.subtitle ?? next.subtitle,
          domain: parsed.domain ?? next.domain,
          topic: inputDraft.trim() || parsed.topic || next.topic,
          colorScheme: {
            preset: colorPresetDraft,
            primary: primaryColorDraft,
            secondary: secondaryColorDraft,
            surface: surfaceColorDraft,
          },
          odmMode: odmDraft,
          language: languageDraft,
          targetDurationSeconds: durationDraft,
          fps: fpsDraft,
          width: widthDraft,
          height: heightDraft,
          ttsDeferred: true,
          scenes: scenes.map((scene) => ({
            ...scene,
            animation: { ...scene.animation, accentColor: primaryColorDraft },
          })),
          aiGenerationStages: {
            ...next.aiGenerationStages,
            remotionJson: { json: jsonDraft },
          } as TrainingProject['aiGenerationStages'],
        };
      }

      onApplyProject(next);
      setApplyNotice('變更已套用；舊語音已失效，重新配音後即可輸出 MP4。');
    } catch (error) {
      setApplyNotice(error instanceof Error ? `無法套用：${error.message}` : '無法套用變更');
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="ai-pipeline-title">
      <div className="w-full max-w-6xl h-[86vh] flex flex-col rounded-2xl bg-[#161411] border border-slate-800 shadow-2xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-[#1B1814]">
          <div className="flex items-center gap-2.5 min-w-0">
            <GitBranch className="w-4 h-4 text-cyan-400 shrink-0" />
            <div className="min-w-0">
              <h2 id="ai-pipeline-title" className="text-sm font-bold text-white truncate">AI 製作流程：{project.title}</h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {snapshot ? '已保存的逐階段草稿與產出' : '舊專案：由目前專案 JSON 即時重建階段摘要'}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="關閉製作流程" className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-4 gap-2 p-4 border-b border-slate-800 bg-[#131110]">
          {STAGES.map((stage, index) => {
            const active = activeStage === stage.key;
            return (
              <button
                key={stage.key}
                type="button"
                onClick={() => setActiveStage(stage.key)}
                className={`text-left px-3 py-2.5 rounded-lg border transition ${active ? 'border-cyan-400 bg-cyan-500/10' : 'border-slate-800 bg-slate-900/50 hover:border-slate-700'}`}
              >
                <div className={`text-xs font-bold ${active ? 'text-cyan-300' : 'text-slate-300'}`}>
                  {index + 1}. {stage.label}
                </div>
                <div className="text-[10px] mt-1 text-slate-500">{stage.description}</div>
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between mb-3 gap-3">
              <div className="text-xs font-semibold text-slate-300">
                {STAGES.find((stage) => stage.key === activeStage)?.label}
              </div>
              <div className="flex items-center gap-2">
                {applyNotice && (
                  <span className={`text-[11px] ${applyNotice.startsWith('無法') ? 'text-rose-300' : 'text-emerald-300'}`}>
                    {applyNotice}
                  </span>
                )}
                <button type="button" onClick={() => void copyText()} className="px-2.5 py-1 rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 flex items-center gap-1.5 transition">
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-cyan-400" />}
                  {copied ? '已複製' : '複製內容'}
                </button>
                <button type="button" onClick={applyChanges} className="px-3 py-1 rounded-md bg-cyan-500 hover:bg-cyan-400 text-[#050607] text-[11px] font-bold flex items-center gap-1.5 transition">
                  <Save className="w-3 h-3" /> 套用變更
                </button>
              </div>
            </div>

            {activeStage === 'input' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">影片主題</label>
                    <input value={inputDraft} onChange={(e) => setInputDraft(e.target.value)} className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">視覺領域</label>
                    <select value={domainDraft} onChange={(e) => setDomainDraft(e.target.value as TechDomain)} className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-sm text-white">
                      {(Object.keys(DOMAIN_META) as TechDomain[]).map((domain) => (
                        <option key={domain} value={domain}>{DOMAIN_META[domain].label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
                  <div className="md:col-span-2">
                    <label className="block text-[11px] text-slate-400 mb-1">內容語言</label>
                    <select value={languageDraft} onChange={(e) => setLanguageDraft(e.target.value as ContentLanguage)} className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white">
                      {CONTENT_LANGUAGES.map((lang) => <option key={lang.value} value={lang.value}>{lang.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">總秒數</label>
                    <input type="number" min={15} max={1800} value={durationDraft} onChange={(e) => setDurationDraft(Number(e.target.value) || 60)} className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">FPS</label>
                    <input type="number" min={1} max={60} value={fpsDraft} onChange={(e) => setFpsDraft(Number(e.target.value) || 30)} className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">寬度 px</label>
                    <input type="number" min={320} value={widthDraft} onChange={(e) => setWidthDraft(Number(e.target.value) || 1920)} className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white" />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">高度 px</label>
                    <input type="number" min={240} value={heightDraft} onChange={(e) => setHeightDraft(Number(e.target.value) || 1080)} className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-semibold text-slate-400">全域 Remotion 配色方案</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {COLOR_PRESETS.filter((preset) => preset.id !== 'custom').map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyColorPreset(preset.id)}
                        aria-pressed={colorPresetDraft === preset.id}
                        className={`text-left p-2.5 rounded-lg border transition ${
                          colorPresetDraft === preset.id
                            ? 'border-cyan-400 bg-cyan-500/10'
                            : 'border-slate-800 bg-slate-950/50 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className="w-4 h-4 rounded-sm border border-white/10" style={{ backgroundColor: preset.primary }} />
                          <span className="w-4 h-4 rounded-sm border border-white/10" style={{ backgroundColor: preset.secondary }} />
                          <span className="w-4 h-4 rounded-sm border border-white/10" style={{ backgroundColor: preset.surface }} />
                        </div>
                        <div className={`text-[10px] font-semibold ${colorPresetDraft === preset.id ? 'text-cyan-300' : 'text-slate-300'}`}>
                          {preset.label}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <button
                      type="button"
                      onClick={() => void fetchRandomPalette()}
                      disabled={paletteLoading}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2.5 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-500/15 disabled:cursor-wait disabled:opacity-60"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${paletteLoading ? 'animate-spin' : ''}`} />
                      {paletteLoading ? '取得配色中' : '隨機配色'}
                    </button>
                    {(paletteSource || paletteError) && (
                      <span className={`text-[10px] ${paletteError ? 'text-amber-300' : 'text-slate-500'}`}>
                        {paletteError || `來源：${paletteSource}`}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                    {paletteDraft.slice(0, 5).map((color, index) => (
                      <label key={index} className="px-2.5 py-2 rounded-lg border border-slate-800 bg-slate-950/60 text-[10px] text-slate-400">
                        {index === 0 ? '主色' : index === 1 ? '次色' : index === 2 ? '背景色' : `配色 ${index + 1}`}
                        <div className="mt-1 flex items-center gap-1.5">
                          <input
                            type="color"
                            value={/^#[0-9A-Fa-f]{6}$/.test(color) ? color : '#000000'}
                            onChange={(event) => {
                              const next = [...paletteDraft];
                              next[index] = event.target.value.toUpperCase();
                              setPaletteDraft(next);
                              if (index === 0) setPrimaryColorDraft(event.target.value.toUpperCase());
                              if (index === 1) setSecondaryColorDraft(event.target.value.toUpperCase());
                              if (index === 2) setSurfaceColorDraft(event.target.value.toUpperCase());
                              setColorPresetDraft('custom');
                            }}
                            className="w-7 h-7 shrink-0 rounded border border-slate-700 bg-slate-950 p-1"
                          />
                          <input
                            type="text"
                            value={color}
                            maxLength={7}
                            pattern="#[0-9A-Fa-f]{6}"
                            onChange={(event) => {
                              const value = event.target.value.startsWith('#') ? event.target.value.toUpperCase() : `#${event.target.value.toUpperCase()}`;
                              const next = [...paletteDraft];
                              next[index] = value.slice(0, 7);
                              setPaletteDraft(next);
                              if (/^#[0-9A-Fa-f]{6}$/.test(value)) {
                                if (index === 0) setPrimaryColorDraft(value);
                                if (index === 1) setSecondaryColorDraft(value);
                                if (index === 2) setSurfaceColorDraft(value);
                              }
                              setColorPresetDraft('custom');
                            }}
                            aria-label={`配色代碼 ${index + 1}`}
                            className="min-w-0 w-full h-7 rounded border border-slate-700 bg-slate-950 px-1.5 text-[11px] text-white outline-none focus:border-cyan-500"
                          />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                <label className="flex items-center justify-between gap-3 px-3.5 py-3 rounded-lg border border-slate-800 bg-slate-900/60 cursor-pointer">
                  <span>
                    <span className="block text-xs font-bold text-white">ODM 簡化語言</span>
                    <span className="block text-[11px] mt-1 text-slate-400">先用生活比喻與熟悉因果建立直覺，再定義專業術語；保留規格與工程細節。</span>
                  </span>
                  <input type="checkbox" checked={odmDraft} onChange={(e) => setOdmDraft(e.target.checked)} className="w-4 h-4 accent-cyan-400" />
                </label>

                <div className="p-3.5 rounded-lg border border-slate-800 bg-slate-950/50">
                  <div className="text-[11px] font-bold text-cyan-300 mb-2">AI 生成邏輯摘要</div>
                  <ul className="space-y-1 text-xs text-slate-300 list-disc list-inside">
                    {buildLogicNotes(odmDraft, languageDraft).map((note) => <li key={note}>{note}</li>)}
                  </ul>
                </div>
              </div>
            )}

            {activeStage === 'source' && (
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  {buildUsedSources(project, sourceDraft).map((source) => (
                    <div key={`${source.kind}-${source.label}`} className="p-3 rounded-lg border border-slate-800 bg-slate-900/60">
                      <div className="text-[10px] text-cyan-300 font-bold">{source.kind === 'topic' ? '主題來源' : source.kind === 'pptx' ? 'PPTX 投影片' : source.kind === 'pdf' ? 'PDF 文件' : '補充研究文字'}</div>
                      <div className="text-xs text-white mt-1 break-words">{source.label}</div>
                      <div className="text-[10px] text-slate-500 mt-1">{source.chars.toLocaleString()} 字元</div>
                    </div>
                  ))}
                </div>
                <div className="p-3 rounded-lg border border-slate-800 bg-slate-950/50">
                  <div className="text-[11px] font-bold text-cyan-300 mb-2">AI 使用這些來源的方式</div>
                  <ul className="space-y-1 text-xs text-slate-300 list-disc list-inside">
                    {buildLogicNotes(odmDraft, languageDraft).map((note) => <li key={note}>{note}</li>)}
                  </ul>
                </div>
                <textarea
                  value={sourceDraft}
                  onChange={(e) => setSourceDraft(e.target.value)}
                  rows={14}
                  spellCheck={false}
                  className="flex-1 min-h-48 w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950 text-sm text-slate-100 leading-relaxed resize-none"
                />
              </div>
            )}

            {activeStage === 'outline' && (
              (() => {
                let outlineData: { title?: string; subtitle?: string; domain?: TechDomain; scenes?: SceneSpec[] } = {};
                try { outlineData = JSON.parse(outlineDraft); } catch { outlineData = { scenes: [] }; }
                const outlineScenes = Array.isArray(outlineData.scenes) ? outlineData.scenes : [];
                return (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">影片標題</label>
                        <input
                          value={outlineData.title || ''}
                          onChange={(e) => {
                            const next = { ...outlineData, title: e.target.value };
                            setOutlineDraft(JSON.stringify(next, null, 2));
                            setJsonDraft(JSON.stringify(next, null, 2));
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] text-slate-400 mb-1">副標題</label>
                        <input
                          value={outlineData.subtitle || ''}
                          onChange={(e) => {
                            const next = { ...outlineData, subtitle: e.target.value };
                            setOutlineDraft(JSON.stringify(next, null, 2));
                            setJsonDraft(JSON.stringify(next, null, 2));
                          }}
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      {outlineScenes.map((scene, index) => (
                        <section key={scene.id || index} className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/55 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[11px] font-bold font-mono text-cyan-300">SCENE {String(index + 1).padStart(2, '0')}</span>
                            <span className="text-[10px] text-slate-500">逐場景 Remotion / 腳本參數</span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-[1fr_110px] gap-2">
                            <input
                              value={scene.title || ''}
                              onChange={(e) => updateOutlineScene(index, { title: e.target.value })}
                              placeholder="場景標題"
                              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                            />
                            <input
                              type="number"
                              min={3}
                              max={180}
                              value={scene.durationSeconds || 6}
                              onChange={(e) => updateOutlineScene(index, { durationSeconds: Number(e.target.value) || 6 })}
                              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                            />
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <select
                              value={scene.template || 'architecture-flow'}
                              onChange={(e) => updateOutlineScene(index, { template: e.target.value as VisualTemplate })}
                              className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-white"
                            >
                              {(Object.keys(TEMPLATE_LABELS) as VisualTemplate[]).map((template) => <option key={template} value={template}>{TEMPLATE_LABELS[template]}</option>)}
                            </select>
                            <div className="space-y-1">
                              <select
                                value={scene.animation?.effect || 'signal-pulse'}
                                onChange={(e) => updateOutlineScene(index, { animation: { ...scene.animation, effect: e.target.value as RemotionEffect } })}
                                className="w-full px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-white"
                              >
                                {(Object.keys(EFFECT_LABELS) as RemotionEffect[]).map((effect) => <option key={effect} value={effect}>{EFFECT_LABELS[effect]}</option>)}
                              </select>
                              <div className="text-[9px] text-slate-500">下方可預覽並選擇效果</div>
                            </div>
                            <select
                              value={scene.animation?.motionStyle || 'smooth-sweep'}
                              onChange={(e) => updateOutlineScene(index, { animation: { ...scene.animation, motionStyle: e.target.value as MotionStyle } })}
                              className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-white"
                            >
                              <option value="spring-snappy">彈性快速</option>
                              <option value="smooth-sweep">平滑掃描</option>
                              <option value="step-reveal">階梯顯示</option>
                            </select>
                            <input
                              type="color"
                              value={scene.animation?.accentColor || '#38BDF8'}
                              onChange={(e) => updateOutlineScene(index, { animation: { ...scene.animation, accentColor: e.target.value } })}
                              title="場景主色"
                              className="h-[34px] w-full rounded-lg bg-slate-950 border border-slate-700 p-1"
                            />
                          </div>

                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" aria-label="Remotion 特效預覽">
                            {(Object.keys(EFFECT_LABELS) as RemotionEffect[]).map((effect) => {
                              const active = (scene.animation?.effect || 'signal-pulse') === effect;
                              return (
                                <button
                                  key={effect}
                                  type="button"
                                  onClick={() => updateOutlineScene(index, { animation: { ...scene.animation, effect } })}
                                  aria-pressed={active}
                                  title={EFFECT_LABELS[effect]}
                                  className={`effect-preview-card group text-left rounded-lg border p-2 transition ${
                                    active
                                      ? 'border-cyan-400 bg-cyan-500/10'
                                      : 'border-slate-700 bg-slate-950/80 hover:border-slate-500'
                                  }`}
                                >
                                  <div className={`effect-preview effect-preview-${effect}`} aria-hidden="true">
                                    {effect === 'signal-pulse' && (
                                      <><span className="effect-node effect-node-a" /><span className="effect-line" /><span className="effect-node effect-node-b" /></>
                                    )}
                                    {effect === 'glitch-alert' && (
                                      <><span className="effect-glitch-line effect-glitch-a" /><span className="effect-glitch-line effect-glitch-b" /><span className="effect-glitch-line effect-glitch-c" /></>
                                    )}
                                    {effect === 'cascade-reveal' && (
                                      <><span className="effect-cascade effect-cascade-a" /><span className="effect-cascade effect-cascade-b" /><span className="effect-cascade effect-cascade-c" /></>
                                    )}
                                    {effect === 'zoom-focus' && (
                                      <><span className="effect-focus-ring" /><span className="effect-focus-dot" /></>
                                    )}
                                    {effect === 'sweep-scan' && (
                                      <><span className="effect-sweep-grid" /><span className="effect-sweep-beam" /></>
                                    )}
                                    {effect === 'packet-traffic' && (
                                      <><span className="effect-device effect-device-a">A</span><span className="effect-packet effect-packet-a" /><span className="effect-packet effect-packet-b" /><span className="effect-device effect-device-b">B</span></>
                                    )}
                                  </div>
                                  <div className={`mt-1.5 truncate text-[9px] font-semibold ${active ? 'text-cyan-300' : 'text-slate-300'}`}>
                                    {EFFECT_LABELS[effect].split(' (')[0]}
                                  </div>
                                </button>
                              );
                            })}
                          </div>

                          <div className="flex flex-wrap gap-4 text-[11px] text-slate-300">
                            <label className="flex items-center gap-2"><input type="checkbox" checked={scene.animation?.showSubtitles !== false} onChange={(e) => updateOutlineScene(index, { animation: { ...scene.animation, showSubtitles: e.target.checked } })} className="accent-cyan-400" /> 顯示字幕</label>
                            <label className="flex items-center gap-2"><input type="checkbox" checked={scene.animation?.showProgressHud !== false} onChange={(e) => updateOutlineScene(index, { animation: { ...scene.animation, showProgressHud: e.target.checked } })} className="accent-cyan-400" /> 顯示進度 HUD</label>
                          </div>

                          <input
                            value={scene.subtitle || ''}
                            onChange={(e) => updateOutlineScene(index, { subtitle: e.target.value })}
                            placeholder="場景副標題"
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white"
                          />
                          <textarea
                            value={(scene.keyPoints || []).join('\n')}
                            onChange={(e) => updateOutlineScene(index, { keyPoints: e.target.value.split('\n').map((point) => point.trim()).filter(Boolean) })}
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white leading-relaxed"
                            placeholder="畫面要點（每行一項）"
                          />

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            <select
                              value={scene.tts?.provider || project.ttsConfig.defaultProvider}
                              onChange={(e) => updateOutlineScene(index, { tts: { ...scene.tts, provider: e.target.value as TtsProvider } })}
                              className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-white"
                            >
                              <option value="openformosa">OpenFormosa / BlueMagpie</option>
                              <option value="ming-3.0">Ming-3.0-TTS</option>
                              <option value="browser-fallback">瀏覽器快速語音</option>
                            </select>
                            <input
                              value={scene.tts?.voiceId || ''}
                              onChange={(e) => updateOutlineScene(index, { tts: { ...scene.tts, voiceId: e.target.value } })}
                              placeholder="Voice ID"
                              className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-white"
                            />
                            <input
                              type="number"
                              min={0.5}
                              max={2}
                              step={0.05}
                              value={scene.tts?.speed || 1}
                              onChange={(e) => updateOutlineScene(index, { tts: { ...scene.tts, speed: Number(e.target.value) || 1 } })}
                              className="px-2.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-white"
                            />
                          </div>

                          <textarea
                            value={scene.script || ''}
                            onChange={(e) => updateOutlineScene(index, { script: e.target.value })}
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white leading-relaxed"
                            placeholder="旁白腳本"
                          />
                          <textarea
                            value={scene.visualDescription || ''}
                            onChange={(e) => updateOutlineScene(index, { visualDescription: e.target.value })}
                            rows={2}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white leading-relaxed"
                            placeholder="畫面與特效描述"
                          />
                          <textarea
                            value={JSON.stringify(scene.diagramData || {}, null, 2)}
                            onChange={(e) => {
                              try { updateOutlineScene(index, { diagramData: JSON.parse(e.target.value) }); } catch { /* Keep text in advanced JSON until valid. */ }
                            }}
                            rows={5}
                            spellCheck={false}
                            className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-slate-100 font-mono leading-relaxed"
                            placeholder="diagramData JSON"
                          />
                        </section>
                      ))}
                    </div>

                    <details className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                      <summary className="cursor-pointer text-xs font-semibold text-slate-300">進階場景大綱 JSON</summary>
                      <textarea
                        value={outlineDraft}
                        onChange={(e) => setOutlineDraft(e.target.value)}
                        rows={16}
                        spellCheck={false}
                        className="mt-3 w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-[11px] text-slate-100 font-mono leading-relaxed"
                      />
                    </details>
                  </div>
                );
              })()
            )}

            {activeStage === 'json' && (
              <textarea
                value={jsonDraft}
                onChange={(e) => setJsonDraft(e.target.value)}
                rows={22}
                spellCheck={false}
                className="flex-1 min-h-48 w-full px-4 py-3 rounded-xl border border-slate-800 bg-slate-950 text-xs text-slate-100 font-mono leading-relaxed resize-none"
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
