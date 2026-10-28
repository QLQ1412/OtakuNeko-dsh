import { defineTool } from '@deepseek-ai/dsh-tools';
import { createBangumiService, createFetchRoute } from './bangumi.js';
import { createLibraryStore } from './library.js';
import { createBangumiAccount } from './account.js';
import { createPersonaStore } from './persona.js';
import { enableWorkspace, workspaceDatabasePath, workspaceEnabled, workspaceHash, workspaceIdentity } from './workspace.js';
import { createWorkspaceNetwork } from './network.js';

export const name = 'otakuneko-harness-native-plugin';
export const inject = ['tools', 'connection', 'credentials', 'systemPrompt', 'workspaceRegistry', 'agents'];

const renderText = (_args, value) => [{ type: 'text', text: value }];

export function apply(ctx) {
  const resolveWorkspace = id => workspaceIdentity(ctx.workspaceRegistry, id);
  const persona = createPersonaStore({ workspaceForSession: resolveWorkspace });
  const services = new Map();
  function forSession(id) {
    const workspaceId = resolveWorkspace(id);
    if (!services.has(workspaceId)) {
      const network = createWorkspaceNetwork(workspaceId);
      services.set(workspaceId, {
      ...createBangumiService({ fetchImpl: network.fetch }),
      ...createLibraryStore({ databasePath: workspaceDatabasePath(workspaceId) }),
      ...createBangumiAccount({ credentials: ctx.credentials, fetchImpl: network.fetch, key: `otakuneko-harness-native-plugin/w-${workspaceHash(workspaceId)}` }),
      ...persona,
      ...network,
    });
    }
    return services.get(workspaceId);
  }
  const definitions = [];
  const attached = new Map();
  function syncAgent(agent) {
    let workspaceId;
    try { workspaceId = resolveWorkspace(agent.id); } catch { return; }
    if (!workspaceEnabled(workspaceId) || attached.has(agent)) return;
    const disposers = [];
    try {
      for (const definition of definitions) {
        const execute = definition.execute;
        disposers.push(agent.ctx.tools.register({ ...definition, async execute(args, execution) {
          if (execution?.agent?.id !== agent.id || resolveWorkspace(agent.id) !== workspaceId) throw new Error('此工具只能由启用 OtakuNeko 的当前会话使用');
          return execute(args, execution);
        } }));
      }
      attached.set(agent, disposers);
    } catch (error) { for (const dispose of disposers.reverse()) dispose(); throw error; }
  }
  function activate(sessionId) {
    const workspaceId = resolveWorkspace(sessionId);
    enableWorkspace(workspaceId);
    for (const agent of ctx.agents.list()) if (agent.id === sessionId || (() => { try { return resolveWorkspace(agent.id) === workspaceId; } catch { return false; } })()) syncAgent(agent);
    return { enabled: true };
  }
  const service = { forSession, activate };
  ctx.effect(() => ctx.systemPrompt.section({ name: 'otakuneko:persona', order: 5000, text: context => persona.prompt(context?.agent?.id), interpolate: false }), 'OtakuNeko persona');
  for (const operation of ['search', 'details', 'calendar', 'collection-list', 'collection-save', 'account-status', 'account-connect', 'account-disconnect', 'persona-state', 'persona-save', 'workspace-activate', 'network-state', 'network-save', 'network-test', 'remote-collections']) {
    ctx.connection.fetch.register(createFetchRoute(service, operation));
  }
  definitions.push(defineTool({
    name: 'otakuneko_native_anime_episodes',
    description: '查询 Bangumi 动画的本篇剧集列表，支持分页；不读取或修改个人观看状态。',
    parameters: { subjectId: { type: 'number', required: true, description: 'Bangumi 条目 ID。' }, offset: { type: 'number', description: '分页偏移量，默认 0。' }, limit: { type: 'number', description: '每页 1–50 项，默认 30。' } },
    output: { schema: { type: 'string' }, render: renderText },
    async execute(args, execution) { return JSON.stringify(await forSession(execution.agent.id).episodes(args.subjectId, args.offset, args.limit, execution.signal)); },
  }));
  definitions.push(defineTool({
    name: 'otakuneko_native_search_anime',
    description: '在 Bangumi 搜索动画，返回条目 ID、名称、日期和评分。',
    parameters: {
      keyword: { type: 'string', required: true, description: '动画关键词，1 至 100 个字符。' },
      limit: { type: 'number', description: '最多返回 1 至 20 条，默认 8 条。' },
    },
    output: { schema: { type: 'string' }, render: renderText },
    async execute(args, execution) { return JSON.stringify(await forSession(execution.agent.id).search(args.keyword, args.limit, execution?.signal)); },
  }));
  definitions.push(defineTool({
    name: 'otakuneko_native_anime_details',
    description: '根据 Bangumi 条目 ID 查询动画详情。',
    parameters: { subjectId: { type: 'number', required: true, description: 'Bangumi 条目 ID，正整数。' } },
    output: { schema: { type: 'string' }, render: renderText },
    async execute(args, execution) { return JSON.stringify(await forSession(execution.agent.id).details(args.subjectId, execution?.signal)); },
  }));
  definitions.push(defineTool({
    name: 'otakuneko_native_airing_calendar',
    description: '查看 Bangumi 每周动画放送日历；结果只有星期，不包含具体放送时间。',
    parameters: {},
    output: { schema: { type: 'string' }, render: renderText },
    async execute(_args, execution) { return JSON.stringify(await forSession(execution.agent.id).calendar(execution?.signal)); },
  }));
  definitions.push(defineTool({
    name: 'otakuneko_native_list_collection',
    description: '查看本地非私密动画收藏；不会返回私密条目。',
    parameters: { limit: { type: 'number', description: '返回数量，1 至 200，默认 100。' }, offset: { type: 'number', description: '分页偏移量，默认 0。' } },
    output: { schema: { type: 'string' }, render: renderText },
    async execute(args, execution) { return JSON.stringify(forSession(execution?.agent?.id).listCollections({ limit: args.limit, offset: args.offset }).map(({ comment, tags, ...item }) => item)); },
  }));
  definitions.push(defineTool({
    name: 'otakuneko_native_search_advanced',
    description: '按关键词、Bangumi 标签、评分和放送日期筛选动画；可不填关键词，但必须提供至少一个筛选条件。日期使用 YYYY-MM-DD，不要推测用户未指定的年份。',
    parameters: {
      keyword: { type: 'string', description: '动画名称或关键词，可留空。' },
      tags: { type: 'string', description: 'Bangumi 标签，多个以英文逗号分隔，全部条件同时匹配。' },
      minRating: { type: 'number', description: '最低评分，0–10，包含边界。' },
      maxRating: { type: 'number', description: '最高评分，0–10，包含边界。' },
      startDate: { type: 'string', description: '最早放送日期，YYYY-MM-DD，包含边界。' },
      endDate: { type: 'string', description: '最晚放送日期，YYYY-MM-DD，包含边界。' },
      limit: { type: 'number', description: '返回数量 1–20，默认 10。' },
    },
    output: { schema: { type: 'string' }, render: renderText },
    async execute(args, execution) { return JSON.stringify(await forSession(execution.agent.id).advancedSearch(args, execution?.signal)); },
  }));
  for (const [toolName, description, action] of [
    ['otakuneko_native_anime_staff', '查询 Bangumi 动画条目的制作人员、公司与职务。', 'staff'],
    ['otakuneko_native_anime_cast', '查询 Bangumi 动画条目的角色、声优和角色关系。', 'cast'],
  ]) {
    definitions.push(defineTool({
      name: toolName, description,
      parameters: { subjectId: { type: 'number', required: true, description: 'Bangumi 条目 ID，正整数。' } },
      output: { schema: { type: 'string' }, render: renderText },
      async execute(args, execution) { return JSON.stringify(await forSession(execution.agent.id)[action](args.subjectId, execution?.signal)); },
    }));
  }
  ctx.on('agent/created', ({ agent }) => { try { syncAgent(agent); } catch (error) { ctx.logger.warn('OtakuNeko agent tools could not be registered'); } });
  ctx.on('agent/disposed', ({ agent }) => { attached.delete(agent); });
  ctx.effect(() => {
    for (const agent of ctx.agents.list()) { try { syncAgent(agent); } catch { ctx.logger.warn('OtakuNeko agent tools could not be registered'); } }
    return () => { for (const disposers of attached.values()) for (const dispose of disposers.reverse()) dispose(); attached.clear(); for (const scoped of services.values()) scoped.dispose(); services.clear(); };
  }, 'OtakuNeko scoped tools');
}
