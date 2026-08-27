/**
 * Course registry — DailyStreak 框架核心。
 *
 * 任何 AP 课程（或任意学科）都可以通过往 COURSES 里加一项来接入：
 * 打卡/连胜/日历逻辑完全复用，学习页自动按所选课程轮换内容。
 * 参考 README「Adding a Course」一节。
 */

export interface StudyItem {
  /** 稳定 id（course-day），用于答题记录与复习调度 */
  id: string;
  day: number;
  subject: string;
  /** 技能标签（掌握度按技能聚合展示） */
  skill: string;
  title: string;
  body: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export interface Course {
  /** 唯一 id，用于持久化用户选择 */
  id: string;
  /** 课程全名 */
  name: string;
  /** 徽章短名（如 CSA / CSP） */
  shortName: string;
  /** 主题色（徽章、切换器高亮） */
  color: string;
  /** 一句话简介 */
  description: string;
  /** 每日学习内容，按天轮换、循环使用 */
  items: StudyItem[];
}

export const CSA_ITEMS: StudyItem[] = [

  {
    day: 1,
    id: 'csa-1',
    subject: 'CSA',
    skill: '基本类型',
    title: 'Java 基本类型与变量',
    body: 'CSA 高频考点：Java 有 8 种基本类型（primitive types）。常考的有 int（整数）、double（小数）、boolean（布尔）、char（单个字符）。引用类型（String、数组、对象）存的是"地址"。注意 int/int 结果是整数除法：7/2 = 3，不是 3.5。',
    question: '执行 int x = 7 / 2; 后，x 的值是？',
    options: ['3.5', '3', '4', '编译错误'],
    answerIndex: 1,
    explanation: '两个 int 相除是整数除法，直接截断小数部分，7/2 = 3。想得到 3.5 需要写成 7.0 / 2 或 (double) 7 / 2。',
  },

  {
    day: 2,
    id: 'csa-2',
    subject: 'CSA',
    skill: 'String',
    title: 'String 常用方法',
    body: 'String 是对象，方法调用不改变原字符串（不可变 immutable）。高频方法：length() 长度、substring(a,b) 截取（含 a 不含 b）、indexOf(s) 找位置（找不到返回 -1）、equals() 比较内容（== 比较地址，别用错！）。',
    question: 'String s = "banana"; s.indexOf("na") 的返回值是？',
    options: ['0', '2', '4', '-1'],
    answerIndex: 1,
    explanation: 'indexOf 返回第一次出现的位置（0 起）。"banana" 中 "na" 第一次出现在下标 2：b(0) a(1) n(2) a(3)。',
  },

  {
    day: 3,
    id: 'csa-3',
    subject: 'CSA',
    skill: 'ArrayList',
    title: 'ArrayList 操作',
    body: 'ArrayList 是可变长度列表（比数组灵活）。高频方法：add(x) 追加、add(i, x) 插入、get(i) 取值、set(i, x) 替换、remove(i) 删除、size() 长度。注意：remove 后元素会前移，索引会变！遍历删除时容易出 bug。',
    question: 'ArrayList<Integer> a = [10, 20, 30, 40]; 执行 a.remove(1); 后 a.get(1) 是？',
    options: ['20', '30', '40', '越界错误'],
    answerIndex: 1,
    explanation: 'remove(1) 删除下标 1 的元素 20，后面元素前移：[10, 30, 40]，所以新的 a.get(1) = 30。',
  },

  {
    day: 4,
    id: 'csa-4',
    subject: 'CSA',
    skill: '循环',
    title: 'for 循环与嵌套',
    body: 'CSA 高频考点：for (int i = 0; i < n; i++) 执行 n 次。嵌套循环总次数 = 外层 × 内层。二维数组遍历：外层行 i，内层列 j，arr[i][j]。注意边界条件（i < n 而不是 i <= n）。',
    question: '以下代码输出几次 "hi"？for (int i = 0; i < 3; i++) { for (int j = 0; j < 2; j++) { System.out.println("hi"); } }',
    options: ['3', '5', '6', '9'],
    answerIndex: 2,
    explanation: '外层 3 次 × 内层 2 次 = 6 次。',
  },

  {
    day: 5,
    id: 'csa-5',
    subject: 'CSA',
    skill: '方法重载',
    title: '方法重载 vs 重写',
    body: 'CSA 易混点：重载（overload）是同一类里方法名相同、参数列表不同；重写（override）是子类重新实现父类方法，签名必须相同。调用时编译器按参数个数和类型选择重载版本。',
    question: '以下哪个是合法的重载？',
    options: [
      'int f(int x) 和 double f(int x)',
      'int f(int x) 和 int f(int y)',
      'int f(int x) 和 int f(double x)',
      'int f(int x) 和 void g(int x)',
    ],
    answerIndex: 2,
    explanation: '重载要求参数列表不同。A 只改返回类型不合法；B 参数名不同不算；D 是不同方法名。C 参数类型不同（int vs double），合法重载。',
  },

  {
    day: 6,
    id: 'csa-6',
    subject: 'CSA',
    skill: '二维数组',
    title: '二维数组',
    body: '二维数组 int[][] a = new int[3][4] 表示 3 行 4 列。a.length = 3（行数），a[0].length = 4（列数）。遍历顺序（行优先）是 FRQ 常考点：外层循环行、内层循环列。',
    question: 'int[][] a = new int[3][4]; 中 a.length 的值是？',
    options: ['3', '4', '12', '编译错误'],
    answerIndex: 0,
    explanation: 'a.length 是第一维（行数）3；a[0].length 是第二维（列数）4；总元素 3×4=12。',
  },

  {
    day: 7,
    id: 'csa-7',
    subject: 'CSA',
    skill: '继承多态',
    title: '继承与多态',
    body: 'CSA 核心：子类（subclass）用 extends 继承父类（superclass）的成员，可重写方法实现多态（polymorphism）。父类引用可以指向子类对象：Animal a = new Dog(); 调用方法时执行子类版本（动态绑定）。super 关键字调用父类方法/构造器。',
    question: 'Animal a = new Dog(); 其中 Dog 重写了 speak()。a.speak() 执行的是？',
    options: ['Animal 的 speak()', 'Dog 的 speak()', '编译错误', '运行时错误'],
    answerIndex: 1,
    explanation: '多态：运行时根据对象实际类型（Dog）调用方法，这叫动态绑定（dynamic dispatch）。',
  },
];

export const CSP_ITEMS: StudyItem[] = [

  {
    day: 1,
    id: 'csp-1',
    subject: 'CSP',
    skill: '二进制',
    title: '二进制与数据表示',
    body: 'CSP 核心概念：计算机所有数据底层都是 0 和 1（bit）。8 个 bit = 1 个 byte。二进制转十进制：从右往左每位 × 2^n。例如 1010₂ = 1×8 + 0×4 + 1×2 + 0×1 = 10。',
    question: '二进制数 1011 等于十进制的多少？',
    options: ['9', '11', '13', '15'],
    answerIndex: 1,
    explanation: '1011₂ = 1×8 + 0×4 + 1×2 + 1×1 = 8 + 0 + 2 + 1 = 11。',
  },

  {
    day: 2,
    id: 'csp-2',
    subject: 'CSP',
    skill: '互联网',
    title: '互联网与数据包',
    body: 'CSP 高频概念：互联网传输是把数据拆成小包（packets）分别发送，路径可以不同（redundant routing），到目的地再组装。TCP 保证可靠有序，UDP 更快但不保证。路由器（routers）负责转发数据包。',
    question: '关于数据包传输，下列哪项描述正确？',
    options: [
      '所有数据包必须走同一条路径',
      '数据包可以走不同路径到达目的地',
      '数据包到达顺序一定与发送顺序一致',
      '数据包不需要任何地址信息',
    ],
    answerIndex: 1,
    explanation: '数据包各自独立路由，可走不同路径（这就是冗余路由，提高可靠性）；到达后按编号重组。',
  },

  {
    day: 3,
    id: 'csp-3',
    subject: 'CSP',
    skill: '抽象分解',
    title: '抽象与分解',
    body: 'CSP 必考思维：抽象（abstraction）是隐藏复杂细节、只暴露必要接口；分解（decomposition）是把大问题拆成小问题。比如：点外卖 App 把"下单"抽象成按钮，内部其实包含选餐、支付、通知等多个模块。',
    question: '把一个大程序拆成多个独立函数分别实现，这体现了？',
    options: ['抽象', '分解', '加密', '压缩'],
    answerIndex: 1,
    explanation: '拆分成独立函数/模块是"分解"；"抽象"是隐藏实现细节（比如调用函数时不需要知道内部怎么写的）。两者常配合使用。',
  },

  {
    day: 4,
    id: 'csp-4',
    subject: 'CSP',
    skill: '算法效率',
    title: '算法效率（运行时间）',
    body: 'CSP 考算法效率：通常讨论最坏情况。线性搜索 O(n)，二分搜索 O(log n)，冒泡/选择排序 O(n²)。二分搜索要求数据已排序！用问题规模 n 来比较算法快慢，而不是具体秒数。',
    question: '在一个已排序的 100 万元素数组中查找一个值，用二分搜索大约需要多少次比较？',
    options: ['约 100 万次', '约 5000 次', '约 20 次', '约 100 次'],
    answerIndex: 2,
    explanation: '二分搜索每次排除一半，2^20 ≈ 100 万，所以约 20 次。这就是 O(log n) 的威力。',
  },

  {
    day: 5,
    id: 'csp-5',
    subject: 'CSP',
    skill: '网络安全',
    title: '网络安全基础',
    body: 'CSP 高频概念：对称加密（symmetric）双方用同一个密钥；非对称加密（asymmetric）用公钥加密、私钥解密（如 RSA）。HTTPS = HTTP + 加密，保护传输中的数据。钓鱼（phishing）是伪装成可信方骗取信息的社会工程攻击。',
    question: 'HTTPS 相比 HTTP 的主要优势是？',
    options: [
      '网站加载更快',
      '传输的数据经过加密，更难被窃听',
      '不需要互联网连接',
      '可以绕过防火墙',
    ],
    answerIndex: 1,
    explanation: 'HTTPS 在 HTTP 之上加了 TLS 加密层，防止数据在传输途中被窃听或篡改。',
  },

  {
    day: 6,
    id: 'csp-6',
    subject: 'CSP',
    skill: '数字鸿沟',
    title: '数字鸿沟与公平性',
    body: 'CSP 社会影响考点：数字鸿沟（digital divide）指不同群体在技术接入上的差距（设备、网络、技能）。计算创新可能放大或缩小差距。可访问性（accessibility）设计（如读屏器、大字体）让更多人能用上技术。',
    question: '下列哪项措施最有助于缩小数字鸿沟？',
    options: [
      '提高电脑价格',
      '在图书馆提供免费公共电脑和 Wi-Fi',
      '只发布英文软件',
      '要求必须使用最新款手机',
    ],
    answerIndex: 1,
    explanation: '提供免费公共设施让没有设备/网络的人也能使用技术，直接缩小接入差距。',
  },

  {
    day: 7,
    id: 'csp-7',
    subject: 'CSP',
    skill: '编程基础',
    title: '编程基础与创新',
    body: 'CSP 的编程部分：顺序、选择（if/else）、循环（iteration）是三大基本结构。变量存数据、列表存多个数据。Create Performance Task 要求：程序包含输入、输出、列表、过程/函数、条件逻辑、循环，展示你能用计算思维解决问题。',
    question: 'CSP Create Task 中，"把一段重复执行的代码封装成函数"主要体现了？',
    options: [
      '程序的输入',
      '过程的抽象（procedural abstraction）',
      '数据的压缩',
      '网络的冗余',
    ],
    answerIndex: 1,
    explanation: '把重复逻辑封装成函数（procedure）就是过程抽象，减少重复代码、提高可读性和可维护性。CPT 评分重点之一。',
  },
];

export const CALC_ITEMS: StudyItem[] = [
  {
    day: 1,
    id: 'calc-1',
    subject: 'CALC',
    skill: '导数',
    title: '导数是什么',
    body: 'AP Calculus AB 核心概念：导数（derivative）衡量函数在某一点的瞬时变化率，几何意义是切线的斜率。记法 f\'(x) 或 dy/dx。常考：用极限定义求导、幂法则 d/dx(x^n) = n·x^(n-1)。',
    question: 'f(x) = x² 在 x = 3 处的导数 f\'(3) 等于？',
    options: ['3', '6', '9', '2x'],
    answerIndex: 1,
    explanation: '幂法则：f\'(x) = 2x，所以 f\'(3) = 2×3 = 6。选项 2x 是导数表达式而不是在 x=3 处的值。',
  },
  {
    day: 2,
    id: 'calc-2',
    subject: 'CALC',
    skill: '极限',
    title: '极限与连续性',
    body: '极限（limit）描述函数趋近某点的行为。左极限 = 右极限 时极限存在。函数在 x=a 连续的条件：f(a) 有定义、极限存在、且极限 = f(a)。可去间断点（removable）和跳跃间断点（jump）是 FRQ 常客。',
    question: '函数 f(x) = (x²-1)/(x-1) 在 x = 1 处发生了什么？',
    options: ['极限不存在', '极限存在且等于 2，但有可去间断点', '函数连续', '极限为无穷大'],
    answerIndex: 1,
    explanation: '约分得 f(x) = x+1（x≠1），所以极限 lim = 2，但 x=1 处无定义，是可去间断点。',
  },
  {
    day: 3,
    id: 'calc-3',
    subject: 'CALC',
    skill: '链式法则',
    title: '链式法则',
    body: '链式法则（chain rule）：复合函数 f(g(x)) 的导数 = f\'(g(x)) · g\'(x)，即"外层求导，内层不动，再乘内层导数"。这是 AB 考试使用频率最高的求导法则。',
    question: 'h(x) = (3x+1)⁵ 的导数 h\'(x) 是？',
    options: ['5(3x+1)⁴', '15(3x+1)⁴', '5(3x+1)⁴·3', '15(3x+1)⁵'],
    answerIndex: 2,
    explanation: '外层 u⁵ 求导得 5u⁴，再乘内层导数 3：h\'(x) = 5(3x+1)⁴ × 3 = 15(3x+1)⁴。选项 B 漏乘了内层导数。',
  },

];

export const COURSES: Course[] = [
  {
    id: 'csa',
    name: 'AP Computer Science A',
    shortName: 'CSA',
    color: '#1CB0F6',
    description: 'Java 编程与面向对象：基本类型、String、ArrayList、二维数组、继承与多态',
    items: CSA_ITEMS,
  },
  {
    id: 'csp',
    name: 'AP Computer Science Principles',
    shortName: 'CSP',
    color: '#CE82FF',
    description: '计算机原理：二进制、互联网、算法效率、网络安全与计算的社会影响',
    items: CSP_ITEMS,
  },
  {
    id: 'calc',
    name: 'AP Calculus AB',
    shortName: 'CALC',
    color: '#FF9600',
    description: '微积分入门：导数、极限、链式法则',
    items: CALC_ITEMS,
  },
];

/** 内容起始日：从这一天开始按天轮换（第 1 天 → 今天） */
export const CONTENT_START = new Date(2025, 7, 30);

/** 按课程取"今天"的学习内容（超出后循环，保证每天都有内容） */
export function getTodayItem(course: Course, offsetDays = 0): StudyItem {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const start = new Date(CONTENT_START);
  start.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((now.getTime() - start.getTime()) / 86400000) + offsetDays;
  const items = course.items;
  const idx = ((diffDays % items.length) + items.length) % items.length;
  return items[idx];
}

export function getCourse(id: string | null): Course {
  return COURSES.find((c) => c.id === id) ?? COURSES[0];
}
