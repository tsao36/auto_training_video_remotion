---
name: ui-ux-pro-max
description: "Use when designing or reviewing UI/UX, video presentation backgrounds, slide composition, visual themes, palettes, typography, captions, charts, accessibility, or Remotion motion styling. Generates evidence-based design systems and stack-specific guidance for this React and Tailwind Remotion project."
argument-hint: "Describe the video presentation or interface design goal"
user-invocable: true
---

# UI UX Pro Max

Use the installed UI UX Pro Max datasets and Python search engine to make visual decisions before editing presentation or interface code.

## When to Use

- Design video backgrounds, title styles, HUDs, captions, charts, transitions, or full presentation systems
- Choose Remotion visual direction, color palettes, typography, spacing, or motion intensity
- Retheme or review the React creation wizard, editor, dashboard, or player
- Improve visual hierarchy, accessibility, readability, responsive layout, or interaction states

## Project Context

This workspace is a React 18, TypeScript, Tailwind CSS, Vite, and Remotion 4 project. The video theme definitions live in `src/utils/videoThemes.ts`, and creation-stage theme selection lives in `src/components/SourceWizardModal.tsx`.

The installed UI UX Pro Max assets are shared from:

- Prompt: [ui-ux-pro-max.prompt.md](../../prompts/ui-ux-pro-max.prompt.md)
- Search engine: [search.py](../../prompts/ui-ux-pro-max/scripts/search.py)

Python is available in this environment as `python` on Windows.

## Workflow

1. Analyze the request and identify the dominant product, audience, visual intent, and content-density constraint.
2. Generate a design system for a new visual direction or system-wide video theme:

```powershell
python .github/prompts/ui-ux-pro-max/scripts/search.py "technical training video presentation <keywords>" --design-system -p "Remotion Presentation" --variance 5 --motion 5 --density 4
```

3. Use focused domain searches only for unresolved concerns:

```powershell
python .github/prompts/ui-ux-pro-max/scripts/search.py "technical presentation background" --domain color
python .github/prompts/ui-ux-pro-max/scripts/search.py "technical video typography" --domain typography
python .github/prompts/ui-ux-pro-max/scripts/search.py "caption readability contrast" --domain ux
python .github/prompts/ui-ux-pro-max/scripts/search.py "responsive compact selector" --stack react
```

4. Adapt recommendations to Remotion. Preserve one clear idea per scene, avoid crowding, keep captions readable at 1920x1080, and use frame-driven animation rather than CSS animation for rendered video.
5. Reuse `VideoThemeId` and the existing `VideoThemeDefinition` contract when adding or changing themes. Keep wizard previews and rendered themes backed by the same definitions.
6. Validate contrast, caption legibility, focus states, responsive theme cards, live preview switching, editor playback, still preview, and final render.

## Guardrails

- Do not apply landing-page patterns to compact editor controls without adapting them to an operational UI.
- Do not create a parallel theme/token system when `src/utils/videoThemes.ts` can represent the style.
- Do not reduce technical readability to achieve decoration.
- Treat generated recommendations as design evidence, not unconditional instructions; repository requirements and actual video preview results take precedence.
- Use Lucide icons and existing React/Tailwind conventions.
