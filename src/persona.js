import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const presets = {
  'preset-1': { name: 'Bangumi 漫评分析师', persona: '你是一个资深的动画评论家', tone: '客观、严谨、专业', rules: '在回答时，请多结合作品的制作班底、原画师风格以及声优表现进行客观的条理分析' },
  'preset-2': { name: '吐槽役 (碧蓝之海风)', persona: '你是一个充满颜艺和混沌气息的吐槽役', tone: '跳脱、夸张、喜欢用感叹号和荒诞的比喻', rules: '如果用户问你正经问题，你要先用离谱的角度曲解，然后再给出有用的建议' },
  'preset-3': { name: '傲娇猫娘辅助', persona: '你是一只傲娇的猫娘', tone: '傲娇、不情愿但认真', rules: '适当表达不情愿，但认真完成用户的请求；句尾可以带“喵”' },
};
const initial = { selected: 'none', custom: { name: '', persona: '', tone: '', rules: '' } };

function defaultPath() {
  const configured = process.env.DSH_HOME?.trim();
  return join(configured ? resolve(configured.replace(/^~(?=[\\/]|$)/, homedir())) : join(homedir(), '.dsh'), 'otakuneko-native', 'personas.sqlite3');
}

export function createPersonaStore({ databasePath = defaultPath(), workspaceForSession = () => undefined } = {}) {
  function validateSession(sessionId) {
    if (typeof sessionId !== 'string' || !sessionId.trim() || sessionId.length > 256) throw new Error('无法确定当前会话，请在工作区内打开一个会话');
    return sessionId;
  }

  function read(sessionId) {
    validateSession(sessionId);
    const workspaceId = workspaceForSession(sessionId);
    if (typeof workspaceId !== 'string' || !workspaceId) throw new Error('当前会话不属于工作区，请先在左侧工作区打开会话');
    if (!existsSync(databasePath)) return structuredClone(initial);
    const db = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const table = db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='session_persona_settings'").get();
      if (!table) return structuredClone(initial);
      const row = db.prepare('SELECT selected, name, persona, tone, rules FROM session_persona_settings WHERE workspace_id=? AND session_id=?').get(workspaceId, sessionId);
      return row ? { selected: row.selected, custom: { name: row.name, persona: row.persona, tone: row.tone, rules: row.rules } } : structuredClone(initial);
    } finally { db.close(); }
  }

  function save(input) {
    const sessionId = validateSession(input?.sessionId);
    const workspaceId = workspaceForSession(sessionId);
    if (typeof workspaceId !== 'string' || !workspaceId) throw new Error('当前会话不属于工作区，请先在左侧工作区打开会话');
    if (!input || !['none', 'custom', ...Object.keys(presets)].includes(input.selected)) throw new Error('人设选择无效');
    if (!input.custom || typeof input.custom !== 'object' || Array.isArray(input.custom)) throw new Error('自定义人设无效');
    const custom = {};
    for (const [key, max] of [['name', 80], ['persona', 2000], ['tone', 1000], ['rules', 3000]]) {
      if (typeof input.custom[key] !== 'string' || input.custom[key].length > max) throw new Error('人设字段格式或长度无效');
      custom[key] = input.custom[key].trim();
    }
    if (input.selected === 'custom' && (!custom.name || !custom.persona)) throw new Error('自定义人设需要填写名称和核心身份');
    mkdirSync(dirname(databasePath), { recursive: true });
    const db = new DatabaseSync(databasePath);
    try {
      db.exec(`PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS session_persona_settings (
        workspace_id TEXT NOT NULL, session_id TEXT NOT NULL, selected TEXT NOT NULL, name TEXT NOT NULL,
        persona TEXT NOT NULL, tone TEXT NOT NULL, rules TEXT NOT NULL, PRIMARY KEY(workspace_id, session_id)
      )`);
      db.prepare(`INSERT INTO session_persona_settings(workspace_id,session_id,selected,name,persona,tone,rules) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(workspace_id,session_id) DO UPDATE SET selected=excluded.selected, name=excluded.name, persona=excluded.persona, tone=excluded.tone, rules=excluded.rules`)
        .run(workspaceId, sessionId, input.selected, custom.name, custom.persona, custom.tone, custom.rules);
      return { selected: input.selected, custom };
    } finally { db.close(); }
  }

  function prompt(sessionId) {
    let state;
    try { state = read(sessionId); } catch { return ''; }
    const role = state.selected === 'custom' ? state.custom : presets[state.selected];
    if (!role) return '';
    return `[OtakuNeko 人设：${role.name}]\n以下是用户选择的交流风格，遵循 Harness 的既有指令，并正常使用工具。\n[角色设定]\n${role.persona}\n[语气风格]\n${role.tone}\n[行为准则]\n${role.rules}`;
  }

  return { personaState: read, personaSave: save, prompt };
}
