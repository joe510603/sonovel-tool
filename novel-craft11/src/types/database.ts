/**
 * 故事数据库系统 - 类型定义
 * 
 * 定义书籍数据库的5张核心数据表类型：
 * - BookMeta: 书籍表
 * - ChapterFrontmatter: 章节 Frontmatter
 * - Character: 人物表
 * - StoryUnit: 故事单元表
 * - Event: 事件表
 * 
 * Requirements: 1.1, 1.2
 */

// ============ 精确位置类型 ============

/**
 * 精确位置
 * 用于标记文本在章节中的精确位置
 */
export interface PrecisePosition {
  /** 章节索引 (0-based) */
  chapterIndex: number;
  /** 行号 (1-based) */
  lineNumber: number;
  /** 字符偏移量 */
  characterOffset: number;
}

/**
 * 精确范围
 * 用于标记跨章节的文本范围
 */
export interface PreciseRange {
  /** 起始位置 */
  start: PrecisePosition;
  /** 结束位置 */
  end: PrecisePosition;
}

// ============ 人物关系类型 ============

/**
 * 关系类型
 */
export type RelationshipType = 'friend' | 'enemy' | 'family' | 'lover' | 'rival' | 'custom';

/**
 * 关系变化记录
 */
export interface RelationshipChange {
  /** 关联的故事单元ID */
  storyUnitId: string;
  /** 发生变化的章节 */
  chapter: number;
  /** 变化描述 */
  description: string;
}

/**
 * 人物关系
 */
export interface CharacterRelationship {
  /** 目标人物ID */
  targetCharacterId: string;
  /** 目标人物名称 */
  targetName: string;
  /** 关系类型 */
  relationshipType: RelationshipType;
  /** 自定义关系类型名称 */
  customType?: string;
  /** 关系描述 */
  description?: string;
  /** 关系变化记录 */
  changes?: RelationshipChange[];
}

// ============ 故事单元分析类型 ============
// 注意：这些类型使用 Db 前缀以避免与 unified-marking.ts 中的类型冲突

/**
 * 7步法分析结果 (数据库版本)
 */
export interface DbSevenStepAnalysis {
  /** ①主角优势 */
  step1Advantage: string;
  /** ②反派出场 */
  step2Villain: string;
  /** ③摩擦交集 */
  step3Friction: string;
  /** ④拉期待 */
  step4Expectation: string;
  /** ⑤冲突爆发 */
  step5Climax: string;
  /** ⑥震惊四座 */
  step6Shock: string;
  /** ⑦收获奖励 */
  step7Reward: string;
}

/**
 * 三幕式分析结果 (数据库版本)
 */
export interface DbThreeActAnalysis {
  /** 第一幕：建置 */
  act1Setup: {
    /** 人物介绍 */
    introduction: string;
    /** 激励事件 */
    incitingIncident: string;
  };
  /** 第二幕：对抗 */
  act2Confrontation: {
    /** 上升动作 */
    risingAction: string;
    /** 中点 */
    midpoint: string;
    /** 复杂化 */
    complications: string;
  };
  /** 第三幕：解决 */
  act3Resolution: {
    /** 高潮 */
    climax: string;
    /** 下降动作 */
    fallingAction: string;
    /** 结局 */
    denouement: string;
  };
}

/**
 * 冲突-解决分析结果 (数据库版本)
 */
export interface DbConflictResolutionAnalysis {
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
 * 故事单元分析结果
 */
export interface StoryUnitAnalysis {
  /** 摘要 */
  summary: string;
  /** 7步法分析 */
  sevenStep?: DbSevenStepAnalysis;
  /** 三幕式分析 */
  threeAct?: DbThreeActAnalysis;
  /** 冲突-解决分析 */
  conflictResolution?: DbConflictResolutionAnalysis;
  /** 自定义分析结果 */
  customAnalysis?: Record<string, string>;
  /** 写作技法 */
  techniques?: string[];
  /** 可借鉴点 */
  takeaways?: string[];
  /** 分析时间 */
  analyzedAt: string;
}

// ============ 书籍表 (BookMeta) ============

/**
 * 阅读状态
 */
export type ReadingStatus = 'unread' | 'reading' | 'finished';

/**
 * 书籍元数据
 * 存储在 `_book_meta.md` 的 Frontmatter 中
 */
export interface BookMeta {
  // 基础信息
  /** 唯一标识（书名+时间戳） */
  bookId: string;
  /** 书名 */
  title: string;
  /** 作者 */
  author: string;
  /** 简介 */
  description: string;
  /** 封面图片路径 */
  coverImage?: string;
  
  // 统计信息
  /** 总章节数 */
  totalChapters: number;
  /** 总字数 */
  totalWords: number;
  
  // AI 分析结果
  /** AI 生成的故事梗概 */
  aiSynopsis?: string;
  /** AI 分析的写作技法 */
  aiWritingTechniques?: string[];
  /** AI 分析的可借鉴点 */
  aiTakeaways?: string[];
  
  // 阅读状态
  /** 阅读状态 */
  readingStatus: ReadingStatus;
  /** 当前阅读章节 */
  currentChapter: number;
  /** 上次阅读时间 */
  lastReadAt?: string;
  
  // 元数据
  /** 转换时间 */
  convertedAt: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
  
  // 自定义字段（用户扩展）
  /** 自定义字段 */
  customFields?: Record<string, unknown>;
}

// ============ 章节 Frontmatter ============

/**
 * 章节阅读状态
 */
export type ChapterReadStatus = 'unread' | 'reading' | 'read';

/**
 * 章节 Frontmatter
 * 添加到每个章节 MD 文件的 Frontmatter
 */
export interface ChapterFrontmatter {
  /** 关联书籍ID */
  bookId: string;
  /** 章节唯一标识 */
  chapterId: string;
  /** 章节序号 */
  chapterNum: number;
  /** 章节标题 */
  title: string;
  /** 字数 */
  wordCount: number;
  
  // AI 分析结果
  /** AI 章节概述 */
  aiSummary?: string;
  /** AI 分析的关键事件 */
  aiKeyEvents?: string[];
  
  // 阅读状态
  /** 阅读状态 */
  readStatus: ChapterReadStatus;
  /** 阅读时间 */
  readAt?: string;
}

// ============ 人物表 (Character) ============

/**
 * 人物角色类型 (数据库版本)
 * 注意：使用 Db 前缀以避免与 unified-marking.ts 中的 CharacterRole 接口冲突
 */
export type DbCharacterRole = 'protagonist' | 'antagonist' | 'supporting' | 'minor';

/**
 * 数据来源
 */
export type DataSource = 'ai' | 'manual';

/**
 * 人物
 * 存储在 `_characters.md` 中
 */
export interface Character {
  /** 唯一标识 */
  characterId: string;
  /** 关联书籍ID */
  bookId: string;
  /** 人物名称 */
  name: string;
  /** 别名 */
  aliases?: string[];
  
  // 分类
  /** 角色类型 */
  role: DbCharacterRole;
  /** 标签 */
  tags?: string[];
  
  // AI 分析结果
  /** AI 人物设定 */
  aiDescription?: string;
  /** AI 分析的动机 */
  aiMotivation?: string;
  /** AI 分析的成长弧线 */
  aiGrowthArc?: string;
  
  // 人物关系
  /** 人物关系列表 */
  relationships: CharacterRelationship[];
  
  // 出场信息
  /** 首次出场章节 */
  firstAppearanceChapter: number;
  /** 出场章节列表 */
  appearanceChapters: number[];
  
  // 元数据
  /** 数据来源 */
  source: DataSource;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

// ============ 故事单元表 (StoryUnit) ============

/**
 * 故事线类型
 */
export type StoryLineType = 'main' | 'sub' | 'independent' | 'custom';

/**
 * 分析模板类型
 */
export type AnalysisTemplate = 'seven-step' | 'three-act' | 'conflict-resolution' | 'custom';

/**
 * 章节范围
 */
export interface ChapterRange {
  /** 起始章节 */
  start: number;
  /** 结束章节 */
  end: number;
}

/**
 * 故事单元
 * 存储在 `_story_units.md` 中
 */
export interface StoryUnit {
  /** 唯一标识 */
  unitId: string;
  /** 关联书籍ID */
  bookId: string;
  /** 故事单元名称 */
  name: string;
  
  // 范围信息
  /** 章节范围 */
  chapterRange: ChapterRange;
  /** 精确位置（可选） */
  preciseRange?: PreciseRange;
  
  // 分类
  /** 故事线类型 */
  lineType: StoryLineType;
  /** 自定义故事线类型名称 */
  customLineType?: string;
  /** 分类标签 */
  categories?: string[];
  
  // 关联人物
  /** 关联人物ID列表 */
  relatedCharacters: string[];
  
  // 内容
  /** 提取的文本内容（摘要或完整内容） */
  textContent?: string;
  /** 大内容存储在单独文件的路径 */
  textFilePath?: string;
  
  // AI 分析结果
  /** 使用的分析模板 */
  analysisTemplate: AnalysisTemplate;
  /** AI 分析结果 */
  aiAnalysis?: StoryUnitAnalysis;
  
  // 元数据
  /** 数据来源 */
  source: DataSource;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

// ============ 事件表 (Event) ============

/**
 * 事件
 * 存储在 `_events.md` 中，为甘特图提供数据
 */
export interface StoryEvent {
  /** 唯一标识 */
  eventId: string;
  /** 关联书籍ID */
  bookId: string;
  /** 关联故事单元ID */
  storyUnitId?: string;
  
  // 事件信息
  /** 事件名称 */
  name: string;
  /** 事件描述 */
  description?: string;
  
  // 时间轴位置
  /** 伪时间顺序（用于排序） */
  pseudoTimeOrder: number;
  /** 持续跨度（横向长度） */
  durationSpan: number;
  /** 纵向层级（用于并行事件） */
  layer: number;
  
  // 样式
  /** 颜色标记 */
  color: string;
  
  // 关联章节
  /** 章节范围 */
  chapterRange: ChapterRange;
  
  // 元数据
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

// ============ 数据库模板 ============

/**
 * 字段类型
 */
export type FieldType = 'text' | 'number' | 'date' | 'list' | 'boolean' | 'select';

/**
 * 字段定义
 */
export interface FieldDefinition {
  /** 字段键名 */
  key: string;
  /** 字段标签 */
  label: string;
  /** 字段类型 */
  type: FieldType;
  /** select 类型的选项 */
  options?: string[];
  /** 默认值 */
  defaultValue?: unknown;
  /** 字段描述 */
  description?: string;
}

/**
 * 数据库模板
 */
export interface DatabaseTemplate {
  /** 模板ID */
  templateId: string;
  /** 模板名称 */
  name: string;
  /** 模板描述 */
  description: string;
  
  // 字段定义
  /** 书籍表自定义字段 */
  bookFields: FieldDefinition[];
  /** 人物表自定义字段 */
  characterFields: FieldDefinition[];
  /** 故事单元表自定义字段 */
  storyUnitFields: FieldDefinition[];
  
  // 预设分类
  /** 预设故事单元分类 */
  presetCategories: string[];
  /** 预设人物标签 */
  presetCharacterTags: string[];
  
  // 元数据
  /** 是否为内置模板 */
  isBuiltin: boolean;
  /** 创建时间 */
  createdAt: string;
}

// ============ 存储格式 ============

/**
 * 书籍数据库存储
 * 用于整体导出/导入
 */
export interface BookDatabaseStorage {
  /** 存储版本 */
  version: string;
  /** 书籍元数据 */
  bookMeta: BookMeta;
  /** 人物列表 */
  characters: Character[];
  /** 故事单元列表 */
  storyUnits: StoryUnit[];
  /** 事件列表 */
  events: StoryEvent[];
  /** 最后更新时间 */
  lastUpdated: string;
}

// ============ 数据库文件路径常量 ============

/**
 * 数据库文件名常量
 */
export const DATABASE_FILES = {
  /** 书籍元数据文件 */
  BOOK_META: '_book_meta.md',
  /** 人物表文件 */
  CHARACTERS: '_characters.md',
  /** 故事单元表文件 */
  STORY_UNITS: '_story_units.md',
  /** 事件表文件 */
  EVENTS: '_events.md',
  /** Canvas 文件夹 */
  CANVAS_FOLDER: '_canvas',
  /** 人物关系 Canvas */
  CHARACTER_CANVAS: '_canvas/人物关系.canvas',
  /** 故事发展 Canvas */
  STORY_CANVAS: '_canvas/故事发展.canvas',
} as const;

/**
 * 数据库版本
 */
export const DATABASE_VERSION = '1.0.0';

// ============ 默认值 ============

/**
 * 创建默认书籍元数据
 */
export function createDefaultBookMeta(title: string, author: string = ''): BookMeta {
  const now = new Date().toISOString();
  return {
    bookId: '',
    title,
    author,
    description: '',
    totalChapters: 0,
    totalWords: 0,
    readingStatus: 'unread',
    currentChapter: 0,
    convertedAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 创建默认章节 Frontmatter
 */
export function createDefaultChapterFrontmatter(
  bookId: string,
  chapterId: string,
  chapterNum: number,
  title: string
): ChapterFrontmatter {
  return {
    bookId,
    chapterId,
    chapterNum,
    title,
    wordCount: 0,
    readStatus: 'unread',
  };
}

/**
 * 创建默认人物
 */
export function createDefaultCharacter(
  bookId: string,
  name: string,
  source: DataSource = 'manual'
): Character {
  const now = new Date().toISOString();
  return {
    characterId: '',
    bookId,
    name,
    role: 'supporting',
    relationships: [],
    firstAppearanceChapter: 0,
    appearanceChapters: [],
    source,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 创建默认故事单元
 */
export function createDefaultStoryUnit(
  bookId: string,
  name: string,
  chapterRange: ChapterRange,
  source: DataSource = 'manual'
): StoryUnit {
  const now = new Date().toISOString();
  return {
    unitId: '',
    bookId,
    name,
    chapterRange,
    lineType: 'main',
    relatedCharacters: [],
    analysisTemplate: 'seven-step',
    source,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 创建默认事件
 */
export function createDefaultEvent(
  bookId: string,
  name: string,
  chapterRange: ChapterRange
): StoryEvent {
  const now = new Date().toISOString();
  return {
    eventId: '',
    bookId,
    name,
    pseudoTimeOrder: 0,
    durationSpan: 1,
    layer: 0,
    color: '#4ECDC4',
    chapterRange,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * 内置数据库模板
 */
export const BUILTIN_TEMPLATES: DatabaseTemplate[] = [
  {
    templateId: 'fantasy',
    name: '玄幻小说',
    description: '适用于玄幻、仙侠类小说的数据库模板',
    bookFields: [
      { key: 'powerSystem', label: '力量体系', type: 'text', description: '小说的修炼/力量体系' },
      { key: 'worldSetting', label: '世界设定', type: 'text', description: '世界观设定' },
    ],
    characterFields: [
      { key: 'realm', label: '境界', type: 'text', description: '当前修炼境界' },
      { key: 'techniques', label: '功法', type: 'list', description: '掌握的功法' },
    ],
    storyUnitFields: [
      { key: 'powerUp', label: '实力提升', type: 'boolean', description: '是否包含实力提升' },
    ],
    presetCategories: ['主线', '支线', '日常', '战斗', '修炼', '奇遇'],
    presetCharacterTags: ['主角', '女主', '反派', '配角', '势力首领', '长老'],
    isBuiltin: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    templateId: 'urban',
    name: '都市小说',
    description: '适用于都市、现代类小说的数据库模板',
    bookFields: [
      { key: 'setting', label: '背景设定', type: 'text', description: '故事发生的城市/环境' },
    ],
    characterFields: [
      { key: 'occupation', label: '职业', type: 'text', description: '人物职业' },
      { key: 'socialStatus', label: '社会地位', type: 'text', description: '社会地位' },
    ],
    storyUnitFields: [],
    presetCategories: ['主线', '支线', '日常', '商战', '感情', '冲突'],
    presetCharacterTags: ['主角', '女主', '反派', '配角', '家人', '朋友'],
    isBuiltin: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
  {
    templateId: 'romance',
    name: '言情小说',
    description: '适用于言情、爱情类小说的数据库模板',
    bookFields: [
      { key: 'romanceType', label: '言情类型', type: 'select', options: ['甜宠', '虐恋', '破镜重圆', '先婚后爱'], description: '言情类型' },
    ],
    characterFields: [
      { key: 'emotionalState', label: '情感状态', type: 'text', description: '当前情感状态' },
    ],
    storyUnitFields: [
      { key: 'romanceProgress', label: '感情进展', type: 'text', description: '感情线进展' },
    ],
    presetCategories: ['主线', '支线', '甜蜜', '误会', '和好', '日常'],
    presetCharacterTags: ['男主', '女主', '情敌', '闺蜜', '家人', '配角'],
    isBuiltin: true,
    createdAt: '2024-01-01T00:00:00.000Z',
  },
];
