# AI Investment Coach / AI投资教练

## 组员从这里开始

**团队统一从 `dev` 开发，首版交付中韩文网页。** 先阅读 [组员开始指南](docs/team-start.md) 和 [当前分工](docs/team-tasks.md)。

- [打开团队最新版本](https://github.com/BertonGresham/ai-investment-coach/tree/dev)。`main` 保留为稳定版本分支，不作为当前开发起点。
- 已下载仓库的同学，在 GitHub Desktop 中先 `Fetch origin`，切换到 `dev` 并更新，再创建自己的功能分支。已有改动不要丢弃或强制覆盖。
- 只打开 GitHub 网页不等于本机已有代码；请在开发工具中打开包含本文件、`ai-service`、`web-demo` 和 `docs` 的整个项目文件夹。
- 当前完成的是 AI 复盘基础模块，不是整个产品；主业务保存、主页和模拟交易仍需团队联调。队友先用 Mock，无需组长的 Claude 密钥。

AI投资教练是一个分析投资者决策行为的AI coaching平台。

核心原则：本项目不是预测股票涨跌，也不是直接给买卖建议，而是根据交易记录、买入理由、卖出理由、市场快照等信息，帮助用户复盘自己的投资行为，识别追涨、恐慌卖出、缺少计划、过度自信等习惯。

## MVP目标

第一阶段只做一个基础闭环：

1. 用户完成学习任务并获得积分
2. 用户消耗积分参与模拟交易
3. 用户提交买入/卖出记录和理由
4. AI分析本次交易行为
5. 网页展示行为问题、性格标签和复盘建议，并由主后端保存历史报告

## 仓库结构

```text
ai-investment-coach/
├── frontend-app/       # 既有Expo原型，暂不要求手机端交付
├── web-demo/           # 中韩文AI复盘网页，接入金佳亮负责的总首页
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

### 网页演示

在仓库根目录运行：

```powershell
python -m http.server 5173 --bind 127.0.0.1 --directory web-demo
```

浏览器打开 `http://localhost:5173`。网页无需安装 Node 依赖；支持中韩文、美股买入前日 K 自动背景与附来源的书籍笔记。自动行情需要启动下方 AI 服务；初始案例使用明确标记的合成数据。未启动 AI 服务时，取消自动行情可使用明确标注的本地规则模拟。

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

### 4. 既有Expo原型（可选，非首版必需）

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
