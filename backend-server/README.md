# Young 主业务后端

首轮实现登录身份、逐笔交易持久化、归属校验、调用团队 AI 服务以及唯一历史报告。

技术栈为 Java 17、Spring Boot 3.3.4、Spring JDBC 和 MySQL。SQL 事务显式控制重复提交与报告生成。保留团队现有项目结构，不改动 AI 模块和成员负责的界面。

完整配置、接口和验收步骤见 [后端联调指南](../docs/backend-young.md)。

```powershell
# 先配置 MySQL 环境变量；详情见指南
mvn test
mvn spring-boot:run
```

默认地址 http://127.0.0.1:8080；健康检查 GET /api/health。
