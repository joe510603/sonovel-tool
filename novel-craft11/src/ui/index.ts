// Core UI Components
export { SearchModal } from './SearchModal';
export { NovelCraftSettingTab } from './SettingTab';
export { AnalysisPanel } from './AnalysisPanel';
export { ChatPanel } from './ChatPanel';
export { MainPanel, MAIN_PANEL_VIEW_TYPE } from './MainPanel';
export { AnalysisView, ANALYSIS_VIEW_TYPE } from './AnalysisView';
export { ChatView, CHAT_VIEW_TYPE } from './ChatView';
export { BookSelector } from './BookSelector';

// Notification Utilities
export {
  showNotification,
  showSuccess,
  showError,
  showWarning,
  showInfo,
  handleError,
  extractErrorMessage,
  getUserFriendlyErrorMessage,
  LoadingState,
  withLoading,
  withLoadingResult,
  createLoadingIndicator,
  createErrorDisplay,
  confirmAction,
  OperationStateManager,
  globalOperationState,
  createActionButton,
  createLoadingContainer
} from './NotificationUtils';
export type { NotificationType, NotificationConfig, AsyncOperationConfig } from './NotificationUtils';

// Unified Marking Panel (v1.5.0)
export { UnifiedMarkingPanel, UNIFIED_MARKING_PANEL_VIEW_TYPE } from './UnifiedMarkingPanel';
export { MarkingToolbar, DEFAULT_MARKING_TOOLBAR_CONFIG } from './MarkingToolbar';
export type { MarkingToolbarConfig } from './MarkingToolbar';

// Story Unit and Global Material Library (v1.5.0)
export { StoryUnitModal } from './StoryUnitModal';
export type { StoryUnitModalConfig } from './StoryUnitModal';
export { GlobalMaterialPanel, GLOBAL_MATERIAL_PANEL_VIEW_TYPE } from './GlobalMaterialPanel';

// Database Management UI (v1.6.0)
export { DatabaseFieldManager } from './DatabaseFieldManager';
export type { DatabaseFieldManagerConfig } from './DatabaseFieldManager';
export { DatabaseTemplateManager } from './DatabaseTemplateManager';
export type { DatabaseTemplateManagerConfig } from './DatabaseTemplateManager';
export { CategoryManager } from './CategoryManager';
export type { CategoryManagerConfig, Category } from './CategoryManager';
