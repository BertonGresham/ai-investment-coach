# 网页演示

零前端构建依赖的中韩双语投资行为复盘子页面，适合嵌入团队产品首页或独立演示。产品总首页与实时行情入口由模拟交易模块负责。

## 启动网页

在仓库根目录执行：

~~~powershell
python -m http.server 5173 --directory web-demo
~~~

浏览器打开 <http://localhost:5173>。页面会默认连接 `http://localhost:8001` 的 AI 服务；服务未启动或不可访问时，会切换到页面内的本地规则模拟，并在结果上明确标注，不会伪装成 LLM 输出。模拟交易和画像只保存在当前页面内存中。

页面右上角可切换简体中文/韩语。上传 PNG/JPG/WebP 券商交易截图后，需调用 `/recognize-trade-screenshot`；识别字段会回填表单，用户核对并补充交易理由后，再点击分析。图片会发送到配置的视觉模型提供方；本演示和 AI 服务不落盘保存图片。Mock 后端会明确提示未执行真实视觉识别。

## 连接 AI 服务

在 `ai-service` 目录配置 `.env` 并启动 FastAPI：

~~~powershell
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001 --env-file .env
~~~

首次启动默认是 `USE_MOCK_LLM=true`，网页状态显示为后端 Mock。配置有效的 `OPENAI_API_KEY` 并设置 `USE_MOCK_LLM=false` 后，才会调用真实 LLM 和视觉模型。网页源站 `localhost:5173` 已列入 AI 服务的开发 CORS 白名单；真机或局域网演示时，在 `AI_SERVICE_CORS_ORIGINS` 中加入网页实际使用的来源地址。

网页端不需要 `npm install`。真实模型和 RAG 仍需要安装 Python 服务依赖及配置相应 API Key。

