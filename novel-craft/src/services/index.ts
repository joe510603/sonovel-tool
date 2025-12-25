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
