# Young 后端首轮联调

## 范围与分工

本轮实现：用户身份 → 保存一组逐笔成交 → 调用 AI → 保存唯一报告 → 刷新或重启后查询交易与报告。
金佳亮继续负责主页和模拟交易界面，杜君继续负责 AI 分析与报告页面。本次仅提供网页请求适配示例，不实现模型分析或截图识别。学习、测验、积分、模拟交易解锁和商城均不在本轮。

AI 契约依据 feature/ai-service-dujun 的 docs/api-contract.md、docs/ai-integration-guide.md 和 ai-service/examples/trade.executions.json。AI 已合入 dev；本功能分支已同步 origin/dev（8568c2d）。不改动 AI 公共字段或分析实现。

## 启动与数据库配置

安装 JDK 17、Maven 3.9 和 MySQL 8.4 或兼容版本。使用独立的开发数据库，不连接现有生产库。数据库管理员创建数据库及仅该库的应用账号后，在 PowerShell 设置：

```powershell
$env:MYSQL_HOST='127.0.0.1'
$env:MYSQL_PORT='3306'
$env:MYSQL_DATABASE='ai_investment_coach'
$env:MYSQL_USER='coach'
# 在本机设置 MYSQL_PASSWORD；不要提交或发送真实密码。
$env:MYSQL_PASSWORD=Read-Host 'Local database password' -MaskInput
$env:AI_SERVICE_URL='http://127.0.0.1:8001'
cd backend-server
mvn spring-boot:run
```

Read-Host -MaskInput 需要 PowerShell 7。其他终端请通过安全的本机环境变量管理方式设置密码。backend-server/.env.example 仅为变量清单；Spring Boot 不会自动加载 .env。启动时 db/schema.sql 幂等创建本模块的五张表，不删除现有表。该首版脚本不是完整数据库升级系统；后续结构变更需添加版本化迁移。

本机验证使用独立端口 3307 和 MySQL 26.7；团队 docker/docker-compose.yml 的 MySQL 8.4 配置未改动。应用默认只绑定 127.0.0.1，开发网页允许 localhost:5173 与 127.0.0.1:5173，使用 BACKEND_CORS_ORIGINS 配置精确来源。

按 AI 分支文档启动杜君服务，端口 8001。USE_MOCK_LLM=true 可离线联调，不需要 Claude 或 OpenAI 密钥。真实模型密钥仅由 AI 服务保管；本后端只持有 AI_SERVICE_URL。

## 身份识别

POST /api/auth/register：username（1–80 字符）、email、password（12–128 字符）。成功返回 201。
POST /api/auth/login：email、password。成功返回 access_token、token_type、expires_at 和 user。
GET /api/me：查询当前登录身份。POST /api/auth/logout：撤销当前 token，返回 204。

所有交易与报告请求使用 Authorization: Bearer <access_token>。Token 随机生成、24 小时过期，数据库仅保存 SHA-256 摘要；密码使用每用户随机盐和 PBKDF2-HMAC-SHA256（210000 次）。邮箱统一小写并有唯一约束。

业务查询仅根据登录身份确定用户。即使前端提供别人的 user_id，也不能越权读取；创建请求若显式提供不同 user_id 则返回 403。读取别人的交易、分析或报告返回 404，未登录或过期返回 401。user_id 不是身份凭证。

这是本机开发首版，未包含邮箱验证、密码找回、限流和生产 HTTPS 部署。上线前应补齐这些功能。不要把示例配置的 HTTP 服务直接暴露公网。

## 保存逐笔成交

POST /api/trades，Content-Type: application/json，并提供 Idempotency-Key（8–100 位字母、数字、下划线或连字符）。请求示例见 backend-server/examples/trade.executions.json。

stock、trade.executions、decision、market_snapshot、analysis_context、rag_context 字段沿用 AI 契约。首版保存接口使用 executions 格式，不接受旧的一买一卖汇总请求；AI 原接口的兼容格式没有被修改。user_id、trade_id 可省略，后端从登录身份和生成的数据库编号设置 AI 请求；客户端 trade_id 不用于记录主键。

每条明细保留 execution_id、side（buy/sell）、time、price、quantity 和可空 reason，最多 100 条。时间可为 ISO 日期、无时区当地时间或带时区时间，保留原精度。缺失理由不补造。与 AI 相同，完整时间按绝对时间排序；同日日期不完整或混用时区时，必须核对列表顺序并传 execution_order_confirmed=true。

后端拒绝重复 ID、不可区分成交、任一时刻超卖、累计买入超过 1 亿股，以及非法价格和数量。价格范围 1e-8 到 1e12。这里只校验持仓规则，不实现模型推断或重做 AI 的移动平均成本分析。

成功返回 201：trade_id、user_id、symbol、analysis_status、last_error、created_at、request。request 保留完整 AI 请求与逐笔原始明细。相同用户使用相同 Idempotency-Key 和相同内容重试，返回同一交易；同一 key 改变内容返回 409。前端必须为同一次提交重用 key，为新交易生成新 key；不同 key 不会自动推断为同一交易。

## 分析与历史报告

1. 保存交易得到 trade_id。
2. POST /api/trades/{trade_id}/analysis，无需请求体。后端校验归属，再将数据库中的请求发给 AI /analyze-trade。
3. 成功保存完整 AI JSON，返回 trade_id、analysis_mode、created_at、result；result 不改变 AI 报告字段。
4. GET /api/trades/{trade_id} 读取原交易；GET /api/trades/{trade_id}/report 读取保存的报告。
5. GET /api/trades 和 GET /api/reports 仅返回当前用户记录；支持 offset=0、limit=20，limit 为 1–100。

报告表以 trade_id 为主键。一笔交易只有一个历史样本；重复或并发分析复用已保存的报告，不重复调用 AI。分析请求串行锁定该交易，网络读取超时 45 秒、连接超时 3 秒，首版适合本机演示；规模扩大后应改为任务队列。

AI 失败返回 502（上游字段校验失败为 422），交易保留，analysis_status=FAILED，可对同一个 trade_id 重试。无报告时报告查询返回 404。服务崩溃或数据库提交失败后重试可能再次调用上游，但唯一键保证数据库仍只有一个历史样本；不能声称跨服务费用严格只发生一次。当前不提供强制重新分析、编辑交易或累计画像接口。

## 网页对接

backend-server/examples/backend-client.js 导出 backendClient(baseUrl, getToken)，包含注册、登录、保存、分析、详情和历史查询。调用顺序为 saveTrade(payload, key) → analyze(trade_id)。刷新后用保留的会话恢复 me、trades、reports；报告直接展示 result，由杜君页面负责渲染。

示例对接不需要在浏览器保存模型密钥。调用失败时保留已保存的 trade_id；仅重试 analysis，不创建另一条交易。

## 数据表

app_users：用户和密码摘要；auth_sessions：凭证摘要与过期时间；trade_records：交易组、所有者、提交幂等键、AI 请求和状态；trade_executions：逐笔明细与顺序；ai_reports：每个交易组唯一的分析结果。

价格以精确十进制文本保留，避免数据库截断原始精度；业务校验使用 BigDecimal。请求与报告保存为已解析 JSON 文本。trade_executions 有 (trade_id, execution_id) 主键和 (trade_id, sequence_no) 唯一约束；交易提交有 (user_id, idempotency_key) 唯一约束，表间有外键。

## 接口测试

```powershell
cd backend-server
mvn test
# 必须在 Mock AI 模式运行，脚本会先检查，避免付费模型调用
./scripts/smoke-test.ps1
```

自动化测试默认使用 H2；可设置 TEST_DATABASE_URL、TEST_DATABASE_USER、TEST_DATABASE_PASSWORD，针对专用 MySQL 测试库运行同一组测试。测试会插入记录，请勿指向真实用户数据库。

持久化验收：在仓库外的临时目录指定 -StatePath 保存本次会话和交易编号，然后重启后端，再用相同参数加 -VerifyExisting。临时文件含会话 token，应保存在仓库外且不要分享或提交。

实测结果和环境限制见 [后端验收记录](backend-validation.md)。
