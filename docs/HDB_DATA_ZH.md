# HDB 数据与交接

数据源：[Kaggle · yingghui233/hdb-resale-pricing-singapore](https://www.kaggle.com/datasets/yingghui233/hdb-resale-pricing-singapore)。2026-09-26实际下载并导入version 1，核对228,225行、26个town、2017-01至2026-04。

## 队友如何启动

原始压缩包现在在私有Git仓库 `data/hdb/kaggle-v1.zip`，无需向某位队友索取他本机SQLite。详细来源、SHA256与许可标注见 [数据清单](../data/hdb/README.md)。

```bash
npm ci
npm run data:hdb
cp .env.example .env.local
npm run dev:next
```

需要Node22.13+和Python3.10+。Python仅使用标准库，校验CSV的SHA256与列/数值后原子写入 `.propmatch-data/hdb-resales.sqlite`。该数据库是生成物，不提交Git；原始zip才是可复现输入。环境变量 `HDB_RESALE_DB` 可指定其他数据库路径。

Docker构建自动完成导入，数据库随镜像一起部署；不依赖外部手工传库或挂载。`/api/status` 的 `homes.ready` 和容器 `/api/homes` 健康检查验证数据库可用。

## 数据含义

历史交易按town、block、street、flat type、storey range、area、flat model、lease start分组，取最新交易价构造代表性模拟房屋。分组不等于实际一套房；没有unit number。相同分组较旧低价不会绕过现在的模拟参考价筛选。

- 房价：历史成交参考，不是当前要价或估价。
- 可售状态和下架/涨价事件：会话内模拟，不是实时行情。
- HDB flat type：不是卧室数量，4 ROOM不代表4个卧室。
- 楼栋坐标、路线、周边设施：单独实时请求公共地图服务，来源与成交数据分开。
- Kaggle许可标签：**Unknown**，没有被改成CC0或政府开放许可。此归档供团队私有项目交接；公开分发或商用前核对来源权限。

## 更新边界

当前快照固定为version1，不会自动下载新Kaggle版本。更新时需审核新来源/许可、更新固定归档与SHA256，重新导入/构建。页面检测快照SHA变化，重建推荐并撤销旧批准。它不具备真实在售房源采集和下架检测能力。
