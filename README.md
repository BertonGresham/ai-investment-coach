# AI Investment Coach / AI投资教练

AI投资教练是一个分析投资者决策行为的AI coaching平台。

核心原则：本项目不是预测股票涨跌，也不是直接给买卖建议，而是根据交易记录、买入理由、卖出理由、市场快照等信息，帮助用户复盘自己的投资行为，识别追涨、恐慌卖出、缺少计划、过度自信等习惯。

## MVP目标

第一阶段只做一个基础闭环：

1. 用户完成学习任务并获得积分
2. 用户消耗积分参与模拟交易
3. 用户提交买入/卖出记录和理由
4. AI分析本次交易行为
5. App展示行为问题、性格标签和复盘建议

## 仓库结构

```text
ai-investment-coach/
├── frontend-app/       # React Native Expo移动端
├── backend-server/     # Spring Boot主业务后端
├── ai-service/         # FastAPI + LLM行为分析服务
├── data-service/       # FastAPI + pandas数据管道服务
├── docs/               # 产品、接口、协作和开发文档
├── docker/             # 本地基础设施配置
├── .env.example
├── .gitignore
└── README.md
```

## 团队分工

| 成员 | 模块 | 第一阶段目标 |
| --- | --- | --- |
| 杜君 | AI分析模块、GitHub团队仓库 | 实现`POST /analyze-trade`，输出行为问题、性格标签、复盘建议 |
| 金佳亮 | 模拟交易系统、K线页面 | 实现基础模拟交易页面和买入理由选择 |
| Young | 学习、积分、商城、Spring Boot后端 | 实现用户、学习、积分、交易记录保存的基础接口 |
| Joo Jiho | 数据管道 | 实现CSV上传解析，输出标准交易记录JSON |

## 本地快速开始

### 1. AI服务

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

打开：

```text
http://localhost:8001/docs
```

### 2. 数据服务

```bash
cd data-service
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8002
```

打开：

```text
http://localhost:8002/docs
```

### 3. 后端服务

```bash
cd backend-server
mvn spring-boot:run
```

打开：

```text
http://localhost:8080/api/health
```

### 4. 前端App

```bash
cd frontend-app
npm install
npm run start
```

## GitHub协作流程

推荐分支：

```text
main
dev
feature/ai-service-dujun
feature/frontend-trading-jin
feature/backend-young
feature/data-service-jiho
```

开发时先从`dev`拉分支，完成后向`dev`发Pull Request。阶段稳定后再从`dev`合并到`main`。

## 重要提醒

- 不要提交API Key、数据库密码、`.env`文件。
- AI输出必须包含风险提示，不能输出直接买卖建议。
- 第一阶段先跑通闭环，不追求完整功能。
- 各模块对接前先遵守`docs/api-contract.md`里的接口格式。


