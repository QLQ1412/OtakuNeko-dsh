# OtakuNeko Harness 原生插件（开发版）

这是 [OtakuNeko](https://github.com/ShowayLiao/OtakuNeko) 的 DeepSeek Harness 原生插件，当前面向 Harness Desktop `0.2.1-rc.3`。插件仍处于开发和验收阶段，计划见 [开发计划](docs/development-plan.md)。

插件提供 Bangumi 动画搜索、详情和每周放送日历，以及本地收藏。右侧栏 Guide 中的「OtakuNeko 番组」可打开原生界面：搜索条目并打开详情，选择「保存到本地收藏」，再在「收藏」里修改状态、观看进度、评分、标签、备注和私密设置。Agent 可使用 `otakuneko_native_search_anime`、`otakuneko_native_anime_details`、`otakuneko_native_airing_calendar` 和 `otakuneko_native_list_collection`。收藏查询工具不返回私密条目、备注和标签。界面和工具共用 Host 服务，通过 Harness Connection 的认证 RPC 通信，不启动 OtakuNeko 独立前后端。

Agent 还可使用 `otakuneko_native_search_advanced` 按标签、评分和放送日期筛选，使用 `otakuneko_native_anime_staff` 和 `otakuneko_native_anime_cast` 查询制作人员与角色声优。高级搜索不自动放宽条件；年份不明确时应先向用户确认。公开 Bangumi API 的数据可能不完整，制作人员与角色列表最多各返回 40 项，并标明是否截断。观众短评/长评、用户偏好画像及旧记忆迁移尚未实现。

Agent 可通过 `otakuneko_native_anime_episodes` 分页查询条目的正片剧集。连接账号后，右侧栏「Bangumi 收藏」可分页查看该账号的在线动画收藏及进度；在线收藏仅供本人在界面查看，不作为 Agent 工具数据，也不会自动导入或写回本地收藏。

右侧栏「人设」可为当前会话选择三个预设或编辑一份自定义人设（名称、核心身份、语气、行为准则），默认关闭。启用后仅在当前会话的后续模型请求中添加提示词片段；选择关闭可停止注入。设置按工作区和会话 ID 保存在 `DSH_HOME/otakuneko-native/personas.sqlite3`，旧版全局人设数据保留但不会自动启用。当前不支持多份自定义角色或导入旧人设，温度和模型仍由 Harness 管理。

目标版本为 Harness Desktop 0.2.1-rc.3。「账号」页面可输入 Bangumi [个人访问令牌](https://next.bgm.tv/demo/access-token)，插件验证 `/v0/me` 成功后交由 Harness 凭据服务保存；页面可以删除本地凭据，但不会撤销 Bangumi 侧令牌。默认 Harness 本地凭据文件可由同一操作系统用户及其 Agent 进程读取，不应视为对 Agent 的隔离。显示的连接状态表示此前验证并保存成功，不保证令牌当前仍有效。OAuth 授权码登录、云端收藏同步尚未实现。

在工作区会话中打开 OtakuNeko 侧栏会为该工作区启用插件工具；各工作区分别存储收藏、Bangumi 凭据和连接设置。旧版共享收藏与凭据保留，但不会自动导入新工作区，需要重新连接账号；旧收藏迁移尚未实现。人设按工作区与会话隔离。日历由 Bangumi 公开接口提供，仅包含星期，不代表具体放送时间。个性化时间表和删除收藏尚未实现；本地收藏不会自动同步 Bangumi。

在「连接」页可为当前工作区设置本机 HTTP 代理，例如 `http://127.0.0.1:7890`，保存后可测试 Bangumi 连接；留空时使用 Harness 默认网络路径。此设置不修改系统或其他插件代理。插件请求使用正常 TLS 证书验证，仅支持不带账号密码的本机 HTTP 代理。

开发构建：

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm pack:plugin
```

生成的 `dist/otakuneko-harness-native-plugin-0.2.0-alpha.12.tgz` 可用于测试 profile 安装。该开发包与之前自包含原型使用不同插件名和工具名，两个包可以独立管理。Desktop 界面和实际对话中的工作区工具隔离仍需验收。

构建完成后，在对应的 Harness profile 中安装生成的 tgz（例如 Windows Desktop）：

```powershell
dsh plugin --profile desktop add .\dist\otakuneko-harness-native-plugin-0.2.0-alpha.12.tgz
```

然后重新加载 Harness，在目标工作区打开右侧栏 Guide 中的「OtakuNeko 番组」。如 `dsh` 不在 PATH 中，请使用 Harness 安装目录下的 CLI 可执行文件。插件安装包包含其所需的打包依赖，不需要单独运行 OtakuNeko 服务。

本仓库尚未指定源代码开源许可证。打包使用的 undici 许可见 [UNDICI-LICENSE](UNDICI-LICENSE)。
