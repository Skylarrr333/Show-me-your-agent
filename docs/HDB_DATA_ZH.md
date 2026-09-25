# HDB 数据与模拟找房

首页是面向买家的模拟找房体验：填写预算、面积、区域和户型，补充自然语言需求，浏览房源卡片、查看详情、收藏并对比。收藏仅保留在当前页面会话中。原有工作台组件保留在代码中，首页不再切换到另一套工作台。

`POST /api/homes` 基于真实 Kaggle 数据生成代表性模拟房源：按区域、楼号、街道、户型、楼层范围、面积、房屋模型和租约起始年分组，取月份最新的一条记录；同月以源行号作确定性选择。**先合并取最新价格，再应用预算条件**，避免用较早的低价重复成交冒充不同房源。此分组不等于真实单位去重，因为原始数据没有单位编号。

卡片中的 Simulation price 直接采用该记录的成交价，作为模拟价格，不是实时挂牌价或模型估价。楼层、面积等来自参考记录，剩余租约也对应参考日期。详情折叠展示价格月份和源 CSV 行号。页面明确标记模拟情境，不提供虚构卖家或真实预约承诺。首页不再提供交易月份筛选或交易表格。`/api/resales` 仍保留为历史记录查询接口。

## 当前快照

- 来源：https://www.kaggle.com/datasets/yingghui233/hdb-resale-pricing-singapore
- 版本：1；文件：`INET4061projectdata(housing_price).csv`
- 228,225 条记录，26 个 town；月份范围 2017-01 至 2026-04，末月可能不完整。
- 原始 CSV SHA256：`7b92e29f72ba4167e298e9e1cc1124839b025ebbfa3652622fbeb6eb966189af`
- Kaggle 元数据许可为 Unknown；当前保留本地研究副本，不将原始数据提交到 Git，也未公开部署该数据。

数据包含月份、区域、HDB 户型、楼号、街道、楼层范围、平方米面积、房屋模型、租约起始年份、剩余租约和成交价。没有当前在售状态、卧室数量、图片或通勤数据。HDB 的 4 ROOM 不能直接当作四卧室。源文件没有唯一成交编号，重复行原样保留，详情中的 CSV 行号用于追溯来源。

## 在另一台机器上导入

从上述 Kaggle 页面下载并解压 CSV。在项目根目录执行（Python 3 标准库，无需第三方包）：

```sh
python3 scripts/import-kaggle-hdb.py '/absolute/path/INET4061projectdata(housing_price).csv'
npm run dev:next
```

默认生成 `.propmatch-data/hdb-resales.sqlite`；也可用 `--output /absolute/path/hdb.sqlite` 指定输出，再在 `.env.local` 设置 `HDB_RESALE_DB=/absolute/path/hdb.sqlite`。导入会校验字段、月份、数值；成功后原子替换数据库，失败不会覆盖旧快照。该导入器对应上述版本的字段和来源信息，更换来源或版本时应同步更新元数据。SQLite 运行需要 Node >=22.13。

当前机器原始下载与 CSV 位于 `.propmatch-data/kaggle/`，SQLite 已完成导入。这些文件均被 Git 忽略。

## 查询与界面

`GET /api/resales` 返回来源元数据、可选区域和模型配置状态；`POST /api/resales` 接收 `filters` 与可选 `message`。例如：

```json
{"filters":{"town":"CLEMENTI","flatType":"4 ROOM","minPrice":400000,"maxPrice":800000,"minArea":80,"maxArea":120,"fromMonth":"2024-01","sort":"newest","page":1},"message":""}
```

范围条件包含边界；所有条件组合生效。面积单位为平方米、价格为 SGD，街道按文字片段匹配。查询使用绑定参数和排序白名单，每页 20 条，返回总数量和实际应用的筛选条件。详情展示原始字段。库不可用时返回 503，不退回合成数据。

流程：表单/补充文字 → 校验及语言提取 → 确定的筛选条件 → SQLite 查询 → 真实成交表格。数值筛选无需大模型。语言提取复用现有 provider，表单已填值优先；模型不生成成交记录，也不执行自由 SQL。

## 大模型配置

当前本地已配置 gateway，并验证过真实中文需求提取；密钥仅保存在忽略提交的 `.env.local`。未配置凭据的其他安装默认 demo，仅作规则提取（例如 `4 ROOM in Clementi, budget SGD 800k`）。街道及准确的面积范围建议使用表单；不支持的通勤等偏好会提示无法验证。

现有适配器支持 organiser gateway、DeepSeek 和 AWS Bedrock。按 `.env.example` 填写 `.env.local`，选择对应 `LLM_MODE` 并重启服务。密钥只放服务器环境，切勿提交到 Git。

- Gateway：`LLM_MODE=gateway`、`LLM_GATEWAY_URL`、`LLM_GATEWAY_API_KEY`、`LLM_MODEL`。该适配器为 Ollama `/api/chat` 协议。
- DeepSeek：`LLM_MODE=deepseek`、`DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`。
- Bedrock：`LLM_MODE=bedrock`、`AWS_REGION`、`AWS_BEARER_TOKEN_BEDROCK`、`BEDROCK_MODEL_ID`。

如使用其他服务，需要提供服务名、API base URL、模型名和协议，才能确认是否需新适配器。没有凭据时不能验证真实模型调用。调用失败会显示错误，可清空补充文字继续数值检索。

## 部署范围

本次实际数据已接入本地 Next/Node 服务。Cloudflare 构建提供 D1 读取适配器，但尚未导入线上 D1 数据，也未发布线上版本；需要另行确认数据授权并执行部署/导入。不要把本地 SQLite 就绪当作线上 D1 已就绪。

## 验证

```sh
npm run lint
npm run typecheck
npm test
npm run build:next
```

`tests/resale.test.ts` 用独立小型测试库验证筛选边界、稳定分页、SQL 参数安全、输入校验、结构化优先及无模型搜索；真实快照另通过本地 API 与独立 SQL 计数核对。
