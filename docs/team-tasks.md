# 团队任务

## 杜君：AI分析模块

负责目录：

```text
ai-service/
frontend-app/ 与AI结果页面相关部分
docs/api-contract.md 中AI接口部分
```

第一阶段任务：

- 实现`POST /analyze-trade`
- 定义交易行为输入JSON
- 定义AI行为分析输出JSON
- 先用规则或mock跑通，后接入LLM API
- 为后续RAG预留`rag_context`字段
- 管理GitHub仓库结构和接口文档

验收标准：

- AI服务可以本地启动
- Swagger页面可访问
- 输入一笔交易记录后返回行为总结、问题、标签、建议和风险提示

## 金佳亮：模拟交易系统

负责目录：

```text
frontend-app/
backend-server/ 与交易相关接口配合
```

第一阶段任务：

- 实现移动端首页
- 实现模拟交易入口
- 实现买入理由单选
- 实现基础交易记录提交
- 展示AI分析结果

验收标准：

- 前端可以启动
- 用户能看到学习、积分、模拟交易、AI分析四个核心入口
- 可以用示例数据触发一次AI分析展示

## Young：后端主业务

负责目录：

```text
backend-server/
docker/docker-compose.yml 中MySQL和Redis部分
docs/database-design.md
```

第一阶段任务：

- 搭建Spring Boot基础项目
- 实现健康检查接口
- 设计用户、学习任务、积分流水、交易记录表
- 实现学习完成后积分增加的接口
- 实现交易记录保存接口
- 后续负责调用AI服务或给前端提供聚合接口

验收标准：

- 后端可以本地启动
- `GET /api/health`返回正常
- 至少完成学习积分和交易记录两个业务接口设计

## Joo Jiho：数据管道

负责目录：

```text
data-service/
docs/api-contract.md 中数据接口部分
```

第一阶段任务：

- 实现CSV上传解析接口
- 将券商CSV转成标准交易记录JSON
- 为后续K线截图识别预留接口
- 为后续历史K线和公告恢复预留接口

验收标准：

- 数据服务可以本地启动
- Swagger页面可访问
- 上传CSV后能返回标准交易记录列表

