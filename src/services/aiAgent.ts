import { setTimeout as delay } from "timers/promises";

export interface AiReviewResult {
  isAd: boolean;
  confidence: number; // 0~1
  reason: string;
}

const AI_DECISION_THRESHOLD = 0.5;

export function isAiEnabled(): boolean {
  return process.env.USE_AI_REVIEW === "1" && Boolean(process.env.AI_API_KEY);
}

export async function aiReviewText(text: string): Promise<AiReviewResult | null> {
  if (!isAiEnabled()) return null;
  if (text.trim().length < 10) return null;

  const apiKey = process.env.AI_API_KEY as string;
  const model = process.env.AI_MODEL || "gpt-4.1-mini";
  const timeoutMs = Number(process.env.AI_TIMEOUT_MS || 4000);

  const controller = new AbortController();
  const timeout = delay(timeoutMs).then(() => controller.abort());

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 100,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "你是内容审核助手。只返回 JSON 字符串，不要任何额外文本。格式：{\"isAd\":true/false,\"confidence\":0-1数字,\"reason\":\"简短中文说明\"}",
          },
          {
            role: "user",
            content: text,
          },
        ],
      }),
      signal: controller.signal,
    });

    await timeout.catch(() => undefined);

    if (!res.ok) {
      throw new Error(`AI review HTTP ${res.status} ${res.statusText}`);
    }
    const data: any = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (!content) throw new Error("AI response empty content");

    const parsed = JSON.parse(content);
    const result: AiReviewResult = {
      isAd: Boolean(parsed.isAd),
      confidence: Number(parsed.confidence ?? 0),
      reason: String(parsed.reason ?? ""),
    };
    if (Number.isNaN(result.confidence)) result.confidence = 0;
    return result;
  } catch (err) {
    console.error("[aiReviewText]", err);
    return null;
  } finally {
    controller.abort();
  }
}

export function decideByAi(result: AiReviewResult | null): boolean {
  if (!result) return false;
  return result.isAd === true && Number(result.confidence) >= AI_DECISION_THRESHOLD;
}
