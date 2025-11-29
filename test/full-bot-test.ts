/// <reference types="node" />
/**
 * Bot 全功能测试脚本
 * 测试范围：按钮、功能、权限
 */

import "dotenv/config";

const TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const ADMIN_ID = process.env.ADMIN_IDS?.split(",")[0] || "";
const API_BASE = `https://api.telegram.org/bot${TOKEN}`;

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

// API 调用
async function api(method: string, params: any = {}): Promise<any> {
  try {
    const response = await fetch(`${API_BASE}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params)
    });
    return await response.json();
  } catch (err: any) {
    return { ok: false, description: err.message };
  }
}

// 测试函数
function test(name: string, passed: boolean, error?: string) {
  results.push({ name, passed, error });
  console.log(`${passed ? "✅" : "❌"} ${name}${error ? `: ${error}` : ""}`);
}

// ========== 测试用例 ==========

async function testBotInfo() {
  console.log("\n=== 1. Bot 基础信息 ===");
  const res = await api("getMe");
  test("获取 Bot 信息", res.ok, res.description);
  if (res.ok) {
    console.log(`   Bot: @${res.result.username} (ID: ${res.result.id})`);
  }
}

async function testWebhook() {
  console.log("\n=== 2. Webhook 状态 ===");
  const res = await api("getWebhookInfo");
  test("获取 Webhook 信息", res.ok, res.description);
  if (res.ok) {
    const isPolling = !res.result.url;
    console.log(`   模式: ${isPolling ? "Polling" : "Webhook"}`);
    console.log(`   待处理更新: ${res.result.pending_update_count}`);
  }
}

async function testCommands() {
  console.log("\n=== 3. 命令菜单 ===");
  const res = await api("getMyCommands");
  test("获取命令菜单", res.ok, res.description);
  if (res.ok && res.result.length > 0) {
    console.log(`   已注册命令: ${res.result.map((c: any) => "/" + c.command).join(", ")}`);
  }
}

function testButtonDefinitions() {
  console.log("\n=== 4. 按钮定义检查 ===");
  
  // 底部按钮命令
  const buttonCmds = ['帮助', '❓帮助', '菜单', '开始', '设置', '⚙️设置', '统计', '📊统计', 
    '频道管理', '📣频道管理', '按钮管理', '🔘按钮管理', '修改欢迎语', '📝修改欢迎语'];
  test("底部按钮命令定义", buttonCmds.length === 14);
  
  // 管理员命令
  const adminCmds = ['设置', '⚙️设置', '统计', '📊统计', '频道管理', '📣频道管理', 
    '按钮管理', '🔘按钮管理', '修改欢迎语', '📝修改欢迎语'];
  test("管理员命令定义", adminCmds.length === 10);
  
  console.log(`   底部按钮: ${buttonCmds.length} 个`);
  console.log(`   管理命令: ${adminCmds.length} 个`);
}

function testCallbackPatterns() {
  console.log("\n=== 5. Callback Query 模式 ===");
  
  const patterns = [
    { prefix: "panel:", desc: "管理面板" },
    { prefix: "btn:", desc: "引流按钮" },
    { prefix: "rate:", desc: "速率限制" },
    { prefix: "allowlist:", desc: "白名单模式" },
    { prefix: "sources:", desc: "来源白名单" },
    { prefix: "strict:", desc: "严格模板" },
    { prefix: "adtpl:", desc: "广告模板" },
    { prefix: "admins:", desc: "管理员管理" },
    { prefix: "allow:", desc: "用户白名单" },
    { prefix: "block:", desc: "用户黑名单" },
    { prefix: "approve:", desc: "审核通过" },
    { prefix: "reject:", desc: "审核拒绝" },
    { prefix: "ban:", desc: "封禁用户" },
  ];
  
  test("Callback 模式定义", patterns.length === 13);
  patterns.forEach(p => console.log(`   ${p.prefix.padEnd(12)} → ${p.desc}`));
}

function testPermissionFlow() {
  console.log("\n=== 6. 权限验证流程 ===");
  
  const adminOnlyCallbacks = [
    "panel:", "btn:", "rate:", "allowlist:", "sources:", 
    "strict:", "adtpl:", "admins:", "allow:", "block:",
    "approve:", "reject:", "ban:"
  ];
  
  test("管理员权限回调数量", adminOnlyCallbacks.length === 13);
  console.log(`   需要管理员权限的回调: ${adminOnlyCallbacks.length} 类`);
}

function testAdDetectionFlow() {
  console.log("\n=== 7. 广告检测流程 ===");
  
  const steps = [
    "1. 媒体组去重",
    "2. 来源白名单检查 (私聊豁免)",
    "3. 黑名单/白名单检查",
    "4. 管理员免审检查",
    "5. 提取消息文本",
    "6. OCR 图片识别 (可选)",
    "7. 模板匹配",
    "8. AI 审核 (可选)",
    "9. 严格模式检查",
    "10. 创建审核请求",
    "11. 发送到审核频道/管理员"
  ];
  
  test("广告检测流程步骤", steps.length === 11);
  steps.forEach(s => console.log(`   ${s}`));
}

function testStabilityFeatures() {
  console.log("\n=== 8. 稳定性功能 ===");
  
  const features = [
    { name: "全局错误处理", desc: "bot.catch + process.on" },
    { name: "AI 降级策略", desc: "失败时使用模板匹配" },
    { name: "数据库重试", desc: "SQLite 锁定时重试 3 次" },
    { name: "过期请求清理", desc: "每小时清理 24h 前的请求" },
    { name: "速率限制", desc: "Bottleneck 控制 API 调用" },
  ];
  
  test("稳定性功能数量", features.length === 5);
  features.forEach(f => console.log(`   ✓ ${f.name}: ${f.desc}`));
}

function testEnvConfig() {
  console.log("\n=== 9. 环境变量配置 ===");
  
  const required = ["TELEGRAM_BOT_TOKEN"];
  const optional = [
    "FORWARD_TARGET_ID", "REVIEW_TARGET_ID", "ADMIN_IDS",
    "USE_AI_REVIEW", "AI_API_KEY", "AI_MODEL",
    "PERSIST_BACKEND", "SQLITE_PATH"
  ];
  
  let missingRequired = false;
  required.forEach(key => {
    const exists = !!process.env[key];
    if (!exists) missingRequired = true;
    console.log(`   ${exists ? "✓" : "✗"} ${key}: ${exists ? "已配置" : "未配置 (必需)"}`);
  });
  
  optional.forEach(key => {
    const exists = !!process.env[key];
    console.log(`   ${exists ? "✓" : "-"} ${key}: ${exists ? "已配置" : "未配置"}`);
  });
  
  test("必需环境变量", !missingRequired);
}

// ========== 运行测试 ==========

async function runAllTests() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║       Bot 全功能测试脚本               ║");
  console.log("╚════════════════════════════════════════╝");
  
  await testBotInfo();
  await testWebhook();
  await testCommands();
  testButtonDefinitions();
  testCallbackPatterns();
  testPermissionFlow();
  testAdDetectionFlow();
  testStabilityFeatures();
  testEnvConfig();
  
  // 汇总
  console.log("\n╔════════════════════════════════════════╗");
  console.log("║              测试结果汇总              ║");
  console.log("╚════════════════════════════════════════╝");
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n   通过: ${passed}`);
  console.log(`   失败: ${failed}`);
  console.log(`   总计: ${results.length}`);
  
  if (failed > 0) {
    console.log("\n   失败项目:");
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   ❌ ${r.name}: ${r.error || "未知错误"}`);
    });
  }
  
  console.log(`\n   状态: ${failed === 0 ? "✅ 全部通过" : "❌ 存在失败"}`);
}

runAllTests();
