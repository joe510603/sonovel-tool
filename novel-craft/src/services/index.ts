export { SoNovelService } from './SoNovelService';
export { LLMService } from './LLMService';
export { EpubParser, EpubParseError } from '../core/EpubParser';
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
