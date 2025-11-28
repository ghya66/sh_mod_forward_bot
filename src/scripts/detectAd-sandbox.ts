import { detectAd, setAiReviewOverride, setDetectAdContext } from "../services/detectAd";
import { AiReviewResult } from "../services/aiAgent";
import { AdTemplate } from "../types";

const templates: AdTemplate[] = [
  { name: "优惠券广告", content: "全场五折\n私聊购买", threshold: 0.4 },
  { name: "关注公众号", content: "扫码关注\n送福利", threshold: 0.5 },
];

const samples = [
  { label: "广告样例", text: "限时折扣，扫码关注领取优惠券，私聊购买立减" },
  { label: "正常聊天", text: "今天晚饭吃什么？我们去尝试新的餐厅吧" },
];

async function runScenario(title: string) {
  console.log(`\n== ${title} ==`);
  for (const sample of samples) {
    const result = await detectAd(sample.text);
    console.log(sample.label, "=>", result);
  }
}

async function main() {
  setDetectAdContext({ templates, defaultThreshold: 0.6 });

  process.env.USE_AI_REVIEW = "0";
  setAiReviewOverride(null);
  await runScenario("USE_AI_REVIEW=0，走模板逻辑");

  process.env.USE_AI_REVIEW = "1";
  process.env.AI_API_KEY = process.env.AI_API_KEY || "mock-key";
  setAiReviewOverride(async (text: string): Promise<AiReviewResult> => {
    if (text.includes("折扣") || text.includes("优惠")) {
      return { isAd: true, confidence: 0.9, reason: "mock: 折扣关键词" };
    }
    return { isAd: false, confidence: 0.2, reason: "mock: 正常聊天" };
  });
  await runScenario("USE_AI_REVIEW=1，AI 分支（mock）");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
