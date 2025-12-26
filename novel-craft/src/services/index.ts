export { SoNovelService } from './SoNovelService';
export { LLMService } from './LLMService';
export { EpubParser } from '../core/EpubParser';
export { AnalysisService, AnalysisController, AnalysisStoppedError } from './AnalysisService';
export type { BookChunk, ChunkConfig, AnalysisControlState } from './AnalysisService';
export { ConversationManager, CONVERSATION_SYSTEM_PROMPT } from './ConversationManager';
export { NoteGenerator } from './NoteGenerator';
export type { NoteGeneratorConfig } from './NoteGenerator';
export { MetadataService } from './MetadataService';
export { MergeService } from './MergeService';
export type { MergeOptions } from './MergeService';
export { CheckpointService } from './CheckpointService';
export type { AnalysisCheckpoint } from './CheckpointService';
export {
  BASE_PROMPTS,
  STANDARD_PROMPTS,
  DEEP_PROMPTS,
  TYPE_SPECIFIC_PROMPTS,
  SYSTEM_PROMPT,
  getAnalysisPrompt,
  getAnalysisStages,
  getStageName
} from './PromptTemplates';

// 时间线可视化功能服务
export { TimelineDatabaseService, databaseService } from './DatabaseService';

// 书籍导入功能服务
export { ImportService } from './ImportService';
export { FileOrganizer } from './FileOrganizer';

// EPUB 转换服务
export { 
  EpubConverterService, 
  DEFAULT_EPUB_CONVERSION_SETTINGS 
} from './EpubConverterService';
export type { 
  ConversionOptions, 
  ConversionResult, 
  BatchConversionResult 
} from './EpubConverterService';

// 书库管理和阅读进度服务
export { LibraryService } from './LibraryService';
export { ReadingProgressService } from './ReadingProgressService';

// 故事单元和轨道服务
export { StoryUnitService } from './StoryUnitService';
export type { ChapterInfo, StoryUnitCreateConfig, StoryUnitUpdateConfig } from './StoryUnitService';
export { TrackService } from './TrackService';
export type { TrackCreateConfig, TrackUpdateConfig } from './TrackService';

// 故事单元AI分析服务
export { StoryUnitAnalysisService } from './StoryUnitAnalysisService';
export type { 
  AnalysisProgressCallback, 
  StreamCallback, 
  AnalysisResultItem, 
  StoryUnitAnalysisResult 
} from './StoryUnitAnalysisService';

// 分析模板系统
export {
  SEVEN_STEP_STORY_TEMPLATE,
  THREE_ACT_TEMPLATE,
  WEB_NOVEL_TEMPLATE,
  BUILTIN_TEMPLATES,
  getAllTemplates,
  getTemplateById,
  addCustomTemplate,
  updateCustomTemplate,
  deleteCustomTemplate,
  loadCustomTemplates,
  getCustomTemplates
} from './AnalysisTemplates';
export type { AnalysisTemplate, AnalysisTemplateStep } from './AnalysisTemplates';

// 关联关系服务
export { RelationService, RELATION_TYPE_NAMES } from './RelationService';
export type { 
  RelationCreateConfig, 
  RelationUpdateConfig, 
  UnitPosition, 
  RelationLineInfo 
} from './RelationService';
