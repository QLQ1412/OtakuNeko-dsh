---
name: otakuneko-watch
description: 使用 OtakuNeko 工具查询和管理本地追番收藏、观看进度及每周安排。
---

# 追番管理

用户询问追番进度或观看计划时，优先使用当前会话可用的 OtakuNeko 工具。若工具不存在，说明需要在目标工作区启用 OtakuNeko，不要自行读取其他工作区的数据。

- 查询收藏使用 `otakuneko_native_list_collection`，可按名称或状态筛选；分页结果不是完整列表。
- 查询每周观看安排使用 `otakuneko_native_list_schedule`。时间是用户填写的当地时钟时间，不代表实际放送时间；Bangumi 周放送日历另用 `otakuneko_native_airing_calendar` 查询，日历只包含星期。
- 只有在用户明确要求时，使用 `otakuneko_native_update_collection` 修改已存在的非私密本地收藏。先查清目标条目及用户指定的进度、状态或评分；名称不明确时询问，不要猜测。修改后报告结果，说明不会自动写回 Bangumi。
- 私密收藏和私密安排不会通过 Agent 工具提供。不要推断未返回的条目不存在，也不要声称本地收藏和 Bangumi 账号已经同步。
