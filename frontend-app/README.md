# Frontend App

React Native Expo移动端App。

第一阶段目标：

- 展示学习、积分、模拟交易、AI分析四个核心入口
- 能用示例数据调用AI服务
- 后续对接Spring Boot后端

## 启动

```bash
npm install
npm run start
```

将`.env.example`复制为`.env`。电脑浏览器调试可使用`http://localhost:8001`；真机调试时，将`EXPO_PUBLIC_AI_SERVICE_URL`改为电脑的局域网IP，例如`http://192.168.1.20:8001`，并确保手机和电脑连接同一网络。
