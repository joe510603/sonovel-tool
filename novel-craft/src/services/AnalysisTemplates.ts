/**
 * 分析模板系统
 * 
 * 提供故事单元AI分析的模板定义，包括：
 * - 七步故事法模板（默认）- 按拆书表格格式
 * - 自定义模板支持
 * 
 * Requirements: 1.5
 */

/**
 * 分析模板步骤定义
 */
export interface AnalysisTemplateStep {
  /** 步骤ID */
  id: string;
  /** 步骤名称 */
  name: string;
  /** 步骤描述 */
  description: string;
  /** 分析提示词 */
  prompt: string;
  /** 显示顺序 */
  order: number;
  /** 分类：basic=基础元素, extra=附加元素 */
  category: 'basic' | 'extra';
}

/**
 * 分析模板定义
 */
export interface AnalysisTemplate {
  /** 模板ID */
  id: string;
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description: string;
  /** 是否为内置模板 */
  isBuiltin: boolean;
  /** 模板步骤列表 */
  steps: AnalysisTemplateStep[];
  /** 是否包含人物关系分析 */
  includeCharacterRelations?: boolean;
  /** 是否生成故事梗概 */
  includeSummary?: boolean;
  /** 是否生成情绪折线 */
  includeEmotionCurve?: boolean;
  /** 创建时间 */
  createTime?: number;
  /** 更新时间 */
  updateTime?: number;
}

/**
 * 七步故事法模板（默认模板）
 * 
 * 网文爽点循环结构，按拆书表格格式
 * 基础元素：主角优势、反派+信息差、初次摩擦、负面预期、高潮反杀、震惊反应、收获+升级
 * 附加元素：伏笔线索
 * 
 * 注意：人脉关系网、情绪折线 移到基本信息标签页显示
 */
export const SEVEN_STEP_STORY_TEMPLATE: AnalysisTemplate = {
  id: 'seven-step-story',
  name: '七步故事法',
  description: '网文爽点循环结构拆书模板，分析主角优势→反派+信息差→初次摩擦→负面预期→高潮反杀→震惊反应→收获+升级的完整循环。',
  isBuiltin: true,
  includeCharacterRelations: true,
  // 是否生成故事梗概
  includeSummary: true,
  // 是否生成情绪折线
  includeEmotionCurve: true,
  steps: [
    // ========== 基础元素 ==========
    {
      id: 'step1-advantage',
      name: '主角优势',
      description: '主角的隐藏实力、道具、潜力等优势',
      category: 'basic',
      prompt: `分析【主角优势】，只输出精简关键词，不超过20字。

格式示例：隐藏金丹修为，持有上古炼器术

如果没有找到，输出：无`,
      order: 1
    },
    {
      id: 'step2-villain-info',
      name: '反派+信息差',
      description: '反派出场及其对主角的错误认知',
      category: 'basic',
      prompt: `分析【反派+信息差】，只输出精简关键词，不超过25字。

格式示例：长老之子（筑基），误认主角炼气期，想抢资源

如果没有找到，输出：无`,
      order: 2
    },
    {
      id: 'step3-friction',
      name: '初次摩擦',
      description: '主角与反派势力的初次冲突',
      category: 'basic',
      prompt: `分析【初次摩擦】，只输出精简关键词，不超过20字。

格式示例：手下挑衅→主角打脸→反派记恨

如果没有找到，输出：无`,
      order: 3
    },
    {
      id: 'step4-negative-expect',
      name: '负面预期',
      description: '周围人对主角的负面预期',
      category: 'basic',
      prompt: `分析【负面预期】，只输出精简关键词，不超过20字。

格式示例：众人看衰，认为必败

如果没有找到，输出：无`,
      order: 4
    },
    {
      id: 'step5-climax',
      name: '高潮反杀',
      description: '主角反杀反派的高潮情节',
      category: 'basic',
      prompt: `分析【高潮反杀】，只输出精简关键词，不超过30字。

格式示例：三次反转（展法器→露功法→点弱点）秒败反派

如果没有找到，输出：无`,
      order: 5
    },
    {
      id: 'step6-shock',
      name: '震惊反应',
      description: '周围人对主角表现的震惊反应',
      category: 'basic',
      prompt: `分析【震惊反应】，只输出精简关键词，不超过20字。

格式示例：同门震惊→长老侧目→宗主召见

如果没有找到，输出：无`,
      order: 6
    },
    {
      id: 'step7-reward',
      name: '收获+升级',
      description: '主角获得的收获和阶层提升',
      category: 'basic',
      prompt: `分析【收获+升级】，只输出精简关键词，不超过25字。

格式示例：夺宝物（基础），入内门（超额），阶层↑

如果没有找到，输出：无`,
      order: 7
    },
    // ========== 附加元素 ==========
    {
      id: 'extra-foreshadow',
      name: '伏笔线索',
      description: '埋下的伏笔和线索',
      category: 'extra',
      prompt: `分析【伏笔线索】，只输出精简关键词，不超过25字。

格式示例：内门秘境伏笔，与主角炼器术相关

如果没有找到，输出：无`,
      order: 8
    }
  ]
};


/**
 * 三幕式结构模板
 */
export const THREE_ACT_TEMPLATE: AnalysisTemplate = {
  id: 'three-act-structure',
  name: '三幕式结构',
  description: '基于好莱坞经典三幕式结构的分析方法，将故事分为建置、对抗、解决三个部分。',
  isBuiltin: true,
  steps: [
    {
      id: 'setup',
      name: '建置（第一幕）',
      description: '介绍角色、世界观和核心冲突',
      category: 'basic',
      prompt: `请分析这段故事的建置部分：
1. 主要角色是如何被介绍的？
2. 故事的世界观/背景设定是什么？
3. 核心冲突是什么？
4. 有什么"激励事件"推动主角行动？

请结合原文内容进行分析。`,
      order: 1
    },
    {
      id: 'confrontation',
      name: '对抗（第二幕）',
      description: '主角面对挑战、经历成长',
      category: 'basic',
      prompt: `请分析这段故事的对抗部分：
1. 主角面临哪些主要挑战？
2. 主角如何应对这些挑战？
3. 有哪些"中点"事件改变了故事走向？
4. 主角经历了怎样的成长或变化？

请结合原文内容进行分析。`,
      order: 2
    },
    {
      id: 'resolution',
      name: '解决（第三幕）',
      description: '高潮和结局',
      category: 'basic',
      prompt: `请分析这段故事的解决部分：
1. 故事的高潮是什么？
2. 核心冲突是如何解决的？
3. 主角最终的状态如何？
4. 故事传达了什么主题或信息？

请结合原文内容进行分析。`,
      order: 3
    }
  ]
};

/**
 * 网文爽点分析模板
 */
export const WEB_NOVEL_TEMPLATE: AnalysisTemplate = {
  id: 'web-novel-analysis',
  name: '网文爽点分析',
  description: '专门针对网络小说的爽点分析，关注代入感、爽感、节奏等网文核心要素。',
  isBuiltin: true,
  steps: [
    {
      id: 'hook',
      name: '钩子设计',
      description: '吸引读者继续阅读的设计',
      category: 'basic',
      prompt: `请分析这段故事的钩子设计：
1. 开头如何吸引读者？
2. 有哪些悬念设置？
3. 章节结尾的钩子是什么？

请结合原文内容进行分析。`,
      order: 1
    },
    {
      id: 'cool-points',
      name: '爽点设计',
      description: '让读者感到爽快的情节',
      category: 'basic',
      prompt: `请分析这段故事的爽点：
1. 有哪些让人感到爽快的情节？
2. 爽点的类型是什么？（打脸、升级、获宝等）
3. 爽点的密度和节奏如何？

请结合原文内容进行分析。`,
      order: 2
    },
    {
      id: 'pacing',
      name: '节奏把控',
      description: '故事节奏的控制',
      category: 'basic',
      prompt: `请分析节奏把控：
1. 故事节奏是快是慢？
2. 张弛有度的设计如何？
3. 是否有拖沓或仓促的地方？

请结合原文内容进行分析。`,
      order: 3
    }
  ]
};

/**
 * 内置模板列表
 */
export const BUILTIN_TEMPLATES: AnalysisTemplate[] = [
  SEVEN_STEP_STORY_TEMPLATE,
  THREE_ACT_TEMPLATE,
  WEB_NOVEL_TEMPLATE
];

/**
 * 自定义模板存储（运行时）
 */
let customTemplates: AnalysisTemplate[] = [];

/**
 * 获取所有可用模板
 */
export function getAllTemplates(): AnalysisTemplate[] {
  return [...BUILTIN_TEMPLATES, ...customTemplates];
}

/**
 * 根据ID获取模板
 */
export function getTemplateById(id: string): AnalysisTemplate | undefined {
  return getAllTemplates().find(t => t.id === id);
}

/**
 * 添加自定义模板
 */
export function addCustomTemplate(template: Omit<AnalysisTemplate, 'isBuiltin' | 'createTime' | 'updateTime'>): AnalysisTemplate {
  const now = Date.now();
  const newTemplate: AnalysisTemplate = {
    ...template,
    isBuiltin: false,
    createTime: now,
    updateTime: now
  };
  
  if (getTemplateById(template.id)) {
    throw new Error(`模板ID "${template.id}" 已存在`);
  }
  
  customTemplates.push(newTemplate);
  return newTemplate;
}

/**
 * 更新自定义模板
 */
export function updateCustomTemplate(
  id: string, 
  updates: Partial<Omit<AnalysisTemplate, 'id' | 'isBuiltin' | 'createTime'>>
): boolean {
  const index = customTemplates.findIndex(t => t.id === id);
  if (index === -1) return false;
  
  customTemplates[index] = {
    ...customTemplates[index],
    ...updates,
    updateTime: Date.now()
  };
  return true;
}

/**
 * 删除自定义模板
 */
export function deleteCustomTemplate(id: string): boolean {
  const index = customTemplates.findIndex(t => t.id === id);
  if (index === -1) return false;
  customTemplates.splice(index, 1);
  return true;
}

/**
 * 加载自定义模板
 */
export function loadCustomTemplates(templates: AnalysisTemplate[]): void {
  customTemplates = templates.filter(t => !t.isBuiltin);
}

/**
 * 获取自定义模板列表
 */
export function getCustomTemplates(): AnalysisTemplate[] {
  return [...customTemplates];
}
