import assert from "node:assert/strict";
import { detectAd, setAiReviewOverride, setDetectAdContext } from "../services/detectAd";
import { AiReviewResult } from "../services/aiAgent";
import { AdTemplate } from "../types";

function snapshotEnv(keys: string[]): Record<string, string | undefined> {
  const snap: Record<string, string | undefined> = {};
  for (const k of keys) snap[k] = process.env[k];
  return snap;
}

function restoreEnv(snap: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(snap)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
}

async function runLegacyOnlyScenario() {
  const envSnap = snapshotEnv(["USE_AI_REVIEW", "AI_API_KEY"]);
  try {
    process.env.USE_AI_REVIEW = "0";
    delete process.env.AI_API_KEY;

    const templates: AdTemplate[] = [
      { name: "折扣", content: "限时优惠购买", threshold: 0.3 },
    ];
    setDetectAdContext({ templates, defaultThreshold: 0.3 });

    let aiCalled = false;
    setAiReviewOverride(async () => {
      aiCalled = true;
      return { isAd: true, confidence: 1, reason: "should not run" };
    });

    const adText = "限时优惠购买立减";
    const adRes = await detectAd(adText);
    assert.equal(adRes.by, "legacy");
    assert.equal(adRes.isAd, true);
    assert.equal(adRes.legacyTemplateName, "折扣");
    assert.ok(adRes.legacyScore !== undefined);
    assert.equal(aiCalled, false);

    const normalRes = await detectAd("今天晚上一起散步吗");
    assert.equal(normalRes.by, "legacy");
    assert.equal(normalRes.isAd, false);
    assert.equal(normalRes.aiConfidence, undefined);
    assert.equal(aiCalled, false);
  } finally {
    restoreEnv(envSnap);
    setAiReviewOverride(null);
  }
}

async function runAiOverrideScenario() {
  const envSnap = snapshotEnv(["USE_AI_REVIEW", "AI_API_KEY"]);
  try {
    process.env.USE_AI_REVIEW = "1";
    process.env.AI_API_KEY = "dummy-key";

    const templates: AdTemplate[] = [
      { name: "折扣", content: "限时优惠购买", threshold: 0.3 },
    ];
    setDetectAdContext({ templates, defaultThreshold: 0.3 });

    setAiReviewOverride(async (): Promise<AiReviewResult> => ({
      isAd: true,
      confidence: 0.9,
      reason: "mock ai ad",
    }));
    const aiAdRes = await detectAd("这是一段任意文本");
    assert.equal(aiAdRes.by, "ai");
    assert.equal(aiAdRes.isAd, true);
    assert.equal(aiAdRes.aiReason, "mock ai ad");
    assert.equal(aiAdRes.legacyTemplateName, undefined);

    setAiReviewOverride(async (): Promise<AiReviewResult> => ({
      isAd: false,
      confidence: 0.2,
      reason: "mock clean",
    }));
    const fallbackRes = await detectAd("限时优惠购买立减");
    assert.equal(fallbackRes.by, "legacy");
    assert.equal(fallbackRes.isAd, true);
    assert.equal(fallbackRes.legacyTemplateName, "折扣");
    assert.equal(fallbackRes.aiConfidence, 0.2);
    assert.equal(fallbackRes.aiReason, "mock clean");
  } finally {
    restoreEnv(envSnap);
    setAiReviewOverride(null);
  }
}

async function main() {
  await runLegacyOnlyScenario();
  await runAiOverrideScenario();
  console.log("detectAd unit tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
