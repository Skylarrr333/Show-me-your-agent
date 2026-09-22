# 本机运行、密钥与公开数据

本轮方案：**主办方 Claude 网关 + 政府 HDB 历史成交证据 + 明确标注的模拟在售库存与变更事件**。不需要 GPU 或本地模型。DeepSeek 配置保留，可通过 LLM_MODE 显式选择；不会在网关失败时偷偷切换。官方网关测试状态见 [验证报告](GATEWAY_VALIDATION_2026-09-22.md)。

## 1. 你的密钥放在哪里

新克隆的仓库不包含密钥。先在项目根目录运行 `cp .env.example .env.local` 和 `chmod 600 .env.local`，再自行填写团队凭据。`.gitignore` 和 `.dockerignore` 已排除环境文件。开发环境中的实际 API 调用已验证，但其他成员仍需配置自己的运行环境。不要上传密钥文件或把密钥发到截图、聊天中。

```env
LLM_MODE=gateway
LLM_GATEWAY_URL=https://api.softwaresystems.app
LLM_GATEWAY_API_KEY=在本机填写团队实际密钥
LLM_MODEL=global.anthropic.claude-sonnet-4-5-20250929-v1:0
DATA_MODE=synthetic
```

主办方提供 API 网关，不能把团队 key 填入 direct Bedrock 的 AWS_BEARER_TOKEN_BEDROCK。网关使用 HTTPS /api/chat 和 X-API-Key；配置来自团队邮件，示例参考 [Starter Kit](https://github.com/kenken64/ShowMeYourAgent-Starter-Kit)。服务只在服务器端使用 key，浏览器只拿到推荐和必要的统计。

需要使用个人 DeepSeek 时，只把 LLM_MODE 改成 deepseek，保留已有的 DEEPSEEK_API_KEY、DEEPSEEK_MODEL 和 DEEPSEEK_BASE_URL；它与团队 key 是两套不同凭据。

主办方 Slack 说明：约 USD 100 为 Lightsail 与 LLM/API 的共享额度，只用于测试、托管与推理，**不得在比赛平台训练或微调模型**。

## 2. 如何启动

首次获取项目：

```bash
git clone https://github.com/Skylarrr333/Show-me-your-agent.git
cd Show-me-your-agent
cp .env.example .env.local
chmod 600 .env.local
```

按上文配置模型后，在项目目录运行：

```bash
npm ci
npm run check:setup
npm exec -- next dev --hostname 127.0.0.1
```

打开 <http://127.0.0.1:3000>。`check:setup` 只报告配置是否存在，绝不打印密钥，也不发送模型请求。

模型故障时如需离线排练，用以下命令启动，并向评委说明是确定性的演示模式：

```bash
LLM_MODE=demo npm exec -- next dev --hostname 127.0.0.1
```

页面右上角 `CLAUDE · AWS GATEWAY` 表示选择官方网关。成功调用的证据在右侧 `gateway_model_call()` 事件中，包括模型名、耗时和 token 数。仅显示模式名不能证明调用成功。

## 3. 公开数据的真实边界

- 来源：[HDB 历史转售成交数据](https://data.gov.sg/datasets/d_8b84c4ee58e3cfc0ece0d773c8ca6abc/view)，机构为 Housing & Development Board。
- 本次快照：2026 年 6 月 2,125 条、7 月 2,649 条、8 月 2,521 条，共 7,295 条。
- 保存路径：`data/hdb-transactions.json`，含查询 URL、抓取时间、月份覆盖、许可证链接和记录 SHA-256。
- 数据提供历史成交月份、town、flat type、面积、成交价格、剩余年限等信息。**不提供当前挂牌、可售状态、实际卧室数、交通时间或学校距离。**
- 页面按买家预算、面积和区域筛选历史记录，显示筛选样本中位数及原始记录。中位数不代表市场整体估值，更不能用于为 Condo / Landed 定价。
- 来源声明与许可证：[Singapore Open Data Licence](https://data.gov.sg/open-data-licence)。数据说明和限制见 [官方数据页面](https://data.gov.sg/datasets?resultId=d_8b84c4ee58e3cfc0ece0d773c8ca6abc)。

更新官方快照：

```bash
npm run data:public
```

脚本取运行日前三个日历月，验证响应条数等于官方该月总数，再原子替换文件。API 失败或截断会停止，保留原快照。生产包中的公开快照需要重新构建和发布后才能更新；这不是外部房源实时订阅。

## 4. 房源变化演示

1. 点 `Load Demo Scenario`，等待实际模型运行完成。
2. 查看顶部官方 HDB 证据和下方明确标注的模拟房源。
3. 点 `Approve shortlist`。
4. 点 `Simulate top listing withdrawn`。原第一名被移除，旧批准撤销，系统生成新的候选名单。
5. 点 `Simulate price above budget`。新的第一名被模拟为超预算，系统再次过滤和重新推荐。
6. 打开 trace 中 `Source change caused a fresh recommendation decision`，展示修改前后价格／状态、候选 ID 和撤销批准的记录。

模拟事件只影响当前浏览器会话，不会修改其他人的会话或政府公开数据。重置会话恢复原模拟库存。来源刷新沿用现有买家画像，不再次付费调用模型。

`Recheck sources` 为手动复查。勾选 `Watch while this page is open · every 30s` 会在页面打开且可见时每 30 秒复查已配置的数据源；关页后不会运行。数据未改变时保留原批准，不创建新的运行，也不调用大模型。这不是全天候监控服务。

## 5. 后续取得真实在售数据时

已实现可替换的文件 provider，当前没有加载真实在售库存。每条记录必须含来源链接、源站 ID 和 24 小时内实际核实的 `checkedAt`，未知 MRT 时间用 `null`，quietScore 用 `null`。没有当前路线证据时不会编造通勤时间；如果它属于硬要求，该候选不能通过。

依据 `providers/evidence.ts` 中的 `EvidenceDatasetSchema` 准备 JSON 后：

```bash
npm run data:import -- /absolute/path/evidence.json --validate-only
npm run data:import -- /absolute/path/evidence.json
```

默认写入 `.propmatch-data/listings.json`。在本机 `.env.local` 设置 `DATA_MODE=file` 和 `LISTING_DATA_FILE` 的**绝对路径**，重启服务。此模式面向 Node / Docker 可持久化文件部署；Workers 上仍使用 synthetic 模式，需另写持久化真实数据适配器。

真实来源由你提供／导入，系统校验结构和时间，不代表已经独立认证源站真实性。不能把本次 HDB 历史记录直接填成“available”。

## 6. 验证命令

```bash
npm run lint
npm run typecheck
npm test
npm run eval
npm run eval:readiness
npm run eval:live -- --full --workflow
npm run eval:live -- --chinese
npm run build:next
```

`eval:live` 使用你配置的 API，会消耗 token。默认 smoke 约两次请求；完整英文集最多 8 次、中文集最多 4 次，没有自动重试循环。官方网关报告为 `evals/gateway-live-results.json` 和 `evals/gateway-live-chinese-results.json`；原 DeepSeek 报告保留在无 gateway- 前缀的文件中。`--workflow` 额外验证批准、模拟下架、模拟涨价和撤销批准，不额外调用模型。它们只使用编写好的虚构买家案例。没有 key 时报告 `not_run`，绝不以 demo 结果代替。

## 7. 比赛交付待办

1. Lightsail 已部署并完成公网验证：[打开演示站](https://propmatch-18-142-198-52.sslip.io/)。网站访问密码由团队私下提供；见 [部署证据](DEPLOYMENT.md)。
2. 团队按 9 月 27 日完成提交；投影片初赛截止为 9 月 28 日 09:00，以 Slack 最新公告为准。指定 Slack 频道提交团队代码、项目名、GitHub URL、视频 URL／MP4 下载地址、PDF write-up 和部署证据／URL。确认视频 30mins 是上限还是指定时长，以及 PDF 页数限制。
3. 让至少两位队友用陌生需求试跑，记录用时、错误和是否接受推荐；正式录制有数据边界说明的演示视频。

真实模型接入和 Lightsail 公网部署都已完成验证。HTTPS、访问密码、房源变化后的重新推荐以及容器重启后的会话保留均已验证；比赛视频、最终 PDF 和 Slack 提交仍需完成。API 密钥仅在服务器私有配置中，未进入 GitHub。

技术接口参考：[DeepSeek JSON Output](https://api-docs.deepseek.com/guides/json_mode/)、[data.gov.sg 查询 API](https://guide.data.gov.sg/developer-guide/dataset-apis/search-and-filter-within-dataset)、[Kiro 用途与额度](https://kiro.dev/pricing/)。
