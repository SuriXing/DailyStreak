# Daily Practice Design — 研究综述与落地说明

> 本文档把业界标杆产品的机制研究（2026-08 桌面研究，含 40+ 产品）沉淀为
> DailyStreak 的每日练习设计决策。研究来源见文末。

## 一、每日题量

| 来源 | 每日题量 | 单次时长 |
|---|---|---|
| Duolingo | 单课 5-8 题，"1 课即打卡" | 3-5 分钟 |
| Khan Academy | 练习 4-7 题 / 测验 ≥5 题 | ~10 分钟 |
| 百词斩 / 墨墨 / 不背单词 | 保底 3 道，默认 5-10 道 | 3-10 分钟甜区；>1 小时必流失 |
| Babbel / Busuu | 每天 ~10 分钟 | 5-10 分钟 |

**决策：默认 5 题/天（约 4-6 分钟），保底 3 题，档位 3/5/10 可调（`useDailyGoal`）。**
AP 题思考成本（30-60 秒/题）高于单词题（3-5 秒），故低于百词斩的 20 词/天。

## 二、新学 : 复习 = 1:2，复习优先，动态分配

- 复习调度：简化 SRS 阶梯 `1/3/7/14` 天——连续答对则间隔翻倍，答错重置为 1 天
- 会话构建（`buildSessionPlan`）：到期复习题优先（最多 3 道），再补新题到每日目标；
  复习积压大时自动少出新题（墨墨"动态分配"防复习雪球）
- 逾期复习不惩罚、不强迫清空（断签回归只面对今天的题量）
- 参考：Khan Mastery Challenge "6 题 / 3 技能 / 每技能 2 题"；扇贝"复习上限阀门"；
  Anki/FSRS desired retention 90% 是默认甜点，不引入复杂算法

## 三、打卡与做题：双层设计

- **轻打卡**：一键保住连胜（3 秒完成，Duolingo "最小可行单元"）
- **做题完成**：完成当日题量后，日历格子从浅绿"已打卡"升级为深绿"已完成"（双态热力图）
- 止损：连胜按"昨天仍可保"规则（已有）；冻结/修复道具留作后续迭代
- 明确不做：Habitica 式掉血惩罚、Snapchat 式 24h 硬断、Hearts/能量门控
  （多邻国 2025 自己都在从 Hearts 转向"不惩罚错误"的 Energy）

## 四、进步证据（动机消退占教育类流失 40%）

- 技能掌握度（Khan 式 100 分制简化版）：连续答对 1 次=熟悉 50 / 2 次=精通 80 / 3 次=掌握 100；
  答错重置。按技能聚合展示（`computeMastery`）
- 每次练习结束给小结卡：正确率 + 掌握度变化 + 明日复习提示
- 里程碑徽章（7/30/90 天）留作后续；不做多币种多层级徽章体系

## 五、通知（后续迭代）

- 用户自选提醒时间 + 晚间"连胜告急"损失框架文案（Duolingo 验证为最高转化手段）
- 默认频率克制（1-3 条/天），关闭流程做挽留

## 研究来源（精选）

- Duolingo：官方博客《The habit-building research behind your Duolingo streak》、
  Lenny's Podcast（Jackson Shuttleworth）、The Verge《Duolingo is replacing hearts with energy》
- Khan Academy：官方帮助中心（Mastery levels / Mastery Challenges / Streaks）、
  官方博客《Get Motivated to Learn with Streaks and Levels》
- 背单词类：墨墨官方帮助（动态学习量）、smzdm《复习高利贷实测》、
  Anki 源码默认参数（20 新卡/200 复习）、Babbel 官方 10 分钟/天文章
- 习惯类：Apple 活动圆环心理学、GitHub 贡献图损失厌恶、Streaks 最小可行行动
- 留存数据：RetentionCheck（教育类月流失 10.5%，动机消退 40%）

## 落地文件

- `src/lib/answers.ts` — SRS 状态、会话构建、掌握度计算
- `src/hooks/use-daily-goal.ts` — 每日题量档位（3/5/10）
- `src/app/(tabs)/study.tsx` — 会话式答题（复习优先）+ 小结卡
- `src/app/(tabs)/index.tsx` — 今日进度条 + 双层日历
- `src/app/(tabs)/profile.tsx` — 课程掌握度 + 目标档位
- `supabase/schema.sql` — `answers` 答题记录表（RLS）
