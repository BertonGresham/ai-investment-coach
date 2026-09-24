# AI Service

杜君负责的投资行为分析服务。服务分析用户的决策过程，不预测股价，也不提供买卖建议。

## 能力

- POST /analyze-trade：校验一笔交易数据，返回有证据的行为问题、性格标签、复盘建议和不确定性。
- POST /analyze-profile：把历史单笔分析汇总为近 7 天、30 天、90 天的行为画像。
- POST /recognize-trade-screenshot：通过视觉模型提取券商截图中的可见交易字段；返回置信度和提醒，不推测买卖理由。
- ChromaDB RAG：根据交易理由检索团队知识卡；检索到的材料会附带标题和来源。
- Mock 模式：默认不需要 API Key，适合前后端联调。

## 启动

~~~powershell
cd ai-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001 --env-file .env
~~~

接口文档：http://localhost:8001/docs

## 验证

安装依赖后，在 `ai-service` 目录运行：

~~~powershell
python -m unittest discover -s tests -v
~~~

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
python scripts/ingest_knowledge.py
~~~

首次建库会调用 Embeddings API；生成的向量库保存在 .chroma，本地文件不会提交到 Git。知识卡是团队原创摘要。添加书籍材料前，请使用自有或获得授权的内容，并保留准确来源信息。

没有可用知识库时，服务会跳过检索继续分析。LLM 模式要求 OPENAI_API_KEY；若显式关闭 Mock 却未配置密钥，接口返回 503，不会悄悄回退到 Mock。

截图识别要求 `USE_MOCK_LLM=false` 和视觉模型 API Key。默认 Mock 会明确返回“未执行视觉识别”，不会伪造 OCR 结果。仅接收 PNG、JPEG、WebP，文件上限 8 MB。

## 画像口径

画像只汇总已提交的单笔分析结果：短期为 7 天，中期为 30 天，长期为 90 天。少于 3 笔样本时，置信级别为低，并明确提示不可据此认定稳定人格。同一请求不接受重复的 trade_id。窗口基于请求中的最新交易时间计算，也可通过 as_of 指定。

