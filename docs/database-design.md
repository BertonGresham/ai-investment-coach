# 数据库设计草案

第一阶段只设计MVP需要的表，后续再扩展。

## users

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 主键 |
| username | varchar | 用户名 |
| email | varchar | 邮箱 |
| points_balance | int | 当前积分余额 |
| created_at | datetime | 创建时间 |

## lessons

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 主键 |
| title | varchar | 学习标题 |
| content | text | 学习内容 |
| reward_points | int | 完成奖励积分 |
| created_at | datetime | 创建时间 |

## user_lesson_records

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 主键 |
| user_id | bigint | 用户ID |
| lesson_id | bigint | 课程ID |
| completed_at | datetime | 完成时间 |

## point_transactions

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 主键 |
| user_id | bigint | 用户ID |
| change_amount | int | 积分变化 |
| transaction_type | varchar | LEARN_REWARD / TRADE_COST / SHOP_REDEEM |
| reference_id | varchar | 关联业务ID |
| created_at | datetime | 创建时间 |

## simulated_trades

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 主键 |
| user_id | bigint | 用户ID |
| symbol | varchar | 股票代码 |
| side | varchar | BUY / SELL |
| price | decimal | 成交价格 |
| quantity | int | 数量 |
| reason_code | varchar | 买卖原因代码 |
| reason_text | text | 用户填写原因 |
| market_snapshot_json | json | 交易时市场快照 |
| created_at | datetime | 创建时间 |

## ai_trade_analyses

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | bigint | 主键 |
| user_id | bigint | 用户ID |
| trade_id | bigint | 交易ID |
| result_json | json | AI分析结果 |
| created_at | datetime | 创建时间 |

