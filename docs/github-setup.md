# GitHub同步步骤

本地项目已经可以作为团队仓库推送到GitHub。

## 1. 设置Git提交身份

只在当前仓库设置：

```bash
git config user.name "你的名字"
git config user.email "你的邮箱"
```

或者设置为全局默认：

```bash
git config --global user.name "你的名字"
git config --global user.email "你的邮箱"
```

## 2. 创建第一次提交

```bash
git add .
git commit -m "chore: init ai investment coach monorepo"
```

## 3. 在GitHub创建空仓库

推荐仓库名：

```text
ai-investment-coach
```

创建时不要勾选自动生成README、.gitignore或License，因为本地已经有这些文件。

## 4. 绑定远程仓库并推送

把下面的`YOUR_GITHUB_ORG_OR_NAME`换成你的GitHub用户名或组织名：

```bash
git branch -M main
git remote add origin https://github.com/YOUR_GITHUB_ORG_OR_NAME/ai-investment-coach.git
git push -u origin main
```

## 5. 创建dev分支

```bash
git checkout -b dev
git push -u origin dev
```

## 6. 每个人创建自己的分支

```bash
git checkout dev
git pull
git checkout -b feature/ai-service-dujun
git push -u origin feature/ai-service-dujun
```

其他成员把分支名换成：

```text
feature/frontend-trading-jin
feature/backend-young
feature/data-service-jiho
```

## 7. 推荐仓库权限

- main：保护分支，需要Pull Request
- dev：日常联调分支
- feature分支：成员自由开发

