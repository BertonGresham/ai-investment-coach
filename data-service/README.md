# Data Service

Joo Jiho负责的数据管道服务。

第一阶段目标：

- 上传券商CSV
- 解析为标准交易记录JSON
- 为后续历史K线、公告、截图识别预留接口

## 启动

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8002
```

Swagger:

```text
http://localhost:8002/docs
```

