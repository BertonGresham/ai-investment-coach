# 网页演示

零前端构建依赖的中韩双语投资行为复盘子页面，适合嵌入团队产品首页或独立演示。产品总首页与实时行情入口由模拟交易模块负责。

## 启动网页

在仓库根目录执行：

~~~powershell
python -m http.server 5173 --directory web-demo
~~~

浏览器打开 <http://localhost:5173>。页面会默认连接 `http://localhost:8001` 的 AI 服务；服务未启动或不可访问时，会切换到页面内的本地规则模拟，并在结果上明确标注，不会伪装成 LLM 输出。模拟交易和画像只保存在当前页面内存中。

页面右上角可切换简体中文/韩语。选择 PNG/JPG/WebP 券商交易截图后先在本机预览；点击“识别截图”才会把图片发送给视觉模型。识别结果会先以逐字段核对表显示，确认后才替换表单；确认前不能提交分析，取消或更换文件不会改动交易记录。缺失时间及时区的字段留空，需手动补齐。自评分只是模型估值，不是识别准确率。Mock 后端会明确提示未执行真实视觉识别。本演示与 AI 服务都不把上传图片写入磁盘。

## 自动行情与书籍参考

勾选“自动获取买入前日 K”后，点击分析会先读取历史背景，无需手写 K 线摘要。只支持美股，按本机时区输入交易时间，转换为纽约日期后排除买入当天的日 K。展示行情区间、计算指标、Selden (1912) 书籍笔记和来源链接。

初始案例及“载入演示案例”使用明确标记的合成行情。选择“真实历史行情 · Yahoo”才读取真实数据，行情获取不需要 LLM 密钥。股票、日期、来源、语言或理由类型变化会清除旧背景；晚返回的请求不会覆盖新表单。

自动背景需要后端运行。读取失败时会停止提交并提示错误，不以虚构行情替代；可重试或取消自动获取，仅按填写的理由复盘。关闭自动获取时，摘要为可选的用户补充，并标记未经验证。

书籍笔记目前按主题规则匹配，非 AI 生成。行为结果顶部另行标明 Mock 或 LLM。尚未执行真实 Embeddings 建库及 LLM/OCR 验收。

前端状态回归测试：`node --test web-demo/tests/*.test.cjs`（仓库根目录，无需安装 npm 包）。

## 连接 AI 服务

API 密钥只放在 `ai-service/.env`。在仓库根目录的 PowerShell 里运行 `if (-not (Test-Path .\ai-service\.env)) { Copy-Item .\ai-service\.env.example .\ai-service\.env }`，再用记事本打开：`notepad .\ai-service\.env`。设置 `OPENAI_API_KEY=你的密钥` 和 `USE_MOCK_LLM=false`，保存后重启 AI 服务。示例模板 `.env.example` 只能保留空白占位符，不能把真实密钥写进去；`.env` 已由 Git 忽略，不要上传或贴到聊天中。当前后端使用 OpenAI Python SDK，密钥需要有权调用配置的 OpenAI 模型。

在 `ai-service` 目录配置 `.env` 并启动 FastAPI：

~~~powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001 --env-file .env
~~~

首次启动默认是 `USE_MOCK_LLM=true`，网页状态显示为后端 Mock。配置有效的 `OPENAI_API_KEY` 并设置 `USE_MOCK_LLM=false` 后，才会调用真实 LLM 和视觉模型。网页源站 `localhost:5173` 已列入 AI 服务的开发 CORS 白名单；真机或局域网演示时，在 `AI_SERVICE_CORS_ORIGINS` 中加入网页实际使用的来源地址。

网页端不需要 `npm install`。真实模型和 RAG 仍需要安装 Python 服务依赖及配置相应 API Key。

