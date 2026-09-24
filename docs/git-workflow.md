# GitHub协作规则

## 分支

```text
main                              稳定演示版本
dev                               日常整合分支
feature/ai-service-dujun          杜君AI模块
feature/frontend-trading-jin      金佳亮前端和模拟交易
feature/backend-young             Young后端
feature/data-service-jiho         Joo Jiho数据服务
```

## 开发步骤

1. 从`dev`创建自己的功能分支
2. 在自己的模块目录开发
3. 提交前确认本模块能启动或至少代码结构完整
4. 推送到GitHub
5. 创建Pull Request合并到`dev`
6. 团队联调稳定后再合并到`main`

## 提交信息格式

```text
feat: add ai trade analysis api
fix: fix points deduction bug
docs: update api contract
chore: init frontend expo project
test: add csv parser sample test
```

## 不能提交的内容

- API Key
- 数据库密码
- `.env`
- `node_modules`
- Python虚拟环境
- Java构建产物
- 大型原始数据文件

## Pull Request检查清单

- 是否只改了自己负责的模块或已沟通过的公共文档？
- 是否更新了相关接口文档？
- 是否没有提交密钥和临时文件？
- 是否说明了如何测试？

