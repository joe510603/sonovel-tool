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
  // SoNovel SSE 进度字段
  index?: number;  // 当前章节
  total?: number;  // 总章节数
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

// ============ EPUB Conversion Types ============

/**
 * EPUB 转换选项
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
export interface ConversionOptions {
  /** 输出目录 */
  outputPath: string;
  /** 是否合并为单文件 */
  mergeToSingleFile: boolean;
  /** 是否保留 HTML 标签 */
  preserveHtmlTags: boolean;
  /** 是否包含章节导航 */
  includeNavigation: boolean;
  /** 是否链接到分析笔记 */
  linkToAnalysis: boolean;
}

/**
 * 单个 EPUB 转换结果
 * Requirements: 1.1, 1.2
 */
export interface ConversionResult {
  /** 是否成功 */
  success: boolean;
  /** 书籍文件夹路径 */
  bookFolder: string;
  /** 索引文件路径 */
  indexFile: string;
  /** 章节文件路径列表 */
  chapterFiles: string[];
  /** 总章节数 */
  totalChapters: number;
  /** 总字数 */
  totalWords: number;
  /** 错误信息列表 */
  errors: string[];
}

/**
 * 批量转换结果
 * Requirements: 8.1, 8.4
 */
export interface BatchConversionResult {
  /** 成功数量 */
  successCount: number;
  /** 失败数量 */
  failedCount: number;
  /** 跳过数量 */
  skippedCount: number;
  /** 各文件转换结果 */
  results: Array<{
    epubPath: string;
    result?: ConversionResult;
    error?: string;
    skipped?: boolean;
  }>;
}

/**
 * 阅读进度
 * Requirements: 5.1, 5.2
 */
export interface ReadingProgress {
  /** 书籍标题 */
  bookTitle: string;
  /** 当前章节 (1-based) */
  currentChapter: number;
  /** 总章节数 */
  totalChapters: number;
  /** 上次阅读时间 (ISO 8601) */
  lastReadAt: string;
  /** 阅读状态 */
  readingStatus: 'unread' | 'reading' | 'finished';
  /** 书签章节列表 */
  bookmarks: number[];
}

/**
 * 书籍条目 (用于书库管理)
 * Requirements: 3.1, 4.1
 */
export interface BookEntry {
  /** 书籍标题 */
  title: string;
  /** 作者 */
  author: string;
  /** 书籍文件夹路径 */
  folderPath: string;
  /** 总章节数 */
  totalChapters: number;
  /** 当前阅读章节 */
  currentChapter: number;
  /** 阅读状态 */
  readingStatus: 'unread' | 'reading' | 'finished';
  /** 转换时间 (ISO 8601) */
  convertedAt: string;
  /** 上次阅读时间 (ISO 8601) */
  lastReadAt?: string;
  /** 总字数 */
  totalWords: number;
}

/**
 * 书库统计信息
 * Requirements: 4.2
 */
export interface LibraryStats {
  /** 总书籍数 */
  totalBooks: number;
  /** 已读完书籍数 */
  finishedBooks: number;
  /** 阅读中书籍数 */
  readingBooks: number;
  /** 未开始书籍数 */
  unreadBooks: number;
  /** 总字数 */
  totalWords: number;
}

/**
 * EPUB 转换设置
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
export interface EpubConversionSettings {
  /** 输出路径 (默认: "NovelCraft/books") */
  outputPath: string;
  /** 是否合并为单文件 (默认: false) */
  mergeToSingleFile: boolean;
  /** 是否保留 HTML 标签 (默认: false) */
  preserveHtmlTags: boolean;
  /** 是否包含章节导航 (默认: true) */
  includeNavigation: boolean;
  /** 是否自动链接分析笔记 (默认: true) */
  autoLinkAnalysis: boolean;
}

/**
 * 默认 EPUB 转换设置
 */
export const DEFAULT_EPUB_CONVERSION_SETTINGS: EpubConversionSettings = {
  outputPath: 'NovelCraft/books',
  mergeToSingleFile: false,
  preserveHtmlTags: false,
  includeNavigation: true,
  autoLinkAnalysis: true
};

// ============ Marking Settings Types ============

/**
 * 标记功能设置
 * Requirements: 10.5
 */
export interface MarkingSettings {
  /** 标记存储路径 */
  storagePath: string;
  /** 默认标记类型 */
  defaultType?: string;
  /** 默认子类型 */
  defaultSubType?: string;
  /** 最近类型追踪数量 */
  recentTypesLimit: number;
  /** 是否启用浮动工具栏 */
  floatingToolbarEnabled: boolean;
}

/**
 * 交互式工具栏设置
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
export interface InteractiveToolbarSettings {
  /** 是否启用交互式标记工具栏 */
  enabled: boolean;
  /** 显示延迟 (ms) */
  showDelay: number;
  /** 隐藏延迟 (ms) */
  hideDelay: number;
  /** 工具栏位置 */
  position: 'top' | 'bottom' | 'floating';
  /** 显示未配对标记提示 */
  showUnpairedHints: boolean;
}

/**
 * 默认标记设置
 */
export const DEFAULT_MARKING_SETTINGS: MarkingSettings = {
  storagePath: '.novelcraft/marks',
  recentTypesLimit: 5,
  floatingToolbarEnabled: true
};

/**
 * 默认交互式工具栏设置
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
 */
export const DEFAULT_INTERACTIVE_TOOLBAR_SETTINGS: InteractiveToolbarSettings = {
  enabled: true,
  showDelay: 200,
  hideDelay: 300,
  position: 'top',
  showUnpairedHints: true
};

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
  // EPUB 转换设置
  epubConversion: EpubConversionSettings;
  // 标记功能设置
  // Requirements: 10.5
  markingSettings: MarkingSettings;
  // 交互式工具栏设置
  // Requirements: 8.1, 8.2, 8.3, 8.4, 8.5
  interactiveToolbar: InteractiveToolbarSettings;
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
  incrementalAnalysis: DEFAULT_INCREMENTAL_SETTINGS,
  epubConversion: DEFAULT_EPUB_CONVERSION_SETTINGS,
  markingSettings: DEFAULT_MARKING_SETTINGS,
  interactiveToolbar: DEFAULT_INTERACTIVE_TOOLBAR_SETTINGS
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

// Unified Marking Types (v1.5.0)
export * from './unified-marking';

// Story Database System Types (v2.0.0)
export * from './database';