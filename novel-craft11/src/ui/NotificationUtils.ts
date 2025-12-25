/**
 * NotificationUtils - 通知和用户反馈工具
 * 
 * 提供统一的 toast 通知、加载状态和错误处理功能
 * 需求: 1.6, 3.3
 */

import { Notice } from 'obsidian';

/**
 * 通知类型
 */
export type NotificationType = 'success' | 'error' | 'warning' | 'info';

/**
 * 通知配置
 */
export interface NotificationConfig {
  /** 通知消息 */
  message: string;
  /** 通知类型 */
  type?: NotificationType;
  /** 显示时长（毫秒），0 表示不自动关闭 */
  duration?: number;
  /** 是否显示详细信息 */
  details?: string;
}

/**
 * 异步操作配置
 */
export interface AsyncOperationConfig<T> {
  /** 加载中显示的消息 */
  loadingMessage?: string;
  /** 成功时显示的消息 */
  successMessage?: string | ((result: T) => string);
  /** 错误上下文（用于错误消息前缀） */
  errorContext?: string;
  /** 加载状态变化回调 */
  onLoadingChange?: (loading: boolean, message: string) => void;
  /** 是否在成功时显示通知 */
  showSuccessNotification?: boolean;
  /** 是否在错误时显示通知 */
  showErrorNotification?: boolean;
  /** 重试次数 */
  retryCount?: number;
  /** 重试延迟（毫秒） */
  retryDelay?: number;
}

/**
 * 默认通知时长（毫秒）
 */
const DEFAULT_DURATIONS: Record<NotificationType, number> = {
  success: 3000,
  error: 5000,
  warning: 4000,
  info: 3000
};

/**
 * 通知图标
 */
const NOTIFICATION_ICONS: Record<NotificationType, string> = {
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️'
};

/**
 * 错误类型映射 - 将常见错误转换为用户友好的消息
 */
const ERROR_MESSAGES: Record<string, string> = {
  'Failed to fetch': '网络连接失败，请检查网络状态',
  'NetworkError': '网络错误，请检查网络连接',
  'AbortError': '请求超时，请稍后重试',
  'TypeError': '数据格式错误',
  'SyntaxError': '响应解析失败',
  'ECONNREFUSED': '服务连接被拒绝，请检查服务是否启动',
  'ETIMEDOUT': '连接超时，请稍后重试',
  'ENOTFOUND': '服务地址无法解析，请检查配置'
};

/**
 * 显示通知
 */
export function showNotification(config: NotificationConfig): void {
  const type = config.type || 'info';
  const duration = config.duration ?? DEFAULT_DURATIONS[type];
  const icon = NOTIFICATION_ICONS[type];
  
  let message = `${icon} ${config.message}`;
  if (config.details) {
    message += `\n${config.details}`;
  }
  
  new Notice(message, duration);
}

/**
 * 显示成功通知
 */
export function showSuccess(message: string, duration?: number): void {
  showNotification({ message, type: 'success', duration });
}

/**
 * 显示错误通知
 */
export function showError(message: string, details?: string, duration?: number): void {
  showNotification({ message, type: 'error', details, duration });
}

/**
 * 显示警告通知
 */
export function showWarning(message: string, duration?: number): void {
  showNotification({ message, type: 'warning', duration });
}

/**
 * 显示信息通知
 */
export function showInfo(message: string, duration?: number): void {
  showNotification({ message, type: 'info', duration });
}

/**
 * 错误处理器 - 统一处理错误并显示用户友好的消息
 */
export function handleError(error: unknown, context: string): void {
  const errorMessage = extractErrorMessage(error);
  console.error(`NovelCraft [${context}]:`, error);
  showError(`${context}失败`, errorMessage);
}

/**
 * 从错误对象中提取消息
 */
export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // 检查是否有已知的错误类型映射
    for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
      if (error.message.includes(key) || error.name.includes(key)) {
        return message;
      }
    }
    return error.message;
  }
  if (typeof error === 'string') {
    // 检查字符串错误是否匹配已知类型
    for (const [key, message] of Object.entries(ERROR_MESSAGES)) {
      if (error.includes(key)) {
        return message;
      }
    }
    return error;
  }
  return '未知错误';
}

/**
 * 获取用户友好的错误消息
 */
export function getUserFriendlyErrorMessage(error: unknown, context?: string): string {
  const baseMessage = extractErrorMessage(error);
  return context ? `${context}: ${baseMessage}` : baseMessage;
}

/**
 * 加载状态管理器
 */
export class LoadingState {
  private isLoading = false;
  private loadingMessage = '';
  private onStateChange?: (loading: boolean, message: string) => void;

  constructor(onStateChange?: (loading: boolean, message: string) => void) {
    this.onStateChange = onStateChange;
  }

  /**
   * 开始加载
   */
  start(message: string = '加载中...'): void {
    this.isLoading = true;
    this.loadingMessage = message;
    this.onStateChange?.(true, message);
  }

  /**
   * 更新加载消息
   */
  update(message: string): void {
    this.loadingMessage = message;
    if (this.isLoading) {
      this.onStateChange?.(true, message);
    }
  }

  /**
   * 结束加载
   */
  stop(): void {
    this.isLoading = false;
    this.loadingMessage = '';
    this.onStateChange?.(false, '');
  }

  /**
   * 获取当前加载状态
   */
  getState(): { loading: boolean; message: string } {
    return {
      loading: this.isLoading,
      message: this.loadingMessage
    };
  }
}

/**
 * 异步操作包装器 - 自动处理加载状态和错误
 */
export async function withLoading<T>(
  operation: () => Promise<T>,
  options: AsyncOperationConfig<T> = {}
): Promise<T | null> {
  const {
    loadingMessage = '处理中...',
    successMessage,
    errorContext = '操作',
    onLoadingChange,
    showSuccessNotification = true,
    showErrorNotification = true,
    retryCount = 0,
    retryDelay = 1000
  } = options;

  onLoadingChange?.(true, loadingMessage);

  let lastError: unknown;
  
  try {
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const result = await operation();
        
        if (successMessage && showSuccessNotification) {
          const message = typeof successMessage === 'function' 
            ? successMessage(result) 
            : successMessage;
          showSuccess(message);
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        // 如果还有重试机会，等待后重试
        if (attempt < retryCount) {
          console.warn(`${errorContext} 失败，正在重试 (${attempt + 1}/${retryCount})...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
      }
    }

    // 所有重试都失败了
    if (showErrorNotification) {
      handleError(lastError, errorContext);
    } else {
      console.error(`NovelCraft [${errorContext}]:`, lastError);
    }
    
    return null;
  } finally {
    onLoadingChange?.(false, '');
  }
}

/**
 * 异步操作包装器（带结果类型） - 返回成功/失败状态
 */
export async function withLoadingResult<T>(
  operation: () => Promise<T>,
  options: AsyncOperationConfig<T> = {}
): Promise<{ success: true; data: T } | { success: false; error: string }> {
  const {
    loadingMessage = '处理中...',
    successMessage,
    errorContext = '操作',
    onLoadingChange,
    showSuccessNotification = true,
    showErrorNotification = true,
    retryCount = 0,
    retryDelay = 1000
  } = options;

  onLoadingChange?.(true, loadingMessage);

  let lastError: unknown;
  
  try {
    for (let attempt = 0; attempt <= retryCount; attempt++) {
      try {
        const result = await operation();
        
        if (successMessage && showSuccessNotification) {
          const message = typeof successMessage === 'function' 
            ? successMessage(result) 
            : successMessage;
          showSuccess(message);
        }
        
        return { success: true, data: result };
      } catch (error) {
        lastError = error;
        
        if (attempt < retryCount) {
          console.warn(`${errorContext} 失败，正在重试 (${attempt + 1}/${retryCount})...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
      }
    }

    const errorMessage = extractErrorMessage(lastError);
    
    if (showErrorNotification) {
      handleError(lastError, errorContext);
    } else {
      console.error(`NovelCraft [${errorContext}]:`, lastError);
    }
    
    return { success: false, error: errorMessage };
  } finally {
    onLoadingChange?.(false, '');
  }
}

/**
 * 创建加载指示器 DOM 元素
 */
export function createLoadingIndicator(message: string = '加载中...'): HTMLElement {
  const container = document.createElement('div');
  container.className = 'novel-craft-loading-indicator';
  
  const spinner = document.createElement('div');
  spinner.className = 'novel-craft-spinner';
  container.appendChild(spinner);
  
  const text = document.createElement('span');
  text.className = 'novel-craft-loading-text';
  text.textContent = message;
  container.appendChild(text);
  
  return container;
}

/**
 * 创建错误显示 DOM 元素
 */
export function createErrorDisplay(
  title: string,
  message: string,
  onRetry?: () => void
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'novel-craft-error-display';
  
  const titleEl = document.createElement('div');
  titleEl.className = 'novel-craft-error-title';
  titleEl.textContent = `❌ ${title}`;
  container.appendChild(titleEl);
  
  const messageEl = document.createElement('div');
  messageEl.className = 'novel-craft-error-message';
  messageEl.textContent = message;
  container.appendChild(messageEl);
  
  if (onRetry) {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'novel-craft-retry-button';
    retryBtn.textContent = '重试';
    retryBtn.addEventListener('click', onRetry);
    container.appendChild(retryBtn);
  }
  
  return container;
}

/**
 * 确认对话框
 */
export async function confirmAction(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    // 使用简单的 confirm，因为 Obsidian 没有内置的确认对话框
    // 在实际使用中可以替换为自定义 Modal
    const result = window.confirm(message);
    resolve(result);
  });
}

/**
 * 操作状态管理器 - 用于管理多个并发操作的状态
 */
export class OperationStateManager {
  private operations: Map<string, { loading: boolean; message: string; error?: string }> = new Map();
  private listeners: Set<(operations: Map<string, { loading: boolean; message: string; error?: string }>) => void> = new Set();

  /**
   * 开始操作
   */
  start(operationId: string, message: string = '处理中...'): void {
    this.operations.set(operationId, { loading: true, message });
    this.notifyListeners();
  }

  /**
   * 更新操作消息
   */
  update(operationId: string, message: string): void {
    const op = this.operations.get(operationId);
    if (op) {
      op.message = message;
      this.notifyListeners();
    }
  }

  /**
   * 完成操作（成功）
   */
  complete(operationId: string): void {
    this.operations.delete(operationId);
    this.notifyListeners();
  }

  /**
   * 操作失败
   */
  fail(operationId: string, error: string): void {
    const op = this.operations.get(operationId);
    if (op) {
      op.loading = false;
      op.error = error;
      this.notifyListeners();
    }
  }

  /**
   * 检查是否有任何操作正在进行
   */
  isAnyLoading(): boolean {
    for (const op of this.operations.values()) {
      if (op.loading) return true;
    }
    return false;
  }

  /**
   * 获取操作状态
   */
  getOperation(operationId: string): { loading: boolean; message: string; error?: string } | undefined {
    return this.operations.get(operationId);
  }

  /**
   * 添加状态变化监听器
   */
  addListener(listener: (operations: Map<string, { loading: boolean; message: string; error?: string }>) => void): void {
    this.listeners.add(listener);
  }

  /**
   * 移除监听器
   */
  removeListener(listener: (operations: Map<string, { loading: boolean; message: string; error?: string }>) => void): void {
    this.listeners.delete(listener);
  }

  /**
   * 通知所有监听器
   */
  private notifyListeners(): void {
    for (const listener of this.listeners) {
      listener(this.operations);
    }
  }

  /**
   * 清理所有操作
   */
  clear(): void {
    this.operations.clear();
    this.notifyListeners();
  }
}

/**
 * 全局操作状态管理器实例
 */
export const globalOperationState = new OperationStateManager();

/**
 * 创建带有禁用状态的按钮
 */
export function createActionButton(
  container: HTMLElement,
  text: string,
  onClick: () => Promise<void>,
  options: {
    className?: string;
    loadingText?: string;
    errorContext?: string;
  } = {}
): HTMLButtonElement {
  const { className = '', loadingText = '处理中...', errorContext = '操作' } = options;
  
  const button = container.createEl('button', {
    text,
    cls: `novel-craft-action-button ${className}`.trim()
  });

  let isProcessing = false;
  const originalText = text;

  button.addEventListener('click', async () => {
    if (isProcessing) return;
    
    isProcessing = true;
    button.disabled = true;
    button.textContent = loadingText;
    button.addClass('novel-craft-button-loading');

    try {
      await onClick();
    } catch (error) {
      handleError(error, errorContext);
    } finally {
      isProcessing = false;
      button.disabled = false;
      button.textContent = originalText;
      button.removeClass('novel-craft-button-loading');
    }
  });

  return button;
}

/**
 * 创建带有加载状态的容器
 */
export function createLoadingContainer(
  parent: HTMLElement,
  className: string = ''
): {
  container: HTMLElement;
  showLoading: (message?: string) => void;
  hideLoading: () => void;
  showError: (title: string, message: string, onRetry?: () => void) => void;
  showContent: () => void;
} {
  const container = parent.createDiv({ cls: `novel-craft-loading-container ${className}`.trim() });
  const contentWrapper = container.createDiv({ cls: 'novel-craft-content-wrapper' });
  const loadingWrapper = container.createDiv({ cls: 'novel-craft-loading-wrapper' });
  const errorWrapper = container.createDiv({ cls: 'novel-craft-error-wrapper' });

  loadingWrapper.style.display = 'none';
  errorWrapper.style.display = 'none';

  return {
    container: contentWrapper,
    showLoading: (message = '加载中...') => {
      contentWrapper.style.display = 'none';
      errorWrapper.style.display = 'none';
      loadingWrapper.style.display = 'flex';
      loadingWrapper.empty();
      loadingWrapper.appendChild(createLoadingIndicator(message));
    },
    hideLoading: () => {
      loadingWrapper.style.display = 'none';
    },
    showError: (title: string, message: string, onRetry?: () => void) => {
      contentWrapper.style.display = 'none';
      loadingWrapper.style.display = 'none';
      errorWrapper.style.display = 'block';
      errorWrapper.empty();
      errorWrapper.appendChild(createErrorDisplay(title, message, onRetry));
    },
    showContent: () => {
      loadingWrapper.style.display = 'none';
      errorWrapper.style.display = 'none';
      contentWrapper.style.display = 'block';
    }
  };
}
