import { AdTemplate } from "../types";
import { AiReviewResult, aiReviewText, decideByAi, isAiEnabled } from "./aiAgent";

export interface DetectAdContext {
  templates: AdTemplate[];
  defaultThreshold: number;
}

let context: DetectAdContext = { templates: [], defaultThreshold: 0.6 };
// Optional hook used in tests to override the AI review call without hitting the real API.
let aiReviewOverride: ((text: string) => Promise<AiReviewResult | null>) | null = null;

export function setDetectAdContext(next: Partial<DetectAdContext>) {
  context = {
    templates: next.templates ?? context.templates,
    defaultThreshold: next.defaultThreshold ?? context.defaultThreshold,
  };
}

export function setAiReviewOverride(fn: ((text: string) => Promise<AiReviewResult | null>) | null) {
  aiReviewOverride = fn;
}

export function toHalfWidth(str: string): string {
  return str
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .replace(/\u3000/g, " ");
}

export function normalizeText(s: string): string {
  const lower = toHalfWidth(s).toLowerCase();
  const stripped = lower.replace(/[^\p{Letter}\p{Number}\u4e00-\u9fa5]+/gu, "");
  return stripped;
}

export function ngrams(s: string, n: number): Set<string> {
  const set = new Set<string>();
  if (!s) return set;
  const N = Math.max(1, Math.min(n, s.length));
  for (let i = 0; i <= s.length - N; i++) set.add(s.slice(i, i + N));
  return set;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  const uni = a.size + b.size - inter;
  return uni === 0 ? 0 : inter / uni;
}

export function detectAdTemplate(
  text: string,
  ctx: DetectAdContext = context
): { matched: boolean; name?: string; score?: number } {
  const norm = normalizeText(text);
  if (!norm) return { matched: false };
  const templateList = ctx.templates || [];
  const defaultThr = ctx.defaultThreshold ?? 0.6;
  const a = ngrams(norm, norm.length >= 3 ? 3 : 2);
  let best = { name: "", score: 0, thr: defaultThr };
  for (const tpl of templateList) {
    const b = ngrams(normalizeText(tpl.content), tpl.content.length >= 3 ? 3 : 2);
    const score = jaccard(a, b);
    const thr = Math.max(0, Math.min(1, tpl.threshold ?? defaultThr));
    if (score >= thr && score > best.score) best = { name: tpl.name, score, thr };
  }
  if (best.score >= (best.thr || defaultThr)) return { matched: true, name: best.name, score: Number(best.score.toFixed(3)) };
  return { matched: false };
}

export interface DetectAdResult {
  isAd: boolean;
  by: "ai" | "legacy";
  legacyScore?: number;
  legacyTemplateName?: string;
  aiConfidence?: number;
  aiReason?: string;
}

export async function detectAd(text: string): Promise<DetectAdResult> {
  const legacy = detectAdTemplate(text);

  if (!isAiEnabled()) {
    return {
      isAd: legacy.matched,
      by: "legacy",
      legacyScore: legacy.score,
      legacyTemplateName: legacy.name,
    };
  }

  const aiResult: AiReviewResult | null = aiReviewOverride
    ? await aiReviewOverride(text)
    : await aiReviewText(text);

  if (aiResult && decideByAi(aiResult)) {
    return {
      isAd: true,
      by: "ai",
      legacyScore: legacy.score,
      legacyTemplateName: legacy.name,
      aiConfidence: aiResult.confidence,
      aiReason: aiResult.reason,
    };
  }

  return {
    isAd: legacy.matched,
    by: "legacy",
    legacyScore: legacy.score,
    legacyTemplateName: legacy.name,
    aiConfidence: aiResult?.confidence,
    aiReason: aiResult?.reason,
  };
}

export function getDetectAdContext(): DetectAdContext {
  return context;
}
