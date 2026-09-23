// AUTO-GENERATED from the AP Calc BC · 情境题 materials (25 cards). Do not hand-edit.
// Regenerate: node scripts/build-subject-decks.js
export type SubjectDeckKey = 'calcbc-scenario';

export interface SubjectFlashcard {
  id: string;
  deck: SubjectDeckKey;
  category: string;
  front: string;
  back: string;
  /** 文本来源：ai-mcq = AI 生成的原创选择题，不是 College Board 真题 */
  source: 'ai-mcq';
  /** 是否经过逐题独立验算/事实核查 */
  verified: boolean;
}

export const SUBJECT_DECKS_CALCBC_SCENARIO: { key: SubjectDeckKey; label: string }[] = [
  { key: "calcbc-scenario", label: "AP Calc BC · 情境题" },
];

export const SUBJECT_FLASHCARDS_CALCBC_SCENARIO: SubjectFlashcard[] = [
  { id: "calcbc-scenario-001", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "某振荡系统的偏差函数为 D(x)=(sin 3x−3x)/x³（x 为弧度，x≠0），求 lim(x→0) D(x)。\nA. -3/2\nB. -1/2\nC. -9/2\nD. -27/2", back: "答案：C\n简析：用 sin u=u−u³/6 展开，取 u=3x 得 sin 3x=3x−27x³/6，故 D(x)→−27/6=−9/2\n\n正确选项：-9/2", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-002", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "设 f(x)=(1−cos 2x)/x²（x≠0），补充定义 f(0)=k。若 f 在 x=0 处可导，则 k 与 f'(0) 分别为\nA. k=2，f'(0)=0\nB. k=2，f'(0)=2\nC. k=2，f'(0)=1\nD. k=2，f'(0) 不存在", back: "答案：A\n简析：1−cos 2x≈2x²，故 k=2，再由定义 f'(0)=lim(x→0)[(1−cos 2x)/x²−2]/x=lim(x→0)(−2x/3)=0\n\n正确选项：k=2，f'(0)=0", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-003", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "某质点在 t 秒时的位移为 s(t) 米，已知 s(2)=3 且 s'(2)=1 米/秒。求 lim(h→0)[s(2+3h)−s(2−h)]/h 的值。\nA. 4 米/秒\nB. 3 米/秒\nC. 2 米/秒\nD. -4 米/秒", back: "答案：A\n简析：拆项为 3·[s(2+3h)−s(2)]/(3h)+[s(2)−s(2−h)]/h，两部分分别趋于 3s'(2) 与 s'(2)，合计 4 米/秒\n\n正确选项：4 米/秒", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-004", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "某传感器在 x 处的读数 R(x)=x(√(x²+4)−x)（单位：伏），求 lim(x→∞) R(x)。\nA. 4 伏\nB. 1 伏\nC. -2 伏\nD. 2 伏", back: "答案：D\n简析：有理化得 R(x)=4x/(√(x²+4)+x)，分子分母同除以 x 得 4/(√(1+4/x²)+1)→2 伏\n\n正确选项：2 伏", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-005", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "设 f(x)=x²sin(1/x)（x≠0）且 f(0)=0。关于 f 在 x=0 处的连续性与可导性，正确的是\nA. f 在 0 处可导，且 f'(0)=1\nB. f 在 0 处连续，但 f'(0) 不存在\nC. f 在 0 处可导，且 f'(0)=0\nD. f 在 0 处不连续，因为 sin(1/x) 振荡", back: "答案：C\n简析：由 |f(x)|≤x² 知 f 在 0 处连续，又 f'(0)=lim(x→0)x sin(1/x)=0（有界量乘无穷小\n\n正确选项：f 在 0 处可导，且 f'(0)=0", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-006", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "一个圆形油膜的半径以 2 cm/s 的速率增大。当半径 r=10 cm 时，油膜面积的瞬时变化率 dA/dt 是多少？\nA. 40π cm²/s\nB. 20π cm²/s\nC. 80π cm²/s\nD. 400π cm²/s", back: "答案：A\n简析：A=πr²，对 t 求导得 dA/dt=2πr·dr/dt=2π×10×2=40π，单位 cm²/s\n\n正确选项：40π cm²/s", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-007", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "某质点沿直线运动，速度 v(t)=t²−4t+5（米/秒），其中 0≤t≤5。求这段时间内速度的最小值。\nA. 1 米/秒\nB. 5 米/秒\nC. 10 米/秒\nD. 0 米/秒", back: "答案：A\n简析：v'(t)=2t−4=0 得 t=2，v(2)=1，再比端点 v(0)=5、v(5)=10，故最小值是 1 米/秒\n\n正确选项：1 米/秒", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-008", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "函数 f(x)=x² 在闭区间 [0,3] 上满足中值定理条件，中值定理所保证的 c∈(0,3) 是\nA. c=3.0\nB. c=4.5\nC. c=-1.5\nD. c=3/2", back: "答案：D\n简析：平均变化率为 (9−0)/(3−0)=3，令 f'(c)=2c=3，得 c=3/2，且 3/2∈(0,3)\n\n正确选项：c=3/2", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-009", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "用总长 24 米的篱笆靠一面足够长的墙围成矩形围栏（墙作为一边，不需篱笆）。能围出的最大面积是多少？\nA. 144 平方米\nB. 12 平方米\nC. 72 平方米\nD. 36 平方米", back: "答案：C\n简析：设垂直于墙的边为 x，则另一边为 24−2x，A=x(24−2x)，A'=24−4x=0 得 x=6，另一边 12，最大面积 72 平方米\n\n正确选项：72 平方米", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-010", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "一架长 5 米的梯子斜靠在竖直墙上，梯子底端以 1 米/秒的速率沿地面远离墙滑动。当底端离墙 3 米时，梯子顶端下滑速度的大小是多少？\nA. 0.75 米/秒\nB. -0.75 米/秒\nC. 1.33 米/秒\nD. 0.5 米/秒", back: "答案：A\n简析：x²+y²=25，求导得 2x·dx/dt+2y·dy/dt=0，x=3 时 y=4，故 dy/dt=−(x/y)·dx/dt=−3/4，下滑速度大小为 0.75 米/秒\n\n正确选项：0.75 米/秒", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-011", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "曲线 y=x² 与直线 y=6x 所围成的区域面积是多少？\nA. 72 平方单位\nB. 36 平方单位\nC. 108 平方单位\nD. 180 平方单位", back: "答案：B\n简析：交点 x=0 与 x=6，面积=∫_0^6 (6x−x²)dx=3x²−x³/3 在 0 到 6 的差=108−72=36 平方单位\n\n正确选项：36 平方单位", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-012", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "由 y=x、y=0、x=3 围成的区域绕 x 轴旋转一周，所得旋转体的体积是多少？\nA. 9π 立方单位\nB. 27π 立方单位\nC. 9 立方单位\nD. 27 立方单位", back: "答案：A\n简析：V=π∫_0^3 x² dx=π·[x³/3]_0^3=9π 立方单位\n\n正确选项：9π 立方单位", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-013", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "某物体在 0≤t≤9 秒内沿直线运动，速度 v(t)=t²（米/秒）。求这段时间内的平均速度。\nA. 27 米/秒\nB. 243 米/秒\nC. 40.5 米/秒\nD. 81 米/秒", back: "答案：A\n简析：平均速度=(1/9)∫_0^9 t² dt=(1/9)·243=27 米/秒\n\n正确选项：27 米/秒", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-014", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "求定积分 ∫_1^e ln x dx 的值。\nA. 该积分值为 e\nB. 该积分值为 e-1\nC. 该积分值为 0\nD. 该积分值为 1", back: "答案：D\n简析：取 u=ln x、dv=dx 分部积分得 [x ln x − x]_1^e=(e−e)−(0−1)=1\n\n正确选项：该积分值为 1", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-015", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "用换元法求定积分 ∫_1^2 (2x+1)³ dx 的值。\nA. 积分值为 136\nB. 积分值为 68\nC. 积分值为 544\nD. 积分值为 272", back: "答案：B\n简析：令 u=2x+1，du=2dx，积分变为 (1/2)∫_3^5 u³ du=(1/8)(625−81)=68\n\n正确选项：积分值为 68", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-016", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "求等比级数 Σ_{n=1}^∞ (2/3)ⁿ 的和。\nA. 该级数的和为 3\nB. 该级数的和为 2\nC. 该级数的和为 2/3\nD. 该级数的和为 6", back: "答案：B\n简析：首项 a=2/3、公比 r=2/3，|r|<1，和=a/(1−r)=(2/3)/(1/3)=2\n\n正确选项：该级数的和为 2", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-017", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "对级数 Σ_{n=1}^∞ 1/(n²+1)，下列判断正确的是\nA. 发散，因为比值极限为 1\nB. 收敛，且比值判别法失效\nC. 收敛，因为比值极限小于 1\nD. 发散，因为通项不趋于 0", back: "答案：B\n简析：比值极限 lim (n²+1)/((n+1)²+1)=1，比值判别法失效，再由 1/(n²+1)<1/n² 且 Σ1/n² 收敛，故级数收敛\n\n正确选项：收敛，且比值判别法失效", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-018", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "函数 f(x)=e^(−x²) 的麦克劳林级数中 x⁴ 项的系数是\nA. x⁴ 的系数是 -1/2\nB. x⁴ 的系数是 1/2\nC. x⁴ 的系数是 1\nD. x⁴ 的系数是 1/4", back: "答案：B\n简析：由 e^u=Σ uⁿ/n! 取 u=−x²，n=2 得 (−x²)²/2!=x⁴/2，故 x⁴ 项系数为 1/2\n\n正确选项：x⁴ 的系数是 1/2", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-019", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "幂级数 Σ_{n=1}^∞ (x−2)ⁿ/(n·3ⁿ) 的收敛区间是\nA. (-1,5)\nB. [-1,5)\nC. (-1,5]\nD. (-∞, +∞)", back: "答案：B\n简析：由比值判别法 |x−2|/3<1 得收敛半径 3，即 −1<x<5，x=−1 时 Σ(−1)ⁿ/n 收敛，x=5 时 Σ1/n 发散，故区间为 [−1,5)\n\n正确选项：[-1,5)", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-020", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "级数 Σ_{n=1}^∞ (−1)^(n+1)/√n 的收敛性是\nA. 绝对收敛，因为 Σ1/√n 收敛\nB. 发散，因为通项不趋于 0\nC. 发散，因为 p=1/2 小于 1\nD. 条件收敛，绝对值级数发散", back: "答案：D\n简析：由莱布尼茨判别法，通项递减趋于 0，交错级数收敛，绝对值级数 Σ1/√n 是 p=1/2<1 的 p 级数，发散，故为条件收敛\n\n正确选项：条件收敛，绝对值级数发散", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-021", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "某培养液中的细菌数 P(t) 满足 dP/dt=0.3P（t 以小时计），初始 P(0)=20 个。求 2 小时后细菌数的近似值（取整数）。\nA. 32 个\nB. 26 个\nC. 36 个\nD. 364 个", back: "答案：C\n简析：分离变量得 P(t)=20e^(0.3t)，P(2)=20e^0.6≈20×1.822≈36.4，取整数 36 个\n\n正确选项：36 个", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-022", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "已知 dy/dx=2xy 且 y(0)=3，则 y 关于 x 的表达式是\nA. y=3e^(2x)\nB. y=e^(x²)+3\nC. y=3e^(x²+1)\nD. y=3e^(x²)", back: "答案：D\n简析：分离变量 dy/y=2x dx，积分得 ln|y|=x²+C，即 y=Ce^(x²)，由 y(0)=3 得 C=3，故 y=3e^(x²)\n\n正确选项：y=3e^(x²)", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-023", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "曲线由参数方程 x=t²+1、y=t³−3t 给出，求 t=2 处 dy/dx 的值。\nA. 9/2\nB. 4/9\nC. 9/4\nD. 15/4", back: "答案：C\n简析：dy/dx=(dy/dt)/(dx/dt)=(3t²−3)/(2t)，代入 t=2 得 (12−3)/4=9/4\n\n正确选项：9/4", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-024", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "极坐标曲线 r=2cos θ 所围成的区域面积是多少？\nA. 区域面积为 2π\nB. 区域面积为 4π\nC. 区域面积为 π/2\nD. 区域面积为 π", back: "答案：D\n简析：r≥0 时 θ∈[0,π]，面积=(1/2)∫_0^π (2cos θ)² dθ=2∫_0^π cos²θ dθ=2·(π/2)=π\n\n正确选项：区域面积为 π", source: "ai-mcq", verified: true },
  { id: "calcbc-scenario-025", deck: "calcbc-scenario", category: "AP Calc BC · 情境题", front: "曲线 y=(2/3)x^(3/2) 在 0≤x≤3 上的弧长约为多少？\nA. 4.67 米\nB. 5.33 米\nC. 3.46 米\nD. 10.67 米", back: "答案：A\n简析：y'=x^(1/2)，1+(y')²=1+x，弧长=∫_0^3 √(1+x) dx=(2/3)(8−1)=14/3≈4.67 米\n\n正确选项：4.67 米", source: "ai-mcq", verified: true },
];
