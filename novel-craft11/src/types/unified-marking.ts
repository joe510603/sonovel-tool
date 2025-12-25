/**
 * 统一标记系统 - 类型定义
 * 
 * 将传统标记（单点）和交互式标记（范围）统一为一套数据模型
 */

// ============ 基础位置类型 ============

/**
 * 文本位置
 */
export interface TextPosition {
  /** 章节索引 (0-based) */
  chapterIndex: number;
  /** 段落索引 (0-based) */
  paragraphIndex: number;
  /** 字符偏移量 */
  characterOffset: number;
}

/**
 * 文本范围
 */
export interface TextRange {
  /** 起始位置 */
  start: TextPosition;
  /** 结束位置（单点标记时与 start 相同） */
  end: TextPosition;
  /** 原文快照 */
  textSnapshot: string;
}

// ============ 标记类型 ============

/**
 * 标记模式
 * - point: 单点标记
 * - range: 范围标记（单一连续范围）
 * - story-unit: 故事单元（可跨章节的多段选择）
 */
export type MarkMode = 'point' | 'range' | 'story-unit';

/**
 * 故事单元选区
 * 支持跨章节的多段选择
 */
export interface StoryUnitSelection {
  /** 选区ID */
  id: string;
  /** 章节索引 */
  chapterIndex: number;
  /** 章节标题 */
  chapterTitle?: string;
  /** 文本范围 */
  range: TextRange;
  /** 排序顺序 */
  order: number;
}

/**
 * 分析模板类型
 */
export type AnalysisTemplateType = 
  | 'seven-step'           // 7步法（网文爽点循环）
  | 'three-act'            // 三幕式
  | 'conflict-resolution'  // 冲突-解决
  | 'custom';              // 自定义

/**
 * 主标记类型
 */
export type UnifiedMarkType = 
  | 'story'      // 故事情节
  | 'structure'  // 结构标记
  | 'character'  // 人物
  | 'setting'    // 设定
  | 'level'      // 境界
  | 'scene'      // 场景
  | 'material'   // 素材
  | 'custom';    // 自定义

/**
 * 故事情节子类型
 */
export type StorySubType = 
  | 'main'        // 主线
  | 'sub'         // 支线
  | 'independent' // 独立故事
  | 'custom';

/**
 * 结构子类型
 */
export type StructureSubType =
  | 'goal'        // 目标
  | 'action'      // 行动
  | 'result'      // 结果
  | 'accident'    // 意外
  | 'gain'        // 收获
  | 'foreshadow'  // 伏笔
  | 'twist';      // 转折

/**
 * 人物子类型
 */
export type CharacterSubType =
  | 'debut'       // 首次出场
  | 'personality' // 性格塑造
  | 'relation'    // 关系变化
  | 'highlight'   // 高光时刻
  | 'ending';     // 结局

/**
 * 设定子类型
 */
export type SettingSubType =
  | 'worldview'   // 世界观
  | 'rules'       // 规则体系
  | 'background'  // 背景信息
  | 'faction'     // 势力介绍
  | 'realm'       // 境界设定
  | 'technique'   // 功法体系
  | 'item';       // 道具设定

/**
 * 境界子类型
 */
export type LevelSubType =
  | 'breakthrough'  // 境界突破
  | 'ability'       // 能力获得
  | 'display';      // 实力展示

/**
 * 场景子类型
 */
export type SceneSubType =
  | 'conflict'    // 冲突
  | 'foreshadow'  // 铺垫
  | 'climax'      // 高潮
  | 'twist'       // 转折
  | 'resolution'; // 解决

/**
 * 素材子类型
 */
export type MaterialSubType =
  | 'quote'       // 金句
  | 'joke'        // 段子
  | 'technique'   // 技法
  | 'scene';      // 场景描写

/**
 * 所有子类型联合
 */
export type UnifiedSubType =
  | StorySubType
  | StructureSubType
  | CharacterSubType
  | SettingSubType
  | LevelSubType
  | SceneSubType
  | MaterialSubType
  | string;

// ============ 标记元数据 ============

/**
 * 标记视觉样式
 */
export interface MarkVisualStyle {
  /** 颜色 */
  color: string;
  /** 边框样式 */
  borderStyle: 'solid' | 'dashed' | 'dotted';
  /** 嵌套层级 */
  layer: number;
}

/**
 * 标记关联
 */
export interface MarkAssociations {
  /** 关联人物名称 */
  characterName?: string;
  /** 关联设定名称 */
  settingName?: string;
  /** 关联境界名称 */
  levelName?: string;
  /** 关联的其他标记 ID */
  linkedMarkIds: string[];
  /** 标签 */
  tags: string[];
}

// ============ 统一标记 ============

/**
 * 统一标记
 */
export interface UnifiedMark {
  /** 唯一标识 */
  id: string;
  /** 所属书籍 ID */
  bookId: string;
  /** 标记模式 */
  mode: MarkMode;
  /** 文本范围（point/range 模式使用） */
  range: TextRange;
  /** 多段选区（story-unit 模式使用） */
  selections?: StoryUnitSelection[];
  /** 主类型 */
  type: UnifiedMarkType;
  /** 子类型 */
  subType?: UnifiedSubType;
  /** 分类名称（用于显示） */
  category: string;
  /** 故事单元名称 */
  unitName?: string;
  /** 备注 */
  note?: string;
  /** 关联信息 */
  associations: MarkAssociations;
  /** 视觉样式 */
  style: MarkVisualStyle;
  /** 提取的内容（范围标记） */
  content?: string;
  /** 使用的分析模板 */
  analysisTemplate?: AnalysisTemplateType;
  /** AI 分析结果 */
  analysisResult?: MarkAnalysisResult;
  /** 是否加入全局素材库 */
  inGlobalLibrary?: boolean;
  /** 全局素材库ID */
  globalLibraryId?: string;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

/**
 * AI 分析结果
 */
export interface MarkAnalysisResult {
  /** 使用的模板 ID */
  templateId?: string;
  /** 分析摘要 */
  summary: string;
  /** 7步法分析结果 */
  sevenStep?: SevenStepAnalysis;
  /** 三幕式分析结果 */
  threeAct?: ThreeActAnalysis;
  /** 冲突-解决分析结果 */
  conflictResolution?: ConflictResolutionAnalysis;
  /** 自定义分析结果 */
  customAnalysis?: Record<string, string>;
  /** 情绪曲线 */
  emotionCurve?: EmotionPoint[];
  /** 角色作用 */
  characterRoles?: CharacterRole[];
  /** 写作技法 */
  techniques?: WritingTechnique[];
  /** 可借鉴点 */
  takeaways?: string[];
  /** 分析时间 */
  analyzedAt: Date;
}

/**
 * 7步法分析结果（网文爽点循环）
 */
export interface SevenStepAnalysis {
  /** ①主角优势：主角有优势/很牛逼，或有潜力发展空间 */
  step1_advantage: string;
  /** ②反派出场：反派出场，制造信息差，抬逼格拉期待 */
  step2_villain: string;
  /** ③摩擦交集：主角与反派势力有交集摩擦，主角不吃亏但被盯上 */
  step3_friction: string;
  /** ④拉期待：反派行动，配角/围观群众不看好主角 */
  step4_expectation: string;
  /** ⑤冲突爆发：冲突爆发，反派出手被主角爆杀（可能有反转） */
  step5_climax: string;
  /** ⑥震惊四座：主角表现震惊亲朋好友、围观群众、反派后台 */
  step6_shock: string;
  /** ⑦收获奖励：获得收获奖励，继续震惊围观者，等级/阶层提升 */
  step7_reward: string;
}

/**
 * 三幕式分析结果
 */
export interface ThreeActAnalysis {
  /** 第一幕：建置 */
  act1_setup: {
    introduction: string;      // 人物介绍
    incitingIncident: string;  // 激励事件
  };
  /** 第二幕：对抗 */
  act2_confrontation: {
    risingAction: string;      // 上升动作
    midpoint: string;          // 中点
    complications: string;     // 复杂化
  };
  /** 第三幕：解决 */
  act3_resolution: {
    climax: string;            // 高潮
    fallingAction: string;     // 下降动作
    denouement: string;        // 结局
  };
}

/**
 * 冲突-解决分析结果
 */
export interface ConflictResolutionAnalysis {
  /** 冲突设置 */
  conflictSetup: string;
  /** 冲突升级 */
  escalation: string;
  /** 高潮对决 */
  climax: string;
  /** 解决方案 */
  resolution: string;
  /** 后续影响 */
  aftermath: string;
}

/**
 * 情绪节点
 */
export interface EmotionPoint {
  position: number;
  intensity: number;
  type: 'tension' | 'relief' | 'excitement' | 'suspense';
  description: string;
}

/**
 * 角色作用
 */
export interface CharacterRole {
  characterName: string;
  role: 'protagonist' | 'antagonist' | 'supporting' | 'crowd';
  function: string;
}

/**
 * 写作技法
 */
export interface WritingTechnique {
  name: string;
  description: string;
  effect: string;
}

// ============ 存储格式 ============

/**
 * 统一标记存储
 */
export interface UnifiedMarkStorage {
  /** 存储版本 */
  version: string;
  /** 书籍 ID */
  bookId: string;
  /** 书籍标题 */
  bookTitle: string;
  /** 标记列表 */
  marks: UnifiedMark[];
  /** 最后更新时间 */
  lastUpdated: string;
}

// ============ 查询和过滤 ============

/**
 * 标记过滤条件
 */
export interface MarkFilter {
  /** 标记模式 */
  mode?: MarkMode;
  /** 主类型 */
  type?: UnifiedMarkType;
  /** 子类型 */
  subType?: UnifiedSubType;
  /** 章节索引 */
  chapterIndex?: number;
  /** 关联人物 */
  characterName?: string;
  /** 关联设定 */
  settingName?: string;
  /** 搜索关键词 */
  searchQuery?: string;
  /** 标签 */
  tags?: string[];
}

/**
 * 排序选项
 */
export interface MarkSortOptions {
  /** 排序字段 */
  sortBy: 'time' | 'chapter' | 'type';
  /** 排序方向 */
  sortOrder: 'asc' | 'desc';
}

/**
 * 标记统计
 */
export interface MarkStatistics {
  /** 总数 */
  total: number;
  /** 按模式统计 */
  byMode: Record<MarkMode, number>;
  /** 按类型统计 */
  byType: Record<UnifiedMarkType, number>;
  /** 按章节统计 */
  byChapter: Record<number, number>;
}

// ============ 类型配置 ============

/**
 * 类型显示配置
 */
export interface TypeDisplayConfig {
  label: string;
  icon: string;
  color: string;
  description?: string;
}

/**
 * 主类型配置
 */
export const UNIFIED_TYPE_CONFIGS: Record<UnifiedMarkType, TypeDisplayConfig> = {
  story: { label: '故事情节', icon: '📖', color: '#FF6B6B' },
  structure: { label: '结构', icon: '📐', color: '#9B59B6' },
  character: { label: '人物', icon: '👤', color: '#96CEB4' },
  setting: { label: '设定', icon: '🌍', color: '#4ECDC4' },
  level: { label: '境界', icon: '⬆️', color: '#F39C12' },
  scene: { label: '场景', icon: '🎬', color: '#45B7D1' },
  material: { label: '素材', icon: '✨', color: '#E74C3C' },
  custom: { label: '自定义', icon: '🏷️', color: '#95A5A6' }
};

/**
 * 子类型配置
 */
export const SUBTYPE_CONFIGS: Record<string, TypeDisplayConfig> = {
  // 故事
  main: { label: '主线', icon: '📖', color: '#FF6B6B' },
  sub: { label: '支线', icon: '📖', color: '#FF8E8E' },
  independent: { label: '独立故事', icon: '📖', color: '#FFB0B0' },
  // 结构
  goal: { label: '目标', icon: '🎯', color: '#9B59B6' },
  action: { label: '行动', icon: '⚡', color: '#9B59B6' },
  result: { label: '结果', icon: '✅', color: '#9B59B6' },
  accident: { label: '意外', icon: '❗', color: '#9B59B6' },
  gain: { label: '收获', icon: '🎁', color: '#9B59B6' },
  foreshadow: { label: '伏笔', icon: '🔮', color: '#9B59B6' },
  twist: { label: '转折', icon: '🔄', color: '#9B59B6' },
  // 人物
  debut: { label: '首次出场', icon: '🌟', color: '#96CEB4' },
  personality: { label: '性格塑造', icon: '💭', color: '#96CEB4' },
  relation: { label: '关系变化', icon: '🤝', color: '#96CEB4' },
  highlight: { label: '高光时刻', icon: '✨', color: '#96CEB4' },
  ending: { label: '结局', icon: '🏁', color: '#96CEB4' },
  // 设定
  worldview: { label: '世界观', icon: '🌍', color: '#4ECDC4' },
  rules: { label: '规则体系', icon: '📜', color: '#4ECDC4' },
  background: { label: '背景信息', icon: '📋', color: '#4ECDC4' },
  faction: { label: '势力介绍', icon: '🏰', color: '#4ECDC4' },
  realm: { label: '境界设定', icon: '⬆️', color: '#4ECDC4' },
  technique: { label: '功法体系', icon: '🔥', color: '#4ECDC4' },
  item: { label: '道具设定', icon: '💎', color: '#4ECDC4' },
  // 境界
  breakthrough: { label: '境界突破', icon: '🚀', color: '#F39C12' },
  ability: { label: '能力获得', icon: '💪', color: '#F39C12' },
  display: { label: '实力展示', icon: '⚔️', color: '#F39C12' },
  // 场景
  conflict: { label: '冲突', icon: '⚔️', color: '#45B7D1' },
  climax: { label: '高潮', icon: '🔥', color: '#45B7D1' },
  resolution: { label: '解决', icon: '✅', color: '#45B7D1' },
  // 素材
  quote: { label: '金句', icon: '💬', color: '#E74C3C' },
  joke: { label: '段子', icon: '😄', color: '#E74C3C' },
  scene: { label: '场景描写', icon: '🎨', color: '#E74C3C' }
};

/**
 * 获取类型的子类型列表
 */
export function getSubTypesForType(type: UnifiedMarkType): Array<{ value: string; label: string }> {
  const subTypeMap: Record<UnifiedMarkType, string[]> = {
    story: ['main', 'sub', 'independent'],
    structure: ['goal', 'action', 'result', 'accident', 'gain', 'foreshadow', 'twist'],
    character: ['debut', 'personality', 'relation', 'highlight', 'ending'],
    setting: ['worldview', 'rules', 'background', 'faction', 'realm', 'technique', 'item'],
    level: ['breakthrough', 'ability', 'display'],
    scene: ['conflict', 'foreshadow', 'climax', 'twist', 'resolution'],
    material: ['quote', 'joke', 'technique', 'scene'],
    custom: []
  };
  
  return (subTypeMap[type] || []).map(value => ({
    value,
    label: SUBTYPE_CONFIGS[value]?.label || value
  }));
}

// ============ 分析模板配置 ============

/**
 * 分析模板配置
 */
export interface AnalysisTemplateConfig {
  id: AnalysisTemplateType;
  name: string;
  description: string;
  icon: string;
  /** 模板字段定义 */
  fields: TemplateFieldConfig[];
  /** AI 分析 prompt */
  prompt: string;
}

/**
 * 模板字段配置
 */
export interface TemplateFieldConfig {
  key: string;
  label: string;
  description: string;
}

/**
 * 7步法模板配置
 */
export const SEVEN_STEP_TEMPLATE: AnalysisTemplateConfig = {
  id: 'seven-step',
  name: '7步法',
  description: '网文爽点循环结构，适用于分析打脸装逼、升级爽文的故事单元',
  icon: '🔄',
  fields: [
    { key: 'step1_advantage', label: '①主角优势', description: '主角有优势/很牛逼，或有潜力发展空间' },
    { key: 'step2_villain', label: '②反派出场', description: '反派出场，制造信息差，抬逼格拉期待' },
    { key: 'step3_friction', label: '③摩擦交集', description: '主角与反派势力有交集摩擦，主角不吃亏但被盯上' },
    { key: 'step4_expectation', label: '④拉期待', description: '反派行动，配角/围观群众不看好主角' },
    { key: 'step5_climax', label: '⑤冲突爆发', description: '冲突爆发，反派出手被主角爆杀' },
    { key: 'step6_shock', label: '⑥震惊四座', description: '主角表现震惊亲朋好友、围观群众、反派后台' },
    { key: 'step7_reward', label: '⑦收获奖励', description: '获得收获奖励，等级/阶层提升，开启下一轮循环' }
  ],
  prompt: `你是一位专业的网络小说分析师。请使用"7步法"分析以下故事内容。

7步法是网文爽点循环的经典结构：
①主角优势：通过情节展示主角有优势/很牛逼，或者有潜力发展空间
②反派出场：反派出场，制造信息差（爽点主要来源），强调反派也很屌，抬逼格拉期待
③摩擦交集：主角与反派势力有交集摩擦，主角不吃亏，但被盯上
④拉期待：反派行动，配角/围观群众不看好主角
⑤冲突爆发：冲突最终爆发，反派出手被主角爆杀（可能有反转）
⑥震惊四座：主角表现震惊亲朋好友、围观群众、反派后台
⑦收获奖励：获得收获奖励，继续震惊围观者，等级/阶层提升，开启下一轮循环

【故事内容】
{{content}}

请按照以下JSON格式输出分析结果：
{
  "summary": "故事摘要（100字以内）",
  "sevenStep": {
    "step1_advantage": "分析主角在这段故事中展示的优势或潜力",
    "step2_villain": "分析反派如何出场，信息差如何制造",
    "step3_friction": "分析主角与反派势力的交集和摩擦",
    "step4_expectation": "分析如何拉期待，配角/围观群众的态度",
    "step5_climax": "分析冲突如何爆发，主角如何爆杀反派",
    "step6_shock": "分析震惊效果，谁被震惊了",
    "step7_reward": "分析主角获得的收获奖励"
  },
  "techniques": ["使用的写作技法1", "技法2"],
  "takeaways": ["可借鉴点1", "可借鉴点2"]
}`
};

/**
 * 三幕式模板配置
 */
export const THREE_ACT_TEMPLATE: AnalysisTemplateConfig = {
  id: 'three-act',
  name: '三幕式',
  description: '经典的三幕剧结构，适用于分析完整的故事弧',
  icon: '🎭',
  fields: [
    { key: 'act1_setup.introduction', label: '人物介绍', description: '第一幕：人物和背景介绍' },
    { key: 'act1_setup.incitingIncident', label: '激励事件', description: '第一幕：触发故事的事件' },
    { key: 'act2_confrontation.risingAction', label: '上升动作', description: '第二幕：冲突升级' },
    { key: 'act2_confrontation.midpoint', label: '中点', description: '第二幕：故事中点转折' },
    { key: 'act2_confrontation.complications', label: '复杂化', description: '第二幕：情况变得更复杂' },
    { key: 'act3_resolution.climax', label: '高潮', description: '第三幕：故事高潮' },
    { key: 'act3_resolution.fallingAction', label: '下降动作', description: '第三幕：高潮后的收尾' },
    { key: 'act3_resolution.denouement', label: '结局', description: '第三幕：最终结局' }
  ],
  prompt: `你是一位专业的网络小说分析师。请使用"三幕式"结构分析以下故事内容。

【故事内容】
{{content}}

请按照以下JSON格式输出分析结果：
{
  "summary": "故事摘要（100字以内）",
  "threeAct": {
    "act1_setup": {
      "introduction": "人物和背景介绍",
      "incitingIncident": "触发故事的激励事件"
    },
    "act2_confrontation": {
      "risingAction": "冲突如何升级",
      "midpoint": "故事中点的转折",
      "complications": "情况如何变得更复杂"
    },
    "act3_resolution": {
      "climax": "故事高潮",
      "fallingAction": "高潮后的收尾",
      "denouement": "最终结局"
    }
  },
  "techniques": ["使用的写作技法1", "技法2"],
  "takeaways": ["可借鉴点1", "可借鉴点2"]
}`
};

/**
 * 冲突-解决模板配置
 */
export const CONFLICT_RESOLUTION_TEMPLATE: AnalysisTemplateConfig = {
  id: 'conflict-resolution',
  name: '冲突-解决',
  description: '聚焦于冲突的设置和解决，适用于单一冲突的故事',
  icon: '⚔️',
  fields: [
    { key: 'conflictSetup', label: '冲突设置', description: '冲突是如何建立的' },
    { key: 'escalation', label: '冲突升级', description: '冲突如何升级' },
    { key: 'climax', label: '高潮对决', description: '冲突的高潮' },
    { key: 'resolution', label: '解决方案', description: '冲突如何解决' },
    { key: 'aftermath', label: '后续影响', description: '解决后的影响' }
  ],
  prompt: `你是一位专业的网络小说分析师。请使用"冲突-解决"模式分析以下故事内容。

【故事内容】
{{content}}

请按照以下JSON格式输出分析结果：
{
  "summary": "故事摘要（100字以内）",
  "conflictResolution": {
    "conflictSetup": "冲突是如何建立的",
    "escalation": "冲突如何升级",
    "climax": "冲突的高潮对决",
    "resolution": "冲突如何解决",
    "aftermath": "解决后的影响"
  },
  "techniques": ["使用的写作技法1", "技法2"],
  "takeaways": ["可借鉴点1", "可借鉴点2"]
}`
};

/**
 * 所有内置分析模板
 */
export const ANALYSIS_TEMPLATES: Record<AnalysisTemplateType, AnalysisTemplateConfig> = {
  'seven-step': SEVEN_STEP_TEMPLATE,
  'three-act': THREE_ACT_TEMPLATE,
  'conflict-resolution': CONFLICT_RESOLUTION_TEMPLATE,
  'custom': {
    id: 'custom',
    name: '自定义',
    description: '使用自定义分析模板',
    icon: '📝',
    fields: [],
    prompt: ''
  }
};

/**
 * 获取分析模板列表
 */
export function getAnalysisTemplateList(): Array<{ id: AnalysisTemplateType; name: string; description: string; icon: string }> {
  return Object.values(ANALYSIS_TEMPLATES).map(t => ({
    id: t.id,
    name: t.name,
    description: t.description,
    icon: t.icon
  }));
}

// ============ 全局素材库类型 ============

/**
 * 全局素材库项
 * 跨书籍的素材收集
 */
export interface GlobalMaterialItem {
  /** 唯一标识 */
  id: string;
  /** 素材标题 */
  title: string;
  /** 素材类型 */
  type: 'story-unit' | 'quote' | 'technique' | 'scene' | 'character' | 'setting' | 'custom';
  /** 来源书籍ID */
  sourceBookId: string;
  /** 来源书籍标题 */
  sourceBookTitle: string;
  /** 关联的标记ID */
  markId: string;
  /** 素材内容摘要 */
  summary: string;
  /** 完整内容 */
  content: string;
  /** 分析结果（如果有） */
  analysis?: MarkAnalysisResult;
  /** 标签 */
  tags: string[];
  /** 分类 */
  category?: string;
  /** 是否收藏 */
  starred: boolean;
  /** 使用次数 */
  useCount: number;
  /** 创建时间 */
  createdAt: Date;
  /** 更新时间 */
  updatedAt: Date;
}

/**
 * 全局素材库存储
 */
export interface GlobalMaterialStorage {
  /** 存储版本 */
  version: string;
  /** 素材列表 */
  materials: GlobalMaterialItem[];
  /** 最后更新时间 */
  lastUpdated: string;
}
