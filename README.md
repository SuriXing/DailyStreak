# DailyStreak 📚

给 Suri 的临时学习打卡 App：**每天打开学一点，坚持打卡攒连胜**。

一套代码同时支持 **iOS**（Expo Go 扫码即用）和 **Web**（浏览器 / PWA）。

## ✨ 功能

- 🔥 **每日打卡**：一键打卡、连胜统计（Duolingo 规则：今天还没打卡时，昨天仍可保住连胜）
- 📅 **打卡日历**：GitHub 风格热力图，最近 12 周一目了然，今天有橙色描边
- 📖 **每日学习**：AP CSA / CSP 双科交替的知识点卡片 + 每日小测验（答完即看解析），内容每天自动轮换
- 👤 **账号系统**：邮箱注册/登录，打卡记录云端同步（Supabase），换设备不丢
- 🏆 **统计**：累计打卡、当前连胜

## 🛠 技术栈

| 层 | 选型 |
|---|---|
| 跨端框架 | [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/)（React Native 0.86 + TypeScript） |
| 路由 | expo-router（经典 Tabs，全平台一致） |
| 后端 | [Supabase](https://supabase.com)（Auth + Postgres + Row Level Security） |
| 本地存储 | AsyncStorage（会话持久化） |

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置 Supabase

1. 在 [supabase.com](https://supabase.com) 免费创建一个项目（选离你近的区域）
2. 打开 **SQL Editor**，把 [`supabase/schema.sql`](supabase/schema.sql) 的全部内容粘贴执行（自动建表、开启行级安全、注册自动建档）
3. （可选）**Authentication → Sign In / Up** 里关闭 **Confirm email**，注册后免确认直接登录
4. 复制 **Project Settings → API** 里的 `Project URL` 和 `anon public key`，填入 `.env`：

```bash
cp .env.example .env
# 编辑 .env，填入真实值
```

> ⚠️ 不配置 `.env` 时 App 也能跑，但会停在"还差一步配置"提示页。

### 3. 运行

```bash
# Web（浏览器打开 http://localhost:8081）
npm run web

# iOS（iPhone 装 Expo Go 后扫码）
npm start
```

## 🌐 Web 部署（Vercel）

```bash
npx expo export -p web   # 产物在 dist/
```

把 `dist/` 部署到 Vercel 即可（`vercel --prod` 或拖拽上传）。

## 📂 目录结构

```
src/
├── app/
│   ├── _layout.tsx        # 根布局：登录门控（未登录只能进 /auth）
│   ├── auth.tsx           # 登录 / 注册
│   └── (tabs)/
│       ├── _layout.tsx    # 底部 Tabs（打卡 / 学习 / 我的）
│       ├── index.tsx      # 打卡主页
│       ├── study.tsx      # 每日学习
│       └── profile.tsx    # 我的（统计 + 退出）
├── components/streak-calendar.tsx   # 打卡热力图
├── data/content.ts        # 每日学习内容（CSA/CSP），扩充内容改这里
├── hooks/                 # useSessionUser / useTheme 等
└── lib/                   # supabase 客户端、打卡与连胜逻辑
supabase/schema.sql        # 数据库结构（在 Supabase SQL Editor 执行）
```

## ✏️ 扩充每日内容

编辑 `src/data/content.ts` 的 `STUDY_CONTENT` 数组，每项包含：

```ts
{
  day: 15,
  subject: 'CSA' | 'CSP',
  title: '知识点标题',
  body: '知识点讲解（卡片）',
  question: '小测验题目',
  options: ['A', 'B', 'C', 'D'],
  answerIndex: 0,          // 正确答案下标
  explanation: '答案解析',
}
```

内容按天循环轮换（第 1 天 → 今天，循环使用），想调整起始日改 `study.tsx` 里的 `CONTENT_START`。

## 📝 备注

- 临时项目，代码尽量简单直白；如有任何功能想加（提醒推送、XP 等级、徽章等）直接说
- iOS 真机需要与电脑同一 Wi-Fi；局域网连不上时可 `npx expo start --tunnel`
