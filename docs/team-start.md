# 组员开始指南

本指南统一团队交接步骤。首版目标是中韩文网页；不是重新创建四个项目，也不是先完成手机 App。

## 1. 拿到同一份代码

仓库：<https://github.com/BertonGresham/ai-investment-coach>

开发入口：<https://github.com/BertonGresham/ai-investment-coach/tree/dev>

1. 在 GitHub Desktop 登录自己的 GitHub 账号，不使用组长的账号、密码或模型密钥。
2. 选择 `File > Clone repository > URL`，填写 `https://github.com/BertonGresham/ai-investment-coach.git`，选择本机目录后点击 `Clone`。
3. 选择 `Fetch origin`，在 `Current branch` 切到 `dev`，有更新时选择 `Pull origin`。
4. 在开发工具中打开这个仓库目录。应同时看到 `README.md`、`ai-service`、`web-demo`、`backend-server`、`data-service` 和 `docs`。
5. 阅读本指南、[分工](team-tasks.md)、[接口契约](api-contract.md) 和 [AI 联调说明](ai-integration-guide.md)，再从更新后的 `dev` 创建自己的功能分支。

不要从旧的 `main` 或旧的 AI 功能分支开始新工作。AI 基础模块合入后，以 `dev` 为准。

如果已经在自己的功能分支开发，先提交或安全保存已有工作，再将 `origin/dev` 合入自己的分支；有冲突先协调，不要丢弃改动、强制推送或重新覆盖文件夹。ZIP 只有文件快照，没有 Git 历史；正式协作使用克隆的仓库，已有 ZIP 改动需逐文件迁入个人分支，不要直接创建无关历史推送到团队仓库。

## 2. 先验证 AI 复盘，不需要密钥

以下 Windows 命令在仓库根目录运行，需要 Python 3.11 或 3.12。其他成员只需安装自己模块的依赖，不要求全员同时安装全部技术栈。

首次准备 AI 环境（需要下载依赖）：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ai-service\scripts\setup-local.ps1
```

新环境会从模板创建 `ai-service/.env`，默认 `USE_MOCK_LLM=true`。脚本不覆盖现有 `.env`；已有配置时，自己在本机确认 Mock 已开启，勿把配置内容发到聊天或提交 GitHub。

终端 A 启动 AI 服务：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\ai-service\scripts\start-local.ps1 -Port 8001
```

终端 B 启动网页：

```powershell
.\ai-service\.venv\Scripts\python.exe -m http.server 5173 --bind 127.0.0.1 --directory web-demo
```

打开 <http://127.0.0.1:5173/?api=http://127.0.0.1:8001>，使用页面自带的合成案例验证中韩文流程。接口说明位于 <http://127.0.0.1:8001/docs>。

Mock 是明确标注的规则演示，不调用真实模型，也不执行真实截图识别。合成行情案例无需真实行情；选择 Yahoo 自动行情仍会请求外网。网页无须 Node 构建，运行前端自动测试才需要 Node。

端口被占用时不要关闭不明进程：后端可改为 `-Port 8005`，网页的 `?api=` 随之改成 `http://127.0.0.1:8005`。如果网页端口也变动，需在本机 `AI_SERVICE_CORS_ORIGINS` 中加入新的网页地址并重启 AI 服务。

`127.0.0.1` / `localhost` 只代表访问者自己的电脑。不要直接复制组长电脑临时使用的 8003、8004 等端口；也不要将本地演示地址当成已部署网站。

## 3. 常见问题

| 现象 | 先检查什么 |
| --- | --- |
| AI 说当前目录没有项目 | 是否已克隆；是否在开发工具中打开了正确目录，而不是空目录或压缩包 |
| 只有基础框架，没有 `web-demo` 或 AI 联调文档 | 是否仍在旧 `main`；更新并切到 `dev`，已有工作先保存 |
| 浏览器能看仓库，但 Git 工具报告凭据问题 | GitHub Desktop 是否登录自己的正确账号；保留原始错误排查，不能据此认定是仓库未授权 |
| 有代码却无法启动 | 依赖需要在自己的电脑安装；安装包和虚拟环境不会随 GitHub 同步 |
| 下载依赖报网络错误 | 检查本机网络和工具网络权限，不需要组长的 Claude 密钥；不要关闭整机安全软件 |
| 分析成功，截图却没有识别字段 | Mock 不进行 OCR，这是预期行为，不要当作真实识别成功 |
| 刷新后没有历史报告 | 当前复盘网页历史尚未接数据库，需 Young 实现持久化 |

遇到问题请提供当前分支、工作文件夹和具体错误，不要发送密码、密钥、未脱敏账户信息。

## 4. 第一轮联调验收

首页选择股票 -> 模拟买卖 -> 主后端保存逐笔交易 -> AI 分析 -> 保存报告 -> 刷新后查询历史报告。

金佳亮负责网页首页和模拟交易界面；Young 负责身份、交易规则与数据库；Joo Jiho 负责 CSV 和历史行情数据；杜君负责 AI 复盘、书籍检索及结果页面。暂缺的业务接口可以用明确标注的合成数据联调，不等于业务已实现。

提交自己的功能分支并向 `dev` 发 PR，附测试结果。不要直接推送 `dev` / `main`。API Key、真实交易截图、原始券商 CSV、数据库备份、虚拟环境和日志不属于公共代码。
