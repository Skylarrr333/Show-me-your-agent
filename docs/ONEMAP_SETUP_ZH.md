# OneMap 配置与交接

应用使用 OneMap GreyLite 底图、地址查询、步行/驾车/公共交通路线、MRT/LRT 与公交站接口，以及官方主题设施。Google Maps 仅为外部链接，不需要 Google Key 或结算账户。

## 本机配置

1. 到 [OneMap 注册页](https://www.onemap.gov.sg/apidocs/register) 注册并完成邮箱验证。
2. 在项目 `.env.local` 填写 `ONEMAP_EMAIL` 和 `ONEMAP_PASSWORD`。密码如含空格或特殊符号，按 dotenv 规则加引号；不要将凭据发到聊天、截图、提交 Git 或写入 `NEXT_PUBLIC_` 变量。
3. 重启开发服务器。打开房屋详情 → Map & everyday journeys。
4. 服务端向官方 `https://www.onemap.gov.sg/api/auth/post/getToken` 登录；内存保存 Token，按官方返回到期时间提前续期，遇到过期仅重试一次。若只配置 `ONEMAP_ACCESS_TOKEN`，需自行更新到期 Token。

`.env.local` 已被 Git 忽略。账号邮箱、密码、Token 不会被地图接口返回浏览器。浏览器只直接访问公开 OneMap 瓦片，地点查询通过本站后端。

## 部署到现有 Lightsail

把相同的 `ONEMAP_EMAIL`、`ONEMAP_PASSWORD` 加到服务器私有 `/opt/propmatch/shared/app.env`，权限 600。之后发布必须保留这些字段；无需重新构建来写入密钥，也不需要开放新端口。Compose 从 `.env` 读运行时配置后重建应用容器。

## 实际行为

- Home：只把匹配 **block + road** 的 OneMap 结果当作房子坐标，定位到楼栋而非单个房号；匹配失败时展示新加坡概览并提示。
- Nearby：地铁/轻轨、公交使用专门的 Nearby Transport API；设施从当前主题目录中选择支持的点图层。按球面距离过滤 1 公里，不把直线距离当步行距离。图层为空、无权限或失败会提示，不能推断“附近没有设施”。学校、商业网点等目录覆盖可能缺失，可转 Google Maps 查看。
- Journey：步行、驾车使用 OneMap 路网；MRT/公交使用当前新加坡时间查询最多三条计划行程，选择最早到达的一条，计入出发前等待。显示实际解析到的目的地，供用户核对；不声称实时交通/到站信息。
- 与主搜索目的地和交通方式一致的路线会保存为 Agent 证据。点主页面 **Check travel times** 可检查并重新排序候选房屋。新的路线查询不会偷偷修改用户搜索条件。
- 步行/驾车证据有效期一小时；公共交通五分钟。未知、过期或超出分钟上限的路线不能满足硬性通勤限制，需重新检查。
- 单进程请求排队、缓存、临时 502/503/504 只重试一次。429 不循环重试。缓存记录原始查询时间；失败结果不缓存为有效证据。
- Open Google Maps：用官方通用 URL 跳转当前房子、设施类别或路线。Google 结果不回填系统；只有点击链接后才向 Google 发送对应位置。

## 常见问题

- “OneMap sign-in failed”：核对账号邮箱、密码以及邮箱是否验证；错误不会回显凭据，失败后有一分钟冷却。
- “OneMap … unavailable”：上游服务或账户权限问题。不会改用模拟时间；房源数据库搜索仍可用。
- 有设施但地图没点：只有官方返回的有效点坐标会标注；区域多边形不会被伪装为入口。具体图层名称与覆盖提示可在 Data coverage & sources 展开查看。

官方文档：[认证](https://www.onemap.gov.sg/apidocs/authentication)、[路由](https://www.onemap.gov.sg/apidocs/routing)、[附近交通](https://www.onemap.gov.sg/apidocs/nearbytransport)、[主题](https://www.onemap.gov.sg/apidocs/themes)、[GreyLite](https://www.onemap.gov.sg/docs/maps/greylite.html)。
