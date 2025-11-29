import type { Config, TrafficBtn, AdTemplate, Req } from "./types";
import Redis from "ioredis";
import Database from "better-sqlite3";

// 重试机制：用于处理数据库锁定等临时错误
async function withRetry<T>(fn: () => T | Promise<T>, retries = 3, delay = 100): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const isRetryable = err?.code === 'SQLITE_BUSY' || err?.message?.includes('database is locked');
      if (i === retries - 1 || !isRetryable) throw err;
      console.warn(`[DB] 操作失败，重试 ${i + 1}/${retries}:`, err.message);
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
  throw new Error('重试次数用尽');
}

export interface Store {
  init(): Promise<void>;
  // config
  getConfig(): Promise<Config>;
  setConfig(partial: Partial<Config> & Record<string, any>): Promise<void>;
  // buttons
  listButtons(): Promise<TrafficBtn[]>;
  setButtons(btns: TrafficBtn[]): Promise<void>;
  // templates
  listTemplates(): Promise<AdTemplate[]>;
  setTemplates(templates: AdTemplate[]): Promise<void>;
  // allow/block lists
  listAllow(): Promise<number[]>;
  addAllow(id: number): Promise<void>;
  removeAllow(id: number): Promise<void>;
  listBlock(): Promise<number[]>;
  addBlock(id: number): Promise<void>;
  removeBlock(id: number): Promise<void>;
  // pending queue
  getPending(id: string): Promise<Req | null>;
  setPending(req: Req): Promise<void>;
  delPending(id: string): Promise<void>;
  cleanupOldPending(cutoffTimestamp: number): Promise<number>;
}

function defaultConfig(env: NodeJS.ProcessEnv): Config {
  return {
    forwardTargetId: env.FORWARD_TARGET_ID || "",
    reviewTargetId: env.REVIEW_TARGET_ID || "",
    welcomeText: env.WELCOME_TEXT || "👋 欢迎！点击左下角“开始”或使用菜单按钮",
    attachButtonsToTargetMeta: (env.ATTACH_BUTTONS_TO_TARGET_META || "1") === "1",
    adminIds: (env.ADMIN_IDS || "").split(",").map(s => s.trim()).filter(Boolean),
    allowlistMode: (env.ALLOWLIST_MODE || "0") === "1",
    adtplDefaultThreshold: Math.min(1, Math.max(0, Number(env.ADTPL_DEFAULT_THRESHOLD ?? 0.6))),
  };
}

/* ---------------- Redis Store ---------------- */
export class RedisStore implements Store {
  private r: Redis;
  private prefix: string;
  constructor(url: string, prefix = "tgmod") {
    this.r = new Redis(url);
    this.prefix = prefix;
  }
  async init() { /* no-op */ }
  private k(key: string) { return `${this.prefix}:${key}`; }

  async getConfig(): Promise<Config> {
    const raw = await this.r.get(this.k("config"));
    if (raw) return JSON.parse(raw);
    const cfg = defaultConfig(process.env);
    await this.setConfig(cfg);
    return cfg;
  }
  async setConfig(partial: Partial<Config> | Config) {
    const current = await this.getConfig();
    const next = { ...current, ...partial };
    await this.r.set(this.k("config"), JSON.stringify(next));
  }

  async listButtons(): Promise<TrafficBtn[]> {
    const raw = await this.r.get(this.k("buttons"));
    return raw ? JSON.parse(raw) : [];
  }
  async setButtons(btns: TrafficBtn[]) {
    await this.r.set(this.k("buttons"), JSON.stringify(btns));
  }

  async listTemplates(): Promise<AdTemplate[]> {
    const raw = await this.r.get(this.k("templates"));
    return raw ? JSON.parse(raw) : [];
  }
  async setTemplates(tpls: AdTemplate[]) {
    await this.r.set(this.k("templates"), JSON.stringify(tpls));
  }

  async listAllow(): Promise<number[]> {
    const members = await this.r.smembers(this.k("allowlist"));
    return members.map(Number);
  }
  async addAllow(id: number) { await this.r.sadd(this.k("allowlist"), id.toString()); }
  async removeAllow(id: number) { await this.r.srem(this.k("allowlist"), id.toString()); }

  async listBlock(): Promise<number[]> {
    const members = await this.r.smembers(this.k("blocklist"));
    return members.map(Number);
  }
  async addBlock(id: number) { await this.r.sadd(this.k("blocklist"), id.toString()); }
  async removeBlock(id: number) { await this.r.srem(this.k("blocklist"), id.toString()); }

  async getPending(id: string): Promise<Req | null> {
    const raw = await this.r.hget(this.k("pending"), id);
    return raw ? JSON.parse(raw) : null;
  }
  async setPending(req: Req) {
    await this.r.hset(this.k("pending"), { [req.id]: JSON.stringify(req) });
  }
  async delPending(id: string) {
    await this.r.hdel(this.k("pending"), id);
  }
  
  async cleanupOldPending(cutoffTimestamp: number): Promise<number> {
    // Redis 版本：遍历所有 pending 并删除过期的
    const all = await this.r.hgetall(this.k("pending"));
    let count = 0;
    for (const [id, raw] of Object.entries(all)) {
      try {
        const req = JSON.parse(raw);
        if (req.createdAt < cutoffTimestamp) {
          await this.r.hdel(this.k("pending"), id);
          count++;
        }
      } catch {}
    }
    return count;
  }
}

/* ---------------- SQLite Store ---------------- */
export class SqliteStore implements Store {
  private db: Database.Database;
  constructor(path: string) {
    this.db = new Database(path);
  }
  async init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS buttons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        text TEXT NOT NULL,
        url TEXT NOT NULL,
        ord INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        threshold REAL NOT NULL
      );
      CREATE TABLE IF NOT EXISTS allowlist (user_id INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS blocklist (user_id INTEGER PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS pending (
        id TEXT PRIMARY KEY,
        sourceChatId TEXT NOT NULL,
        messageId INTEGER NOT NULL,
        fromId INTEGER NOT NULL,
        fromName TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        suspected_template TEXT,
        suspected_score REAL
      );
    `);
    // seed config if empty
    const row = this.db.prepare("SELECT value FROM config WHERE key='config'").get() as { value: string } | undefined;
    if (!row) {
      const cfg = defaultConfig(process.env);
      this.db.prepare("INSERT INTO config (key, value) VALUES ('config', ?)").run(JSON.stringify(cfg));
    }
  }

  async getConfig(): Promise<Config> {
    const row = this.db.prepare("SELECT value FROM config WHERE key='config'").get() as { value: string } | undefined;
    if (row?.value) return JSON.parse(row.value);
    const cfg = defaultConfig(process.env);
    await this.setConfig(cfg);
    return cfg;
  }
  async setConfig(partial: Partial<Config> | Config) {
    const current = await this.getConfig();
    const next = { ...current, ...partial };
    await withRetry(() => {
      this.db.prepare(
        "INSERT INTO config(key, value) VALUES ('config', ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
      ).run(JSON.stringify(next));
    });
  }

  async listButtons(): Promise<TrafficBtn[]> {
    const rows = this.db.prepare("SELECT text, url, ord AS 'order' FROM buttons ORDER BY ord ASC").all();
    return rows as TrafficBtn[];
  }
  async setButtons(btns: TrafficBtn[]) {
    await withRetry(() => {
      const trx = this.db.transaction((arr: TrafficBtn[]) => {
        this.db.prepare("DELETE FROM buttons").run();
        const stmt = this.db.prepare("INSERT INTO buttons(text, url, ord) VALUES (?, ?, ?)");
        for (const b of arr) stmt.run(b.text, b.url, b.order);
      });
      trx(btns);
    });
  }

  async listTemplates(): Promise<AdTemplate[]> {
    const rows = this.db.prepare("SELECT name, content, threshold FROM templates ORDER BY id ASC").all();
    return rows as AdTemplate[];
  }
  async setTemplates(tpls: AdTemplate[]) {
    await withRetry(() => {
      const trx = this.db.transaction((arr: AdTemplate[]) => {
        this.db.prepare("DELETE FROM templates").run();
        const stmt = this.db.prepare("INSERT INTO templates(name, content, threshold) VALUES (?, ?, ?)");
        for (const t of arr) stmt.run(t.name, t.content, t.threshold);
      });
      trx(tpls);
    });
  }

  async listAllow(): Promise<number[]> {
    return this.db.prepare("SELECT user_id FROM allowlist").all().map((r: any) => r.user_id);
  }
  async addAllow(id: number) { this.db.prepare("INSERT OR IGNORE INTO allowlist(user_id) VALUES (?)").run(id); }
  async removeAllow(id: number) { this.db.prepare("DELETE FROM allowlist WHERE user_id=?").run(id); }

  async listBlock(): Promise<number[]> {
    return this.db.prepare("SELECT user_id FROM blocklist").all().map((r: any) => r.user_id);
  }
  async addBlock(id: number) { this.db.prepare("INSERT OR IGNORE INTO blocklist(user_id) VALUES (?)").run(id); }
  async removeBlock(id: number) { this.db.prepare("DELETE FROM blocklist WHERE user_id=?").run(id); }

  async getPending(id: string): Promise<Req | null> {
    const r = this.db
      .prepare("SELECT id, sourceChatId, messageId, fromId, fromName, createdAt, suspected_template, suspected_score FROM pending WHERE id=?")
      .get(id) as
      | {
          id: string;
          sourceChatId: string;
          messageId: number;
          fromId: number;
          fromName: string;
          createdAt: number;
          suspected_template?: string | null;
          suspected_score?: number | null;
        }
      | undefined;

    if (!r) return null;

    const req: Req = {
      id: r.id,
      sourceChatId: isNaN(Number(r.sourceChatId)) ? r.sourceChatId : Number(r.sourceChatId),
      messageId: Number(r.messageId),
      fromId: Number(r.fromId),
      fromName: r.fromName,
      createdAt: Number(r.createdAt),
      suspected: r.suspected_template
        ? { template: r.suspected_template, score: Number(r.suspected_score ?? 0) }
        : undefined,
    };
    return req;
  }
  async setPending(req: Req) {
    await withRetry(() => {
      this.db.prepare(
        `INSERT OR REPLACE INTO pending(id, sourceChatId, messageId, fromId, fromName, createdAt, suspected_template, suspected_score)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        req.id,
        String(req.sourceChatId),
        req.messageId,
        req.fromId,
        req.fromName,
        req.createdAt,
        req.suspected?.template ?? null,
        req.suspected?.score ?? null
      );
    });
  }
  async delPending(id: string) {
    this.db.prepare("DELETE FROM pending WHERE id=?").run(id);
  }
  
  // 清理过期的 pending 请求
  async cleanupOldPending(cutoffTimestamp: number): Promise<number> {
    const result = this.db.prepare("DELETE FROM pending WHERE createdAt < ?").run(cutoffTimestamp);
    return result.changes;
  }
}

export function buildStore(): Store {
  const backend = (process.env.PERSIST_BACKEND || "redis").toLowerCase();
  if (backend === "sqlite") {
    const path = process.env.SQLITE_PATH || "./data/bot.db";
    return new SqliteStore(path);
  }
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379/0";
  return new RedisStore(url);
}
