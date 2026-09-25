# AI Service

杜君负责的投资行为分析服务。服务分析用户的决策过程，不预测股价，也不提供买卖建议。

## 能力

- POST /analyze-trade：校验一笔交易数据，返回有证据的行为问题、性格标签、复盘建议和不确定性。
- POST /analyze-profile：把历史单笔分析汇总为近 7 天、30 天、90 天的行为画像。
- POST /recognize-trade-screenshot：通过视觉模型提取券商截图中的可见交易字段；返回置信度和提醒，不推测买卖理由。
- POST /analyze-market-context：自动获取美股历史日 K，计算买入前背景，返回有章节出处的中韩文书籍笔记。支持 Yahoo 与明确标记的合成演示；无需模型密钥。
- ChromaDB RAG：根据交易理由检索团队知识卡；检索到的材料会附带标题和来源。
- Mock 模式：默认不需要 API Key，适合前后端联调。

## 启动

Windows 推荐使用 Python 3.11（与 CI 一致）或 3.12，不使用系统默认的 Python 3.14。以下脚本只在项目 `.venv` 中安装依赖，不修改全局 Python，不需要激活虚拟环境。

脚本需要终端策略允许执行本地 PowerShell 脚本。若终端提示禁止脚本运行，请遵守该策略，在获准的环境中使用下方手动安装命令，不必激活虚拟环境或修改全局执行策略。

在仓库根目录的 PowerShell 中执行：

~~~powershell
.\ai-service\scripts\setup-local.ps1
.\ai-service\scripts\start-local.ps1
~~~

安装脚本会安装依赖、检查版本冲突、运行测试，并在 `.env` 不存在时从 `.env.example` 创建配置；已有配置不会被覆盖。默认使用 Mock，不需要 API Key。

首次创建环境时，可用 `-PythonPath 'C:\path\to\python.exe'` 指定 Python 3.11/3.12。仅检查现有环境、无需联网：

~~~powershell
.\ai-service\scripts\setup-local.ps1 -CheckOnly
~~~

若安装出现 `WinError 10013` 或“访问权限不允许的方式做了一个访问套接字的尝试”，说明当前命令运行环境的网络访问被拦截，并非软件包不存在。需要在获准联网的本机 PowerShell 中运行安装脚本；不应通过关闭防火墙或 TLS 验证解决。若普通 PowerShell 也报同样错误，再检查该终端的代理与网络访问策略。

手动启动方式：

~~~powershell
cd ai-service
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r requirements.txt
.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
~~~

接口文档：http://localhost:8001/docs

## 验证

安装依赖后，在 `ai-service` 目录运行：

~~~powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
~~~

无需密钥的接口闭环检查：

~~~powershell
.\.venv\Scripts\python.exe scripts\smoke_test.py --in-process
~~~

后端已经启动时，去掉 `--in-process` 可验证实际 HTTP 服务。该脚本发现 LLM 模式会停止，不会发送分析请求。测试中的模型响应使用离线替身，不代表已通过真实模型或 OCR 验收。

中韩交易样例与组员接入步骤见 [AI 模块联调](../docs/ai-integration-guide.md)。

## 使用真实模型和 RAG

复制 .env.example 为 .env，然后填写：

~~~text
USE_MOCK_LLM=false
OPENAI_API_KEY=你的API密钥
OPENAI_MODEL=gpt-4o-mini
OPENAI_VISION_MODEL=gpt-4o-mini
~~~

在 ai-service 目录安装依赖后，导入团队整理的知识卡：

~~~powershell
.\.venv\Scripts\python.exe scripts/ingest_knowledge.py
~~~

首次建库会调用 Embeddings API；生成的向量库保存在 .chroma，本地文件不会提交到 Git。脚本导入四张团队原创卡和 Selden (1912) 三张双语笔记（六条记录），合计十条。原文来源及地区限制见 [知识来源](knowledge/README.md)。自动行情页使用主题规则匹配，不需要预先建库；并非整本书智能问答。

没有可用知识库时，服务会跳过检索继续分析。LLM 模式要求 OPENAI_API_KEY；若显式关闭 Mock 却未配置密钥，接口返回 503，不会悄悄回退到 Mock。

截图识别要求 `USE_MOCK_LLM=false` 和视觉模型 API Key。默认 Mock 会明确返回“未执行视觉识别”，不会伪造 OCR 结果。仅接收 PNG、JPEG、WebP，文件上限 8 MB。

## 画像口径

画像只汇总已提交的单笔分析结果：短期为 7 天，中期为 30 天，长期为 90 天。少于 3 笔样本时，置信级别为低，并明确提示不可据此认定稳定人格。同一请求不接受重复的 trade_id。窗口基于请求中的最新交易时间计算，也可通过 as_of 指定。
