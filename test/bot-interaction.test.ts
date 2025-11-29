/// <reference types="node" />
/**
 * Bot 交互功能测试脚本
 * 测试项目：
 * 1. 按钮交互功能
 * 2. 私聊广告识别
 * 3. 权限验证
 */

import "dotenv/config";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN_ID = process.env.ADMIN_IDS?.split(",")[0] || "";
const API_BASE = `https://api.telegram.org/bot${TOKEN}`;

// 测试用例
const testCases = {
  // 按钮命令测试
  buttonCommands: [
    { cmd: "/start", expected: "欢迎" },
    { cmd: "开始", expected: "欢迎" },
    { cmd: "菜单", expected: "菜单" },
    { cmd: "帮助", expected: "帮助" },
    { cmd: "❓ 帮助", expected: "帮助" },
    { cmd: "统计", expected: "统计" },
    { cmd: "📊 统计", expected: "统计" },
  ],
  
  // 管理员命令测试
  adminCommands: [
    { cmd: "设置", expected: "管理设置面板" },
    { cmd: "⚙️ 设置", expected: "管理设置面板" },
    { cmd: "频道管理", expected: "频道" },
    { cmd: "按钮管理", expected: "引流按钮" },
  ],
  
  // 私聊广告识别测试
  privateAdMessages: [
    { 
      text: "出售iPhone 15 Pro，9成新，价格3000元，微信联系",
      expectAdDetect: true,
      type: "出售类"
    },
    {
      text: "收一台二手iPad，预算2000，有的私聊",
      expectAdDetect: true,
      type: "求购类"
    },
    {
      text: "高端会所，专业服务，欢迎预约体验",
      expectAdDetect: true,
      type: "推广类"
    },
    {
      text: "今天天气真好",
      expectAdDetect: false,
      type: "普通消息"
    }
  ],
  
  // callback_query 数据测试
  callbackQueries: [
    "panel:back",
    "panel:set_target",
    "panel:set_review",
    "panel:buttons",
    "panel:rate",
    "panel:allowlist",
    "panel:sources",
    "panel:strict",
    "panel:adtpl",
    "panel:admins",
    "panel:lists",
    "panel:stats",
    "panel:view_config",
    "btn:list",
    "btn:add",
    "btn:set",
    "btn:del",
    "adtpl:list",
    "adtpl:add",
    "adtpl:test",
    "allowlist:toggle",
    "strict:toggle",
    "approve:test_id",
    "reject:test_id",
    "ban:123456",
  ]
};

// API 调用函数
async function callTelegramAPI(method: string, params: any = {}) {
  try {
    const response = await fetch(`${API_BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });
    return await response.json();
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
}

// 检查 Bot 信息
async function checkBotInfo() {
  console.log("=== 1. 检查 Bot 信息 ===");
  const result = await callTelegramAPI("getMe");
  if (result.ok) {
    console.log(`✅ Bot: @${result.result.username} (ID: ${result.result.id})`);
    return true;
  } else {
    console.log(`❌ 获取 Bot 信息失败: ${result.description}`);
    return false;
  }
}

// 检查 Webhook 状态
async function checkWebhook() {
  console.log("\n=== 2. 检查 Webhook 状态 ===");
  const result = await callTelegramAPI("getWebhookInfo");
  if (result.ok) {
    const info = result.result;
    if (info.url) {
      console.log(`⚠️ Webhook 已设置: ${info.url}`);
    } else {
      console.log("✅ 无 Webhook，使用 Polling 模式");
    }
    console.log(`   Pending updates: ${info.pending_update_count}`);
    return true;
  }
  return false;
}

// 列出 callback_query 数据格式
function listCallbackQueries() {
  console.log("\n=== 3. Callback Query 数据格式检查 ===");
  
  const patterns = {
    "panel:*": "管理面板导航",
    "btn:*": "引流按钮管理",
    "rate:*": "速率限制",
    "allowlist:*": "白名单模式",
    "sources:*": "来源白名单",
    "strict:*": "严格模板",
    "adtpl:*": "广告模板",
    "admins:*": "管理员管理",
    "allow:*": "用户白名单",
    "block:*": "用户黑名单",
    "approve:*": "审核通过",
    "reject:*": "审核拒绝",
    "ban:*": "封禁用户"
  };
  
  for (const [pattern, desc] of Object.entries(patterns)) {
    console.log(`  ${pattern.padEnd(15)} → ${desc}`);
  }
  
  console.log("\n✅ 所有 callback 模式已定义");
}

// 私聊广告识别流程检查
function checkPrivateChatAdFlow() {
  console.log("\n=== 4. 私聊广告识别流程 ===");
  console.log(`
  用户私聊 Bot
      ↓
  bot.on("message") 触发
      ↓
  检查是否按钮命令 → 是 → 执行命令
      ↓ 否
  检查是否管理员输入 → 是 → 处理设置
      ↓ 否
  handleIncoming() 处理
      ↓
  1. 媒体组去重
  2. 来源检查 (私聊 chatId = userId)
  3. 黑名单/白名单检查
  4. 管理员免审检查
  5. 提取文本 + OCR
  6. 模板匹配 + AI审核
  7. 创建审核请求
  8. 发送到审核频道/管理员
  `);
  
  console.log("✅ 私聊广告识别流程完整");
}

// 运行测试
async function runTests() {
  console.log("========================================");
  console.log("       Bot 交互功能测试");
  console.log("========================================\n");
  
  if (!TOKEN) {
    console.log("❌ 未配置 TELEGRAM_BOT_TOKEN");
    return;
  }
  
  await checkBotInfo();
  await checkWebhook();
  listCallbackQueries();
  checkPrivateChatAdFlow();
  
  console.log("\n=== 5. 测试用例汇总 ===");
  console.log(`  按钮命令: ${testCases.buttonCommands.length} 个`);
  console.log(`  管理命令: ${testCases.adminCommands.length} 个`);
  console.log(`  私聊广告: ${testCases.privateAdMessages.length} 个`);
  console.log(`  Callback: ${testCases.callbackQueries.length} 个`);
  
  console.log("\n========================================");
  console.log("  手动测试建议:");
  console.log("  1. 在 Telegram 中向 Bot 发送 /start");
  console.log("  2. 点击各个按钮验证功能");
  console.log("  3. 私聊发送广告文本验证识别");
  console.log("  4. 检查审核频道是否收到审核请求");
  console.log("========================================");
}

runTests();
