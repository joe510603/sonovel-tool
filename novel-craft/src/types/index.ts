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
  tokenUsageRecords: []
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
