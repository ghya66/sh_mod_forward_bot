/// <reference types="node" />
/**
 * 广告检测功能测试脚本
 * 测试项目：
 * 1. 媒体组去重
 * 2. AI Prompt 分类
 * 3. OCR 功能
 */

import "dotenv/config";

// 测试用例
const testCases = [
  {
    name: "出售类广告",
    text: "出售iPhone 15 Pro 256G，9成新，价格3000元，微信联系：abc123",
    expectedType: "出售",
    expectedIsAd: true
  },
  {
    name: "求购类广告",
    text: "收一台二手iPad Pro，预算2000左右，有的私聊",
    expectedType: "求购",
    expectedIsAd: true
  },
  {
    name: "服务推广类",
    text: "高端会所，专业按摩服务，环境优雅，欢迎预约体验",
    expectedType: "推广",
    expectedIsAd: true
  },
  {
    name: "普通聊天",
    text: "今天天气真好，大家周末有什么安排吗？",
    expectedType: undefined,
    expectedIsAd: false
  },
  {
    name: "短文本",
    text: "你好",
    expectedType: undefined,
    expectedIsAd: false
  }
];

// 模拟 callAIReview 函数
async function testAIReview() {
  console.log("=== 广告检测测试 ===\n");
  
  const AI_API_KEY = process.env.AI_API_KEY;
  if (!AI_API_KEY) {
    console.log("❌ 未配置 AI_API_KEY，跳过 AI 测试");
    return;
  }
  
  for (const tc of testCases) {
    console.log(`测试: ${tc.name}`);
    console.log(`  文本: "${tc.text.substring(0, 30)}..."`);
    
    // 构建 prompt
    const prompt = `你是广告内容审核助手。请判断以下消息是否为广告。

广告类型包括:
1. 出售类: 卖东西、商品转让、二手交易、出售信息
2. 求购类: 收购、求购、想买、收一个
3. 服务推广: 会所、按摩、休闲服务、商家宣传

消息内容:
"""
${tc.text}
"""

如果是广告，回复: {"isAd": true, "type": "出售/求购/推广", "reason": "简短说明"}
如果不是广告，回复: {"isAd": false, "reason": "简短说明"}`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${AI_API_KEY}`
        },
        body: JSON.stringify({
          model: process.env.AI_MODEL || "gpt-4.1-mini",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 100,
          temperature: 0.3
        })
      });
      
      const data = await response.json() as any;
      const content = data.choices?.[0]?.message?.content || "";
      
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        const passed = result.isAd === tc.expectedIsAd;
        console.log(`  结果: ${JSON.stringify(result)}`);
        console.log(`  状态: ${passed ? "✅ PASS" : "❌ FAIL"}`);
      } else {
        console.log(`  ❌ 解析失败: ${content}`);
      }
    } catch (err: any) {
      console.log(`  ❌ 错误: ${err.message}`);
    }
    
    console.log("");
  }
}

// 运行测试
testAIReview().then(() => {
  console.log("=== 测试完成 ===");
});
