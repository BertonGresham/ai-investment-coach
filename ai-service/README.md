# AI Service

杜君负责的AI行为分析服务。

第一阶段目标：

- 接收一笔交易记录
- 分析用户的投资决策行为
- 返回行为问题、性格标签、复盘建议和风险提示

## 启动

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Swagger:

```text
http://localhost:8001/docs
```

## LLM模式

默认使用mock规则分析，不需要API Key。

如果要接真实LLM：

```text
USE_MOCK_LLM=false
OPENAI_API_KEY=你的Key
```

