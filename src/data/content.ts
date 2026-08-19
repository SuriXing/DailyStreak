export interface StudyItem {
  day: number;
  subject: 'CSA' | 'CSP';
  title: string;
  body: string;
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
}

export const STUDY_CONTENT: StudyItem[] = [
  {
    day: 1,
    subject: 'CSA',
    title: 'Java 基本类型与变量',
    body: 'CSA 高频考点：Java 有 8 种基本类型（primitive types）。常考的有 int（整数）、double（小数）、boolean（布尔）、char（单个字符）。引用类型（String、数组、对象）存的是"地址"。注意 int/int 结果是整数除法：7/2 = 3，不是 3.5。',
    question: '执行 int x = 7 / 2; 后，x 的值是？',
    options: ['3.5', '3', '4', '编译错误'],
    answerIndex: 1,
    explanation: '两个 int 相除是整数除法，直接截断小数部分，7/2 = 3。想得到 3.5 需要写成 7.0 / 2 或 (double) 7 / 2。',
  },
  {
    day: 2,
    subject: 'CSP',
    title: '二进制与数据表示',
    body: 'CSP 核心概念：计算机所有数据底层都是 0 和 1（bit）。8 个 bit = 1 个 byte。二进制转十进制：从右往左每位 × 2^n。例如 1010₂ = 1×8 + 0×4 + 1×2 + 0×1 = 10。',
    question: '二进制数 1011 等于十进制的多少？',
    options: ['9', '11', '13', '15'],
    answerIndex: 1,
    explanation: '1011₂ = 1×8 + 0×4 + 1×2 + 1×1 = 8 + 0 + 2 + 1 = 11。',
  },
  {
    day: 3,
    subject: 'CSA',
    title: 'String 常用方法',
    body: 'String 是对象，方法调用不改变原字符串（不可变 immutable）。高频方法：length() 长度、substring(a,b) 截取（含 a 不含 b）、indexOf(s) 找位置（找不到返回 -1）、equals() 比较内容（== 比较地址，别用错！）。',
    question: 'String s = "banana"; s.indexOf("na") 的返回值是？',
    options: ['0', '2', '4', '-1'],
    answerIndex: 1,
    explanation: 'indexOf 返回第一次出现的位置（0 起）。"banana" 中 "na" 第一次出现在下标 2：b(0) a(1) n(2) a(3)。',
  },
  {
    day: 4,
    subject: 'CSP',
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
    day: 5,
    subject: 'CSA',
    title: 'ArrayList 操作',
    body: 'ArrayList 是可变长度列表（比数组灵活）。高频方法：add(x) 追加、add(i, x) 插入、get(i) 取值、set(i, x) 替换、remove(i) 删除、size() 长度。注意：remove 后元素会前移，索引会变！遍历删除时容易出 bug。',
    question: 'ArrayList<Integer> a = [10, 20, 30, 40]; 执行 a.remove(1); 后 a.get(1) 是？',
    options: ['20', '30', '40', '越界错误'],
    answerIndex: 1,
    explanation: 'remove(1) 删除下标 1 的元素 20，后面元素前移：[10, 30, 40]，所以新的 a.get(1) = 30。',
  },
  {
    day: 6,
    subject: 'CSP',
    title: '抽象与分解',
    body: 'CSP 必考思维：抽象（abstraction）是隐藏复杂细节、只暴露必要接口；分解（decomposition）是把大问题拆成小问题。比如：点外卖 App 把"下单"抽象成按钮，内部其实包含选餐、支付、通知等多个模块。',
    question: '把一个大程序拆成多个独立函数分别实现，这体现了？',
    options: ['抽象', '分解', '加密', '压缩'],
    answerIndex: 1,
    explanation: '拆分成独立函数/模块是"分解"；"抽象"是隐藏实现细节（比如调用函数时不需要知道内部怎么写的）。两者常配合使用。',
  },
  {
    day: 7,
    subject: 'CSA',
    title: 'for 循环与嵌套',
    body: 'CSA 高频考点：for (int i = 0; i < n; i++) 执行 n 次。嵌套循环总次数 = 外层 × 内层。二维数组遍历：外层行 i，内层列 j，arr[i][j]。注意边界条件（i < n 而不是 i <= n）。',
    question: '以下代码输出几次 "hi"？for (int i = 0; i < 3; i++) { for (int j = 0; j < 2; j++) { System.out.println("hi"); } }',
    options: ['3', '5', '6', '9'],
    answerIndex: 2,
    explanation: '外层 3 次 × 内层 2 次 = 6 次。',
  },
]; 中 a.length 的值是？',
    options: ['3', '4', '12', '编译错误'],
    answerIndex: 0,
    explanation: 'a.length 是第一维（行数）3；a[0].length 是第二维（列数）4；总元素 3×4=12。',
  },
  {
    day: 12,
    subject: 'CSP',
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
    day: 13,
    subject: 'CSA',
    title: '继承与多态',
    body: 'CSA 核心：子类（subclass）用 extends 继承父类（superclass）的成员，可重写方法实现多态（polymorphism）。父类引用可以指向子类对象：Animal a = new Dog(); 调用方法时执行子类版本（动态绑定）。super 关键字调用父类方法/构造器。',
    question: 'Animal a = new Dog(); 其中 Dog 重写了 speak()。a.speak() 执行的是？',
    options: ['Animal 的 speak()', 'Dog 的 speak()', '编译错误', '运行时错误'],
    answerIndex: 1,
    explanation: '多态：运行时根据对象实际类型（Dog）调用方法，这叫动态绑定（dynamic dispatch）。',
  },
  {
    day: 14,
    subject: 'CSP',
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

/** 根据起始日期取"今天"的学习内容（超出后循环，保证每天都有内容） */
export function getTodayItem(startDate: Date, offsetDays = 0): StudyItem {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  startDate.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((now.getTime() - startDate.getTime()) / 86400000) + offsetDays;
  const idx = ((diffDays % STUDY_CONTENT.length) + STUDY_CONTENT.length) % STUDY_CONTENT.length;
  return STUDY_CONTENT[idx];
}
