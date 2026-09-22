# PropMatch 网页使用指南

线上地址：https://propmatch-18-142-198-52.sslip.io/

访问账号和密码由团队私下提供，不放在仓库。当前使用真实 Claude 网关；推荐房源、通勤和设施是模拟数据，HDB 面板是单独的官方历史成交参考。

## 第一次使用

1. 点 **Load Demo Scenario**，载入包含预算、卧室、工作地点和生活偏好的示例。等待推荐完成。
2. 左侧 **Buyer conversation** 是需求对话；中间是房源；右侧 **Agent activity** 是执行记录。
3. 中间 **Matches** 显示本轮全部候选，**Shortlist** 显示你选中的房源。
4. 点 **View details** 查看评分组成、取舍和来源；在两到四套房上勾选 **Compare**，再点顶部 **Compare** 比较。
5. 满意后点 **Approve shortlist** 保存批准。它不会发送消息、预约看房或购买房产。

## 调整推荐

| 想做什么 | 如何操作 |
|---|---|
| 改预算、卧室、地铁步行要求 | 在左侧补充条件并发送，例如 `Maximum budget SGD 1.7M, MRT within 5 minutes.`；系统保留其他已有要求，重新筛选 |
| 把某套加入或移出入选名单 | 点击房源图片上的书签按钮 |
| 不再考虑某套 | 点该房源的 **Reject**；替代名单会排除它 |
| 换一组入选名单 | 点 **Choose alternative shortlist**（旧版叫 Request alternative） |
| 手动把某套放到第一位 | 在 **View details** 中点 **Move to first · human override**；操作会记入记录 |
| 开始一个新案例 | 点 **Reset Demo** |

**Choose alternative shortlist 的确切含义：**从本轮已经筛选的候选中，选出最多三套目前未入选、未拒绝的房源，替换整份入选名单。成功后自动打开 Shortlist，并显示具体房源名称。它不单独替换第二套房，也不重新调用 AI 或搜索更多房源。连续点击可能重新选回以前那组；希望排除某套应使用 Reject。没有其他候选时，按钮禁用并提示修改需求。修改名单后需要重新批准。

## 演示房源变化

1. 先点 **Approve shortlist**。
2. 点 **Simulate top listing withdrawn**，模拟入选第一套下架。
3. 检查旧批准已失效、候选已更新、买家需求仍然保留。
4. **Simulate price above budget** 可演示涨价超预算后的重新筛选。

这些按钮只改变当前会话的模拟情景，不会修改真实房源。**Recheck sources** 是手动复查；**Watch while this page is open · every 30s** 只在页面打开且可见时检查，不是全天候监控。

## 常见疑问

- **为什么重复点换一组会看见以前的房子？** 本轮候选数量有限，按钮在未拒绝的候选中重新选择。更改左侧需求才会重新检索和排序。
- **为什么没有推荐？** 可能缺少必要条件、条件冲突，或没有房源满足硬性要求。按照提示补充需求；系统不会自行提高预算。
- **分数是 AI 的置信度吗？** 不是，是当前规则计算的匹配分数。模拟通勤等数据不代表真实路况。
- **提示会话已改变怎么办？** 其他标签页可能修改了同一会话。点 **Reload session**，再操作。
