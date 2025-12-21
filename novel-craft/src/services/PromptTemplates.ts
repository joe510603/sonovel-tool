/**
 * PromptTemplates - 分析模式的 prompt 模板
 * 
 * 包含：
 * - 基础分析 prompt（所有模式共用）
 * - 标准模式额外 prompt
 * - 深度模式额外 prompt
 * - 类型特化 prompt
 */

import { AnalysisMode, NovelType } from '../types';

/**
 * 基础分析 prompt 模板
 * 所有模式都会使用这些 prompt
 */
export const BASE_PROMPTS = {
  /**
   * 故事梗概分析
   */
  synopsis: `你是一位专业的网络小说分析师。请根据以下小说内容，生成一份详细的故事梗概。

【重要提醒】
- 你要分析的是"这本小说本身"的故事，而不是小说中主角创作/参与的作品
- 如果小说讲的是主角写小说、拍电影、做游戏等，你要分析的是"主角的故事"，而不是主角作品的故事
- 故事梗概的标题应该使用这本小说的书名，不要使用小说中出现的其他作品名

要求：
1. 概述主要故事线和核心冲突（主角在做什么、遇到什么挑战）
2. 介绍故事的世界观设定（现实世界/异世界/游戏世界等）
3. 描述主角的起点和目标
4. 总结故事的主要转折点
5. 字数控制在 500-800 字

请以清晰、结构化的方式呈现，使用 Markdown 格式。`,

  /**
   * 人物分析
   */
  characters: `你是一位专业的网络小说分析师。请分析以下小说中的主要人物。

【重要提醒】
- 分析的是"这本小说"中的人物，而不是小说中主角创作的作品里的人物
- 如果主角是导演/作家/游戏制作人等，分析的是主角及其周围的人物，不是主角作品中的角色

分析维度：
1. 主角分析
   - 人物特点和魅力点设计
   - 性格优缺点
   - 成长弧线
   - 动机和目标

2. 重要配角分析
   - 角色功能性（推动剧情、制造冲突、提供助力等）
   - 与主角的关系
   - 人物特色

3. 反派/对手分析
   - 反派的动机合理性
   - 威胁等级设计
   - 与主角的对比

请以 JSON 格式输出，结构如下：
{
  "characters": [
    {
      "name": "角色名",
      "role": "protagonist/antagonist/supporting",
      "description": "角色描述",
      "motivation": "动机",
      "growthArc": "成长弧线（如有）",
      "relationships": ["与其他角色的关系"]
    }
  ]
}`,

  /**
   * 写作技法分析
   */
  techniques: `你是一位专业的网络小说写作教练。请分析以下小说中使用的写作技法。

分析维度：
1. 开局设计
   - 如何在前三章抓住读者
   - 悬念设置
   - 代入感营造

2. 节奏控制
   - 爽点密度和分布
   - 情绪起伏设计
   - 张弛有度的把控

3. 冲突设计
   - 矛盾升级手法
   - 反转技巧
   - 高潮设计

4. 金手指/系统设定
   - 设定的合理性
   - 成长曲线设计
   - 限制与突破

请以 JSON 格式输出，结构如下：
{
  "techniques": [
    {
      "name": "技法名称",
      "description": "技法描述",
      "examples": ["具体例子1", "具体例子2"],
      "applicability": "可借鉴场景"
    }
  ]
}`,

  /**
   * 可借鉴清单
   */
  takeaways: `你是一位专业的网络小说写作教练。基于对这部小说的分析，请生成一份可借鉴清单。

要求：
1. 列出 5-10 个具体可模仿的写法
2. 每个写法要有具体的操作建议
3. 说明适用场景
4. 给出原文中的参考位置（如有）

请以 JSON 数组格式输出：
{
  "takeaways": [
    "可借鉴点1：具体描述和操作建议",
    "可借鉴点2：具体描述和操作建议"
  ]
}`
};


/**
 * 标准模式额外 prompt 模板
 * 在快速模式基础上增加的分析维度
 */
export const STANDARD_PROMPTS = {
  /**
   * 情绪曲线分析
   */
  emotionCurve: `你是一位专业的网络小说分析师。请分析以下小说的情绪曲线。

分析要求：
1. 识别主要的情绪高点和低点
2. 分析情绪变化的节奏
3. 标注关键的爽点和虐点
4. 评估整体情绪设计的合理性

请以 JSON 格式输出，结构如下：
{
  "emotionCurve": [
    {
      "chapter": 章节号,
      "intensity": 情绪强度(1-10),
      "description": "情绪描述（爽点/虐点/平淡等）"
    }
  ]
}`,

  /**
   * 章节结构分析
   */
  chapterStructure: `你是一位专业的网络小说分析师。请分析以下小说的章节结构。

分析要求：
1. 总结每个章节的核心内容
2. 识别章节的功能（铺垫、高潮、过渡等）
3. 分析章节之间的衔接
4. 标注关键事件

请以 JSON 格式输出，结构如下：
{
  "chapterStructure": [
    {
      "index": 章节索引,
      "title": "章节标题",
      "summary": "章节摘要",
      "keyEvents": ["关键事件1", "关键事件2"]
    }
  ]
}`,

  /**
   * 伏笔分析
   */
  foreshadowing: `你是一位专业的网络小说分析师。请分析以下小说中的伏笔设计。

分析要求：
1. 识别已埋下的伏笔
2. 追踪伏笔的回收情况
3. 评估伏笔设计的巧妙程度
4. 指出未回收的伏笔（如有）

请以 JSON 格式输出，结构如下：
{
  "foreshadowing": [
    {
      "setupChapter": 埋设章节号,
      "payoffChapter": 回收章节号（如未回收则为 null）,
      "description": "伏笔描述",
      "status": "planted/resolved/abandoned"
    }
  ]
}`
};

/**
 * 深度模式额外 prompt 模板
 * 在标准模式基础上增加的分析维度
 */
export const DEEP_PROMPTS = {
  /**
   * 逐章拆解
   */
  chapterDetail: `你是一位专业的网络小说写作教练。请对以下章节进行深度拆解。

分析维度：
1. 章节结构分析
   - 开头如何吸引读者
   - 中间如何推进剧情
   - 结尾如何设置钩子

2. 写作技法识别
   - 使用了哪些技法
   - 技法的效果如何

3. 亮点提取
   - 精彩的描写
   - 巧妙的对话
   - 出色的节奏控制

请以 JSON 格式输出，结构如下：
{
  "chapterDetail": {
    "index": 章节索引,
    "title": "章节标题",
    "analysis": "详细分析",
    "techniques": ["使用的技法1", "使用的技法2"],
    "highlights": ["亮点1", "亮点2"]
  }
}`,

  /**
   * 写作复盘
   */
  writingReview: `你是一位专业的网络小说写作教练。请对这部小说进行整体写作复盘。

复盘维度：
1. 整体评价
   - 作品的优势和特色
   - 存在的不足和改进空间

2. 写作风格分析
   - 语言特点
   - 叙事风格
   - 节奏把控

3. 商业性分析
   - 读者吸引力
   - 付费点设计
   - 追更动力

4. 学习建议
   - 最值得学习的点
   - 需要避免的问题
   - 进阶提升方向

请以 Markdown 格式输出，字数控制在 1000-1500 字。`
};


/**
 * 类型特化 prompt 模板
 * 根据小说类型提供针对性的分析侧重点
 */
export const TYPE_SPECIFIC_PROMPTS: Record<string, string> = {
  /**
   * 都市文特化分析
   */
  urban: `在分析这部都市类型小说时，请特别关注以下维度：

1. 主角身份反差设计
   - 表面身份与真实身份的反差
   - 身份揭示的节奏和时机
   - 反差带来的爽感设计

2. 打脸装逼节奏
   - 打脸场景的设计
   - 装逼的层次递进
   - 配角的"捧哏"设计

3. 现实逻辑与爽感平衡
   - 如何在现实背景下制造爽点
   - 金手指的合理化包装
   - 社会规则的利用和突破

4. 都市元素运用
   - 商战、职场、豪门等元素的运用
   - 现代都市场景的描写
   - 社会热点的融入`,

  /**
   * 架空历史特化分析
   */
  'alternate-history': `在分析这部架空历史类型小说时，请特别关注以下维度：

1. 历史改编切入点
   - 选择的历史时期和背景
   - 与真实历史的关联和改编
   - 历史知识的运用

2. 金手指合理化包装
   - 穿越/重生设定的合理性
   - 现代知识的运用方式
   - 能力限制的设计

3. 势力博弈布局
   - 各方势力的设计
   - 政治博弈的描写
   - 权谋智斗的展现

4. 历史氛围营造
   - 时代特色的描写
   - 历史人物的塑造
   - 古代社会规则的展现`,

  /**
   * 玄幻特化分析
   */
  fantasy: `在分析这部玄幻类型小说时，请特别关注以下维度：

1. 修炼体系设计
   - 境界划分的合理性
   - 战力体系的清晰度
   - 突破设计的爽感

2. 世界观构建
   - 世界设定的完整性
   - 势力分布的合理性
   - 地图和场景的设计

3. 战斗描写
   - 战斗场面的精彩程度
   - 技能和法术的设计
   - 战斗节奏的把控

4. 机缘和宝物设计
   - 机缘获取的合理性
   - 宝物体系的设计
   - 资源争夺的设计`,

  /**
   * 仙侠特化分析
   */
  xianxia: `在分析这部仙侠类型小说时，请特别关注以下维度：

1. 修仙体系设计
   - 修仙境界的划分
   - 功法和法宝的设计
   - 天劫和飞升的设定

2. 仙侠世界观
   - 仙界、人界、魔界的设定
   - 宗门势力的分布
   - 天道规则的设计

3. 仙侠氛围营造
   - 仙气飘飘的描写
   - 道法自然的理念
   - 因果轮回的运用

4. 情感与道心
   - 情劫的设计
   - 道心的考验
   - 红尘历练的描写`,

  /**
   * 武侠特化分析
   */
  wuxia: `在分析这部武侠类型小说时，请特别关注以下维度：

1. 武功体系设计
   - 武功招式的描写
   - 内功心法的设定
   - 武学境界的划分

2. 江湖世界观
   - 门派势力的设计
   - 江湖规矩的展现
   - 武林大会等经典场景

3. 侠义精神
   - 侠之大者的体现
   - 恩怨情仇的处理
   - 快意恩仇的描写

4. 武侠氛围
   - 古风场景的描写
   - 江湖儿女的塑造
   - 刀光剑影的战斗`,

  /**
   * 科幻特化分析
   */
  scifi: `在分析这部科幻类型小说时，请特别关注以下维度：

1. 科技设定
   - 科技体系的合理性
   - 硬科幻/软科幻的定位
   - 科技对社会的影响

2. 世界观构建
   - 未来社会的设定
   - 星际文明的设计
   - 科技发展的逻辑

3. 科幻元素运用
   - 人工智能、基因改造等元素
   - 时空穿越、平行宇宙等概念
   - 科技伦理的探讨

4. 科幻氛围
   - 未来感的营造
   - 科技细节的描写
   - 宏大场景的展现`,

  /**
   * 游戏特化分析
   */
  game: `在分析这部游戏类型小说时，请特别关注以下维度：

1. 游戏系统设计
   - 等级、技能、装备系统
   - 任务和副本设计
   - 数值成长的合理性

2. 游戏世界观
   - 游戏背景的设定
   - NPC和怪物的设计
   - 游戏规则的展现

3. 玩家互动
   - PVP和PVE的设计
   - 公会和团队的描写
   - 游戏社交的展现

4. 游戏爽点
   - 爆装备、升级的爽感
   - 竞技对战的刺激
   - 游戏成就的满足`,

  /**
   * 历史特化分析
   */
  historical: `在分析这部历史类型小说时，请特别关注以下维度：

1. 历史还原度
   - 历史事件的准确性
   - 历史人物的塑造
   - 时代背景的描写

2. 历史改编
   - 虚构与史实的平衡
   - 历史走向的改变
   - 蝴蝶效应的运用

3. 历史氛围
   - 时代特色的展现
   - 古代生活的描写
   - 历史文化的融入

4. 历史智慧
   - 权谋智斗的展现
   - 历史规律的揭示
   - 以史为鉴的思考`,

  /**
   * 军事特化分析
   */
  military: `在分析这部军事类型小说时，请特别关注以下维度：

1. 军事设定
   - 军事体系的设计
   - 武器装备的描写
   - 战术战略的展现

2. 战争场面
   - 战斗场景的描写
   - 战争规模的把控
   - 战争残酷性的展现

3. 军人形象
   - 军人精神的塑造
   - 战友情谊的描写
   - 军人成长的刻画

4. 军事氛围
   - 军营生活的描写
   - 军事术语的运用
   - 热血燃情的营造`,

  /**
   * 竞技特化分析
   */
  sports: `在分析这部竞技类型小说时，请特别关注以下维度：

1. 竞技设定
   - 比赛规则的设计
   - 技能体系的构建
   - 等级排名的设定

2. 比赛描写
   - 比赛场面的精彩度
   - 技术动作的描写
   - 比赛节奏的把控

3. 成长线
   - 主角的成长轨迹
   - 训练过程的描写
   - 突破瓶颈的设计

4. 竞技精神
   - 热血燃情的营造
   - 团队合作的展现
   - 永不放弃的精神`,

  /**
   * 灵异特化分析
   */
  supernatural: `在分析这部灵异类型小说时，请特别关注以下维度：

1. 灵异设定
   - 鬼怪体系的设计
   - 灵异规则的设定
   - 能力体系的构建

2. 恐怖氛围
   - 恐怖场景的营造
   - 悬疑气氛的把控
   - 惊悚节奏的设计

3. 灵异元素
   - 民俗传说的运用
   - 灵异事件的设计
   - 因果报应的展现

4. 主角设定
   - 特殊能力的设计
   - 驱鬼除魔的描写
   - 成长线的设计`,

  /**
   * 言情特化分析
   */
  romance: `在分析这部言情类型小说时，请特别关注以下维度：

1. 感情线设计
   - 男女主的相遇
   - 感情发展的节奏
   - 情感冲突的设计

2. 人物塑造
   - 男主的魅力点
   - 女主的性格特点
   - 配角的功能性

3. 甜虐设计
   - 甜蜜场景的描写
   - 虐心情节的设计
   - 甜虐比例的把控

4. 言情氛围
   - 浪漫场景的营造
   - 情感描写的细腻度
   - 心理活动的刻画`,

  /**
   * 自定义类型的通用分析框架
   */
  custom: `请根据这部小说的具体类型特点进行针对性分析：

1. 类型特色识别
   - 识别小说的核心类型元素
   - 分析类型套路的运用

2. 创新点分析
   - 相比同类作品的创新之处
   - 独特的设定或写法

3. 类型读者期待
   - 是否满足类型读者的核心期待
   - 爽点设计是否符合类型特点

4. 类型写作建议
   - 针对该类型的写作建议
   - 可以借鉴的类型技巧`
};

/**
 * 系统 prompt - 设定 AI 的角色和基本要求
 */
export const SYSTEM_PROMPT = `你是一位专业的网络小说分析师和写作教练，专注于帮助网文写作学习者提升写作技巧。

你的分析特点：
1. 专业性：从写作技法角度进行分析，而非普通读者视角
2. 实用性：注重可借鉴、可模仿的具体技巧
3. 结构化：输出清晰、有条理的分析结果
4. 客观性：既指出优点也指出不足

分析时请注意：
- 使用网文圈的专业术语（如爽点、虐点、金手指、打脸等）
- 关注商业网文的核心要素（代入感、爽感、追更动力）
- 给出具体的、可操作的建议
- 适当引用原文作为例证`;

/**
 * 获取完整的分析 prompt
 * @param mode 分析模式
 * @param novelType 小说类型
 * @param stage 分析阶段
 * @param customPrompts 自定义提示词（可选）
 * @param customTypePrompts 自定义类型提示词（可选）
 * @returns 完整的 prompt
 */
export function getAnalysisPrompt(
  mode: AnalysisMode,
  novelType: NovelType,
  stage: keyof typeof BASE_PROMPTS | keyof typeof STANDARD_PROMPTS | keyof typeof DEEP_PROMPTS,
  customPrompts?: Record<string, string>,
  customTypePrompts?: Record<string, string>
): string {
  let prompt = '';

  // 检查是否有自定义提示词
  if (customPrompts && customPrompts[stage]) {
    prompt = customPrompts[stage];
  }
  // 基础 prompt
  else if (stage in BASE_PROMPTS) {
    prompt = BASE_PROMPTS[stage as keyof typeof BASE_PROMPTS];
  }
  // 标准模式 prompt
  else if (stage in STANDARD_PROMPTS && (mode === 'standard' || mode === 'deep')) {
    prompt = STANDARD_PROMPTS[stage as keyof typeof STANDARD_PROMPTS];
  }
  // 深度模式 prompt
  else if (stage in DEEP_PROMPTS && mode === 'deep') {
    prompt = DEEP_PROMPTS[stage as keyof typeof DEEP_PROMPTS];
  }

  // 添加类型特化提示
  if (novelType !== 'custom') {
    // 检查是否有自定义类型提示词
    const typePrompt = (customTypePrompts && customTypePrompts[novelType]) 
      || TYPE_SPECIFIC_PROMPTS[novelType] 
      || TYPE_SPECIFIC_PROMPTS.custom;
    prompt += `\n\n${typePrompt}`;
  }

  return prompt;
}

/**
 * 获取分析阶段列表
 * @param mode 分析模式
 * @returns 需要执行的分析阶段列表
 */
export function getAnalysisStages(mode: AnalysisMode): string[] {
  const stages: string[] = ['synopsis', 'characters', 'techniques', 'takeaways'];

  if (mode === 'standard' || mode === 'deep') {
    stages.push('emotionCurve', 'chapterStructure', 'foreshadowing');
  }

  if (mode === 'deep') {
    stages.push('chapterDetail', 'writingReview');
  }

  return stages;
}

/**
 * 获取阶段的中文名称
 */
export function getStageName(stage: string): string {
  const names: Record<string, string> = {
    synopsis: '故事梗概',
    characters: '人物分析',
    techniques: '写作技法',
    takeaways: '可借鉴清单',
    emotionCurve: '情绪曲线',
    chapterStructure: '章节结构',
    foreshadowing: '伏笔分析',
    chapterDetail: '逐章拆解',
    writingReview: '写作复盘'
  };
  return names[stage] || stage;
}

/**
 * 获取小说类型的中文名称
 */
export function getNovelTypeName(type: string): string {
  const names: Record<string, string> = {
    urban: '都市',
    fantasy: '玄幻',
    xianxia: '仙侠',
    wuxia: '武侠',
    scifi: '科幻',
    game: '游戏',
    'alternate-history': '架空历史',
    historical: '历史',
    military: '军事',
    sports: '竞技',
    supernatural: '灵异',
    romance: '言情',
    custom: '自定义'
  };
  return names[type] || type;
}

/**
 * 获取所有小说类型列表
 */
export function getAllNovelTypes(): { value: string; label: string }[] {
  return [
    { value: 'urban', label: '都市' },
    { value: 'fantasy', label: '玄幻' },
    { value: 'xianxia', label: '仙侠' },
    { value: 'wuxia', label: '武侠' },
    { value: 'scifi', label: '科幻' },
    { value: 'game', label: '游戏' },
    { value: 'alternate-history', label: '架空历史' },
    { value: 'historical', label: '历史' },
    { value: 'military', label: '军事' },
    { value: 'sports', label: '竞技' },
    { value: 'supernatural', label: '灵异' },
    { value: 'romance', label: '言情' },
    { value: 'custom', label: '自定义' }
  ];
}

/**
 * 获取所有提示词阶段
 */
export function getAllPromptStages(): { key: string; name: string; category: string }[] {
  return [
    { key: 'system', name: '系统提示词', category: '基础' },
    { key: 'synopsis', name: '故事梗概', category: '基础' },
    { key: 'characters', name: '人物分析', category: '基础' },
    { key: 'techniques', name: '写作技法', category: '基础' },
    { key: 'takeaways', name: '可借鉴清单', category: '基础' },
    { key: 'emotionCurve', name: '情绪曲线', category: '标准' },
    { key: 'chapterStructure', name: '章节结构', category: '标准' },
    { key: 'foreshadowing', name: '伏笔分析', category: '标准' },
    { key: 'chapterDetail', name: '逐章拆解', category: '深度' },
    { key: 'writingReview', name: '写作复盘', category: '深度' }
  ];
}

/**
 * 获取默认提示词
 */
export function getDefaultPrompt(stage: string): string {
  if (stage === 'system') {
    return SYSTEM_PROMPT;
  }
  if (stage in BASE_PROMPTS) {
    return BASE_PROMPTS[stage as keyof typeof BASE_PROMPTS];
  }
  if (stage in STANDARD_PROMPTS) {
    return STANDARD_PROMPTS[stage as keyof typeof STANDARD_PROMPTS];
  }
  if (stage in DEEP_PROMPTS) {
    return DEEP_PROMPTS[stage as keyof typeof DEEP_PROMPTS];
  }
  return '';
}

/**
 * 获取类型特化提示词
 */
export function getTypePrompt(novelType: string): string {
  return TYPE_SPECIFIC_PROMPTS[novelType] || TYPE_SPECIFIC_PROMPTS.custom;
}

/**
 * 获取系统提示词（支持自定义）
 */
export function getSystemPrompt(customPrompts?: Record<string, string>): string {
  if (customPrompts && customPrompts['system']) {
    return customPrompts['system'];
  }
  return SYSTEM_PROMPT;
}
