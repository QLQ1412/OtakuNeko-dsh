# OtakuNeko Harness 原生插件（开发版）

这是 [OtakuNeko](https://github.com/ShowayLiao/OtakuNeko) 的 DeepSeek Harness 原生插件，当前面向 Harness Desktop `0.2.1-rc.3`。插件仍处于开发和验收阶段，计划见 [开发计划](docs/development-plan.md)。

插件提供 Bangumi 动画搜索、详情和每周放送日历，以及本地收藏。右侧栏 Guide 中的「OtakuNeko 番组」可打开原生界面：搜索条目并打开详情，选择「保存到本地收藏」，再在「收藏」里修改状态、观看进度、评分、标签、备注和私密设置。Agent 可使用 `otakuneko_native_search_anime`、`otakuneko_native_anime_details`、`otakuneko_native_airing_calendar` 和 `otakuneko_native_list_collection`。收藏查询工具不返回私密条目、备注和标签。界面和工具共用 Host 服务，通过 Harness Connection 的认证 RPC 通信，不启动 OtakuNeko 独立前后端。

搜索栏可选择「番剧」「角色」「声优」或「制作人员/公司」。后三种先搜索匹配对象，再选择对象查看关联动画；声优结果显示角色，制作人员结果显示职务。候选和关联动画均支持分页，关联信息可能因 Bangumi 数据不完整而缺失。Agent 可使用 `otakuneko_native_search_entities` 和 `otakuneko_native_entity_anime` 完成同样的查询。

在已启用 OtakuNeko 的会话中，Agent 查询动画、角色、声优或制作信息时，搜索页会同步显示该会话的查询结果和 Bangumi 图片；动画详情也显示封面。需要打开右侧 OtakuNeko 搜索页，其他页面不会被自动切走。联动依赖 Agent 实际调用查询工具，结果不会跨会话共享，后台重启后不会保留；图片由客户端访问 Bangumi 图片服务，受客户端网络环境影响。

动画详情提供 B 站搜索入口，以及按 Bangumi ID 查询的观看平台作品页。平台数据来自 [bangumi-data](https://github.com/bangumi-data/bangumi-data)，以 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 提供；插件按需下载并缓存 24 小时，网络失败时使用旧缓存或只显示搜索入口。数据可能过期，平台页面不保证当前地区可播放或不需要会员；搜索入口不代表已确认匹配。Agent 可使用 `otakuneko_native_watch_links` 查询相同信息。

Agent 还可使用 `otakuneko_native_search_advanced` 按标签、评分和放送日期筛选，使用 `otakuneko_native_anime_staff` 和 `otakuneko_native_anime_cast` 查询制作人员与角色声优。高级搜索不自动放宽条件；年份不明确时应先向用户确认。公开 Bangumi API 的数据可能不完整，制作人员与角色列表最多各返回 40 项，并标明是否截断。观众短评/长评、用户偏好画像及旧记忆迁移尚未实现。

Agent 可通过 `otakuneko_native_anime_episodes` 分页查询条目的正片剧集。连接账号后，右侧栏「Bangumi 收藏」可分页查看在线动画收藏，并手动选择当前页的条目导入本地；已有条目会跳过，保留私密标记，不导入备注或标签。在线收藏不会自动同步或写回 Bangumi，也不直接提供给 Agent。

「收藏统计」展示共享本地收藏的状态数量，侧栏包含私密条目；Agent 的统计工具只包含非私密条目。统计不代表 Bangumi 全部收藏。

会话记忆的侧栏入口已移除；原有数据和 Agent 记忆工具仍保留。记忆以明文存储在本机插件数据库中，不应保存密码或令牌；Agent 按需调用工具，记忆不会自动提取、注入或跨会话共享。

右侧栏「追番时间表」可手动添加、编辑和删除每周观看安排，并可标记私密；Agent 可通过 `otakuneko_native_list_schedule` 查询非私密安排。时间是填写时的本地时钟时间，不自动转换时区，也不是 Bangumi 放送时间。安排按工作区保存；Bangumi 同步、自动关联收藏及旧时间表导入尚未实现。

「本地收藏」可按名称、状态筛选，删除前需要确认，也可从收藏带入名称和私密标记来创建观看安排；两者此后独立保存。Agent 可应用户明确要求修改非私密本地收藏的状态、进度和评分。时间表可导出为每周重复的 ICS 文件（包含私密安排，使用浮动本地时间）；实际导入日历后的显示取决于目标日历的时区设置。

右侧栏的「收藏」栏目包含「本地收藏」「收藏统计」和「Bangumi 收藏」三个分类。统计针对本地收藏；Bangumi 收藏需要先在「账号」连接个人令牌，远程条目可由用户选择导入本地。

本包附带 `otakuneko-watch` 和 `otakuneko-discover` 两份 [Agent Skills](skills/)。在目标工作区打开插件侧栏后，插件自动向该工作区的会话注册 Skill，无需复制文件；会话结束、插件卸载，或在下一次模型请求前检测到会话离开该工作区时清理注册。Harness 的 Skill 注册服务和模型侧 Skill 工具需已启用，Desktop 中实际发现和调用仍待验收。Skill 提供工作流指导，实际数据和操作仍由本插件工具执行。

这两份 Skill 参考了 bgm-cli 面向用户的追番工作流，但使用本插件的原生工具；不包含 bgm-cli 项目的原始 Skill 或 CLI，也不提供它的社区操作和写入 Bangumi 能力。bgm-cli 项目使用 AGPL-3.0，直接分发其内容需要另行处理许可及 CLI 依赖。

右侧栏「人设」可为当前会话选择三个预设或编辑一份自定义人设（名称、核心身份、语气、行为准则），默认关闭。启用后仅在当前会话的后续模型请求中添加提示词片段；选择关闭可停止注入。设置按工作区和会话 ID 保存在 `DSH_HOME/otakuneko-native/personas.sqlite3`，旧版全局人设数据保留但不会自动启用。当前不支持多份自定义角色或导入旧人设，温度和模型仍由 Harness 管理。

目标版本为 Harness Desktop 0.2.1-rc.3。「账号」页面可输入 Bangumi [个人访问令牌](https://next.bgm.tv/demo/access-token)，插件验证 `/v0/me` 成功后交由 Harness 凭据服务保存；页面可以删除本地凭据，但不会撤销 Bangumi 侧令牌。默认 Harness 本地凭据文件可由同一操作系统用户及其 Agent 进程读取，不应视为对 Agent 的隔离。显示的连接状态表示此前验证并保存成功，不保证令牌当前仍有效。OAuth 授权码登录、云端收藏同步尚未实现。

在工作区会话中打开 OtakuNeko 侧栏会为该工作区启用插件工具；所有已启用的 OtakuNeko 工作区共享一份本地收藏数据库，时间表、Bangumi 凭据和连接设置仍按工作区保存，人设和记忆仍按工作区及会话隔离。旧版工作区收藏可在「本地收藏」点击「预览当前工作区的旧收藏」，检查新增和冲突数量后确认合并；同一来源和 ID 的已有共享收藏会被跳过，不覆盖原有内容，旧数据库保持不变。多个工作区的旧收藏需分别预览并确认合并；不会自动合并以前的全局原型数据库或原 OtakuNeko 应用数据库。日历由 Bangumi 公开接口提供，仅包含星期，不代表具体放送时间。本地收藏不会自动同步 Bangumi。

共享收藏数据库位于 `DSH_HOME/otakuneko-native/shared-library.sqlite3`；`DSH_HOME` 未设置时默认为用户目录下的 `.dsh`。共用该 `DSH_HOME` 的已启用工作区共享收藏，不同 `DSH_HOME` 不自动共享。

在「连接」页可为当前工作区设置本机 HTTP 代理，例如 `http://127.0.0.1:7890`，保存后可测试 Bangumi 连接；留空时使用 Harness 默认网络路径。此设置不修改系统或其他插件代理。插件请求使用正常 TLS 证书验证，仅支持不带账号密码的本机 HTTP 代理。

开发构建：

```powershell
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm pack:plugin
```

生成的 `dist/otakuneko-harness-native-plugin-0.2.0-alpha.23.tgz` 可用于测试 profile 安装。该开发包与之前自包含原型使用不同插件名和工具名，两个包可以独立管理。Desktop 界面和实际对话中的工作区工具隔离仍需验收。

构建完成后，在对应的 Harness profile 中安装生成的 tgz（例如 Windows Desktop）：

```powershell
dsh plugin --profile desktop add .\dist\otakuneko-harness-native-plugin-0.2.0-alpha.23.tgz
```

然后重新加载 Harness，在目标工作区打开右侧栏 Guide 中的「OtakuNeko 番组」。如 `dsh` 不在 PATH 中，请使用 Harness 安装目录下的 CLI 可执行文件。插件安装包包含其所需的打包依赖，不需要单独运行 OtakuNeko 服务。

本项目采用 [MIT 许可证](LICENSE)。打包使用的 undici 许可见 [UNDICI-LICENSE](UNDICI-LICENSE)。
