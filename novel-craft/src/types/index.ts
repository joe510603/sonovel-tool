// NovelCraft Type Definitions

// ============ SoNovel Types ============

export interface BookSearchResult {
  bookName: string;
  author: string;
  latestChapter: string;
  lastUpdateTime: string;
  sourceId: string;
  url: string;
}

export interface LocalBook {
  filename: string;
  path: string;
  size: number;
  downloadedAt: string;
}

export interface DownloadProgress {
  filename: string;
  progress: number;
  status: 'downloading' | 'completed' | 'failed';
  message?: string;
}

// ============ LLM Types ============

export interface LLMProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ============ Epub Types ============

export interface Chapter {
  index: number;
  title: string;
  content: string;
  wordCount: number;
}

export interface BookMetadata {
  title: string;
  author: string;
  description?: string;
  coverImage?: string;
}

export interface ParsedBook {
  metadata: BookMetadata;
  chapters: Chapter[];
  totalWordCount: number;
}

// ============ Analysis Types ============

export type AnalysisMode = 'quick' | 'standard' | 'deep';
export type NovelType = 
  | 'urban'           // 都市
  | 'fantasy'         // 玄幻
  | 'xianxia'         // 仙侠
  | 'wuxia'           // 武侠
  | 'scifi'           // 科幻
  | 'game'            // 游戏
  | 'alternate-history' // 架空历史
  | 'historical'      // 历史
  | 'military'        // 军事
  | 'sports'          // 竞技
  | 'supernatural'    // 灵异
  | 'romance'         // 言情
  | 'custom';         // 自定义

export interface AnalysisConfig {
  mode: AnalysisMode;
  novelType: NovelType;
  customFocus?: string[];
  customTypeName?: string;  // 自定义类型名称
  customPrompts?: Record<string, string>;  // 自定义提示词
  customTypePrompts?: Record<string, string>;  // 自定义类型提示词
}

export interface CharacterAnalysis {
  name: string;
  role: 'protagonist' | 'antagonist' | 'supporting';
  description: string;
  motivation: string;
  growthArc?: string;
  relationships?: string[];
}

export interface TechniqueAnalysis {
  name: string;
  description: string;
  examples: string[];
  applicability: string;
}

export interface EmotionPoint {
  chapter: number;
  intensity: number;
  description: string;
}

export interface ChapterSummary {
  index: number;
  title: string;
  summary: string;
  keyEvents: string[];
}

export interface Foreshadowing {
  setupChapter: number;
  payoffChapter?: number;
  description: string;
  status: 'planted' | 'resolved' | 'abandoned';
}

export interface ChapterDetail {
  index: number;
  title: string;
  analysis: string;
  techniques: string[];
  highlights: string[];
}

export interface AnalysisResult {
  bookInfo: BookMetadata;
  synopsis: string;
  characters: CharacterAnalysis[];
  writingTechniques: TechniqueAnalysis[];
  emotionCurve?: EmotionPoint[];
  chapterStructure?: ChapterSummary[];
  foreshadowing?: Foreshadowing[];
  chapterDetails?: ChapterDetail[];
  writingReview?: string;
  takeaways: string[];
}

export interface AnalysisProgress {
  stage: string;
  progress: number;
  message: string;
}

// ============ Incremental Analysis Types ============

/**
 * 增量分析模式
 * - continue: 继续分析 - 从上次分析结束的章节继续
 * - append: 追加分析 - 用户自定义范围追加分析
 * - restart: 重新分析 - 覆盖已有分析结果
 */
export type IncrementalMode = 'continue' | 'append' | 'restart';

export interface AnalysisRange {
  id: string;
  startChapter: number;
  endChapter: number;
  mode: AnalysisMode;
  analyzedAt: string;
  stages: string[];
}

export interface AnalysisMetadata {
  bookTitle: string;
  bookPath: string;
  ranges: AnalysisRange[];
  lastUpdated: string;
  version: string;
}

// ============ Batch Analysis Types ============

/**
 * 批次信息
 * Requirements: 1.3.1.3, 1.3.1.4
 */
export interface BatchInfo {
  /** 批次索引 (0-based) */
  batchIndex: number;
  /** 总批次数 */
  totalBatches: number;
  /** 批次起始章节 (1-based) */
  startChapter: number;
  /** 批次结束章节 (1-based) */
  endChapter: number;
  /** 批次状态 */
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  /** 批次结果 */
  result?: AnalysisResult;
  /** 错误信息 */
  error?: string;
}

/**
 * 批次失败处理选项
 * Requirements: 1.3.2.3
 */
export type BatchFailureAction = 'retry' | 'skip' | 'abort';

/**
 * 合并模式
 * - append: 追加模式 - 新内容追加到已有内容后
 * - merge: 合并模式 - 智能合并新旧内容
 * Requirements: 1.3.4.3
 */
export type MergeMode = 'append' | 'merge';

/**
 * 增量分析设置
 * Requirements: 1.3.4.1, 1.3.4.2, 1.3.4.3, 1.3.4.4
 */
export interface IncrementalAnalysisSettings {
  /** 默认批次大小 (章节数) */
  defaultBatchSize: number;
  /** 自动分批阈值 (章节数超过此值时建议分批) */
  autoBatchThreshold: number;
  /** 合并模式 */
  mergeMode: MergeMode;
}

/**
 * 默认增量分析设置
 */
export const DEFAULT_INCREMENTAL_SETTINGS: IncrementalAnalysisSettings = {
  defaultBatchSize: 30,
  autoBatchThreshold: 50,
  mergeMode: 'merge'
};

/**
 * 批次完成回调类型
 */
export type BatchCompleteCallback = (
  batchInfo: BatchInfo,
  result: AnalysisResult
) => Promise<void>;

/**
 * 批次失败回调类型
 * 返回用户选择的处理方式
 */
export type BatchFailureCallback = (
  batchInfo: BatchInfo,
  error: Error
) => Promise<BatchFailureAction>;

// ============ Conversation Types ============

export interface Conversation {
  id: string;
  bookPath: string;
  analysisResult: AnalysisResult;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// ============ Token Usage Types ============

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface TokenUsageRecord {
  timestamp: number;
  stage: string;
  bookTitle?: string;
  providerId: string;
  model: string;
  usage: TokenUsage;
}

export interface TokenStats {
  totalPromptTokens: number;
  totalCompletionTokens: number;
  totalTokens: number;
  recordCount: number;
  byProvider: Record<string, TokenUsage>;
  byBook: Record<string, TokenUsage>;
}

// ============ Settings Types ============

export interface NovelCraftSettings {
  sonovelUrl: string;
  downloadPath: string;
  llmProviders: LLMProvider[];
  defaultProviderId: string;
  defaultAnalysisMode: AnalysisMode;
  defaultNovelType: NovelType;
  notesPath: string;
  // 自定义提示词
  customPrompts: {
    system?: string;
    synopsis?: string;
    characters?: string;
    techniques?: string;
    takeaways?: string;
    emotionCurve?: string;
    chapterStructure?: string;
    foreshadowing?: string;
    chapterDetail?: string;
    writingReview?: string;
  };
  // 自定义类型提示词
  customTypePrompts: Record<string, string>;
  // Token 使用记录
  tokenUsageRecords: TokenUsageRecord[];
  // 增量分析设置
  incrementalAnalysis: IncrementalAnalysisSettings;
}

export const DEFAULT_SETTINGS: NovelCraftSettings = {
  sonovelUrl: 'http://localhost:7765',
  downloadPath: 'NovelCraft/downloads',
  llmProviders: [],
  defaultProviderId: '',
  defaultAnalysisMode: 'standard',
  defaultNovelType: 'fantasy',
  notesPath: 'NovelCraft/notes',
  customPrompts: {},
  customTypePrompts: {},
  tokenUsageRecords: [],
  incrementalAnalysis: DEFAULT_INCREMENTAL_SETTINGS
};

export const DEFAULT_PROVIDERS: Partial<LLMProvider>[] = [
  {
    id: 'deepseek',
    name: 'Deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat'
  },
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o'
  }
];

// ============ 时间线可视化功能类型导出 ============

// 时间线相关类型
export * from './timeline';

// 人物关系相关类型
export * from './character';

// 导入功能相关类型
export * from './import';

// 数据库相关类型
export * from './database';

// 错误处理相关类型
export * from './errors';
