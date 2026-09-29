# Data Service

Joo Jiho负责的数据管道服务，将券商 CSV 解析为 `docs/api-contract.md` 约定的标准交易记录 JSON。

## 当前接口

- `GET /health`：服务健康检查。
- `POST /parse-csv`：上传 CSV，返回 `records` 和 `warnings`。

解析器支持常见英文、中文和韩文表头，买入/卖出方向会统一转换为 `BUY` / `SELL`。支持 UTF-8、UTF-8 BOM、CP949 和 GB18030 编码；股票代码按文本读取以保留前导零。CSV 未提供成交金额时，使用成交价格乘成交数量计算。无法解析或缺少必要字段的行会在 `warnings` 中说明。

## 启动

```powershell
cd data-service
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8002
```

Swagger 文档：`http://localhost:8002/docs`

CSV 上传字段名为 `file`，文件大小上限为 10 MB。历史 K 线、公告和截图识别接口仍待后续确定 API 契约后接入。
