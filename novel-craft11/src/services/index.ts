// Core Services
export { SoNovelService } from './SoNovelService';
export { LLMService } from './LLMService';
export { EpubParser, EpubParseError } from '../core/EpubParser';
export { EpubConverterService } from './EpubConverterService';
export { LibraryService } from './LibraryService';
export { ReadingProgressService } from './ReadingProgressService';
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

// Prompt Templates
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

// Error Handling Services
export { ErrorHandlingService, ErrorType, ErrorSeverity } from './ErrorHandlingService';
export { UserGuidanceService, GuideStepType } from './UserGuidanceService';
export { PerformanceOptimizationService } from './PerformanceOptimizationService';
export { ErrorHandlingIntegrationService } from './ErrorHandlingIntegrationService';

// Unified Marking System (v1.5.0)
export { UnifiedMarkRepository } from './UnifiedMarkRepository';
export { UnifiedMarkingService } from './UnifiedMarkingService';
export type {
  CreateMarkParams as UnifiedCreateMarkParams,
  UpdateMarkParams as UnifiedUpdateMarkParams,
  MarkChangeEvent as UnifiedMarkChangeEvent,
  MarkChangeCallback as UnifiedMarkChangeCallback
} from './UnifiedMarkingService';

// Story Unit Analysis Service (v1.5.0)
export { StoryUnitAnalysisService } from './StoryUnitAnalysisService';
export type { CreateStoryUnitParams, AnalysisResponse } from './StoryUnitAnalysisService';

// Global Material Library Service (v1.5.0)
export { GlobalMaterialLibraryService } from './GlobalMaterialLibraryService';
export type { AddMaterialParams, MaterialFilter } from './GlobalMaterialLibraryService';

// Story Database System (v2.0.0)
export { BookDatabaseService, generateBookId } from './BookDatabaseService';
export { DataSyncService } from './DataSyncService';
export type {
  DataConflict,
  ConflictStrategy,
  CanvasChange,
  SyncResult,
  CanvasNode,
  CanvasEdge,
  CanvasData,
  CanvasNodeType,
} from './DataSyncService';

// Precise Marking Service (v2.0.0)
export { PreciseMarkingService } from './PreciseMarkingService';
export type {
  UnpairedMark,
  UnpairedMarkStatus,
  PreciseMark,
} from './PreciseMarkingService';

// Canvas Generator Service (v2.0.0)
export { CanvasGeneratorService } from './CanvasGeneratorService';
export type {
  CanvasChange as CanvasGeneratorChange,
} from './CanvasGeneratorService';

// Timeline Visualization Service (v2.0.0)
export { TimelineVisualizationService } from './TimelineVisualizationService';
export type {
  TimelineNode,
  TimelineEdge,
  TimelineCanvasData,
  TimelineNodeType,
  EventPosition,
} from './TimelineVisualizationService';

// Data Migration Service (v2.0.0)
export { DataMigrationService } from './DataMigrationService';
export type {
  MigrationResult,
  LegacyDataDetection,
  LegacyMarkData,
} from './DataMigrationService';
