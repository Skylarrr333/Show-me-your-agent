# 主办方 Claude 网关验证（2026-09-22）

## 接口与配置

- 目的地址：团队邮件提供的 HTTPS 网关；项目请求 `/api/chat`，通过 `X-API-Key` 鉴权。
- 模型 ID：`global.anthropic.claude-sonnet-4-5-20250929-v1:0`，来自团队邮件。网关内部路由由主办方管理。
- `LLM_MODE=gateway` 与 direct Bedrock 的 `LLM_MODE=bedrock` 是不同协议。DeepSeek 保留为显式可选提供方，不自动回退。
- 密钥仅存在本机忽略文件 `.env.local`，权限 600；不写入此文档、评测报告或浏览器。
- API 调用成功不代表已取得 Lightsail 控制台权限或已完成云部署。

## 已观察到的兼容问题与处理

最初按单个 JSON 对象读取的尝试失败：网关在结果后追加文字、重复对象，有时在结束标记为 stop 的情况下仍返回不能整体解析的内容。OpenAI 兼容路线也观察到类似现象，最终保留 Starter Kit 的 Ollama 路线。

按照 Starter Kit 的已知兼容说明，把任务格式要求放在用户消息中。响应使用明确的 `<propmatch_result>` 数据边界，只接受完整 JSON；每个结构化候选仍须通过既有字段校验。同一响应中的多份结果必须具有相同的规范化买家状态及澄清状态／工具集合，摘要措辞和程序重新生成的描述列表不参与决策相等判断。任何状态冲突、截断的数据边界、非法字段或非白名单工具均停止。

边界之外的模型文字被丢弃，不显示、不当作房源证据、不执行；trace 只记录丢弃字符数。请求限制为 7,800 字节，60 秒超时，无自动重试。明确采用购房总预算语义，低预算由搜索工具判断是否无解，不自行改成租金或更高预算。工具计划要求名称字符串数组和有长度上限的摘要。

## 最终保存的验证结果

| 检查 | 实际结果 |
|---|---|
| ESLint / TypeScript | 通过 |
| 单元与工作流测试 | 47 / 47 通过 |
| 确定性评测 | 15 / 15 通过 |
| 网关英文 live 场景 | 6 / 6 通过 |
| 网关中文 live 场景 | 2 / 2 通过 |
| 批准 → 模拟下架 → 模拟涨价 | 通过；保留画像、撤销批准并替换候选；刷新阶段零模型调用 |
| 错误密钥真实请求 | HTTP 403 拒绝 |
| Next.js 生产构建 | 通过 |
| 浏览器生产页面 | 实际网关调用后出现 8 个候选、3 个待审核选项，显示 CLAUDE · AWS GATEWAY 及 2 次 gateway_model_call 记录 |
| 当前本机默认提供方 | gateway；云端模型推理，本机运行应用 |
| AWS Lightsail / 公网部署 | 未执行 |

最终两份 live 报告包含 **12 次成功模型调用、132327 个输入 token、3089 个输出 token**；硬约束违规 0。8 个场景中的注入案例在本机阻断，没有发给模型。这些计数不包含诊断、修复前失败尝试或浏览器排练，不是整个账户消耗。

开发时实际遇到的失败还包括：多份结果摘要／派生描述不同、工具计划不符合字段格式、把低购房预算理解为租金澄清。对应修复是比较规范化状态、明确工具数组与摘要长度、明确购房总预算语义。最终结果是修复后的作者编写回归集，不是独立泛化评测。

## 结果与范围

实际完整回归结果以 `evals/gateway-live-results.json` 和 `evals/gateway-live-chinese-results.json` 为准；开发中的失败尝试不能算通过。`evals/gateway-auth-results.json` 记录无效密钥实际被 HTTP 403 拒绝。

场景数据仍为模拟库存、路线、配套与变化事件；政府 HDB 数据仅为历史成交参考。live 小样本证明被测接口行为，不证明真实房源推荐质量或总体模型准确率。

报告内 token 只覆盖该次最终保存的回归调用，不包含先前诊断和早期失败尝试，不能用作账户余额。未查询或断言团队剩余额度。比赛平台禁止训练／微调；本次只进行推理测试。

参照：[主办方分享的 Starter Kit](https://github.com/kenken64/ShowMeYourAgent-Starter-Kit)、[天气客户端协议示例](https://github.com/kenken64/ShowMeYourAgent-Starter-Kit/blob/main/weather_demo.py)、[用户消息格式兼容说明](https://github.com/kenken64/ShowMeYourAgent-Starter-Kit/blob/main/test_llm_gateway.py)。
