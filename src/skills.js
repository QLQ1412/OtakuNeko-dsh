import { readFileSync } from 'node:fs';

const definitions = [
  { name: 'otakuneko-watch', description: '使用 OtakuNeko 工具查询和管理本地追番收藏、观看进度及每周安排。' },
  { name: 'otakuneko-discover', description: '使用 OtakuNeko 与 Bangumi 的工具搜索动画、查看详情并结合本地收藏回答。' },
];

export function registerSessionSkills(agent, isCurrent) {
  if (typeof agent.ctx.inject !== 'function') return null;
  return agent.ctx.inject(['skills'], skillCtx => {
    if (!isCurrent()) return;
    for (const skill of definitions) {
      const raw = readFileSync(new URL(`../skills/${skill.name}/SKILL.md`, import.meta.url), 'utf8');
      const content = raw.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n/, '').trim();
      skillCtx.skills.register({ ...skill, source: 'runtime', content });
    }
  });
}
