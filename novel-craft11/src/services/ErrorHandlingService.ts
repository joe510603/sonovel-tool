import { Notice } from 'obsidian';
import { showError, showWarning, showInfo, extractErrorMessage } from '../ui/NotificationUtils';

/**
 * 错误类型枚举
 */
export enum ErrorType {
  NETWORK = 'network',
  VALIDATION = 'validation',
  STORAGE = 'storage',
  PARSING = 'parsing',
  LLM_SERVICE = 'llm_service',
  MARK_OPERATION = 'mark_operation',
  TEMPLATE = 'template',
  PERFORMANCE = 'performance',
  USER_INPUT = 'user_input',
  SYSTEM = 'system'
}

/**
 * 错误严重程度
 */
export enum ErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical'
}

/**
 * 错误上下文信息
 */
export interface ErrorContext {
  operation: string;
  component: string;
  bookId?: string;
  markId?: string;
  templateId?: string;
  userId?: string;
  timestamp: Date;
  additionalData?: Record<string, any>;
}

/**
 * 错误处理配置
 */
export interface ErrorHandlingConfig {
  /** 是否启用错误日志 */
  enableLogging: boolean;
  /** 是否显示用户通知 */
  showNotifications: boolean;
  /** 是否启用自动重试 */
  enableAutoRetry: boolean;
  /** 最大重试次数 */
  maxRetryAttempts: number;
  /** 重试延迟（毫秒） */
  retryDelay: number;
  /** 是否启用降级处理 */
  enableFallback: boolean;
}

/**
 * 错误记录
 */
export interface ErrorRecord {
  id: string;
  type: ErrorType;
  severity: ErrorSeverity;
  message: string;
  stack?: string;
  context: ErrorContext;
  resolved: boolean;
  retryCount: number;
  timestamp: Date;
}

/**
 * 错误处理结果
 */
export interface ErrorHandlingResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  fallbackUsed?: boolean;
  retryCount?: number;
}

/**
 * ErrorHandlingService - 统一错误处理服务
 * 
 * 提供统一的错误处理、日志记录、重试机制和降级处理
 * Requirements: 所有需求的错误处理
 */
export class ErrorHandlingService {
  private config: ErrorHandlingConfig;
  private errorLog: ErrorRecord[] = [];
  private maxLogSize = 1000;
  
  /** 默认配置 */
  private static readonly DEFAULT_CONFIG: ErrorHandlingConfig = {
    enableLogging: true,
    showNotifications: true,
    enableAutoRetry: true,
    maxRetryAttempts: 3,
    retryDelay: 1000,
    enableFallback: true
  };

  /** 错误类型对应的用户友好消息 */
  private static readonly ERROR_MESSAGES: Record<ErrorType, string> = {
    [ErrorType.NETWORK]: '网络连接异常',
    [ErrorType.VALIDATION]: '数据验证失败',
    [ErrorType.STORAGE]: '数据存储异常',
    [ErrorType.PARSING]: '数据解析失败',
    [ErrorType.LLM_SERVICE]: 'AI 服务异常',
    [ErrorType.MARK_OPERATION]: '标记操作失败',
    [ErrorType.TEMPLATE]: '模板处理异常',
    [ErrorType.PERFORMANCE]: '性能问题',
    [ErrorType.USER_INPUT]: '输入数据异常',
    [ErrorType.SYSTEM]: '系统异常'
  };

  /** 可重试的错误类型 */
  private static readonly RETRYABLE_ERRORS = new Set([
    ErrorType.NETWORK,
    ErrorType.LLM_SERVICE,
    ErrorType.STORAGE,
    ErrorType.PERFORMANCE
  ]);

  constructor(config?: Partial<ErrorHandlingConfig>) {
    this.config = { ...ErrorHandlingService.DEFAULT_CONFIG, ...config };
  }

  // ============ 核心错误处理方法 ============

  /**
   * 处理错误
   */
  async handleError<T = any>(
    error: unknown,
    context: ErrorContext,
    fallbackHandler?: () => Promise<T> | T
  ): Promise<ErrorHandlingResult<T>> {
    const errorRecord = this.createErrorRecord(error, context);
    
    // 记录错误
    if (this.config.enableLogging) {
      this.logError(errorRecord);
    }
    
    // 显示用户通知
    if (this.config.showNotifications) {
      this.showErrorNotification(errorRecord);
    }
    
    // 尝试重试
    if (this.shouldRetry(errorRecord)) {
      const retryResult = await this.attemptRetry(errorRecord, context);
      if (retryResult.success) {
        return retryResult as ErrorHandlingResult<T>;
      }
    }
    
    // 尝试降级处理
    if (this.config.enableFallback && fallbackHandler) {
      try {
        const fallbackData = await fallbackHandler();
        return {
          success: true,
          data: fallbackData,
          fallbackUsed: true,
          retryCount: errorRecord.retryCount
        };
      } catch (fallbackError) {
        console.error('Fallback handler failed:', fallbackError);
      }
    }
    
    return {
      success: false,
      error: this.getUserFriendlyMessage(errorRecord),
      retryCount: errorRecord.retryCount
    };
  }

  /**
   * 包装异步操作，自动处理错误
   */
  async wrapOperation<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    fallbackHandler?: () => Promise<T> | T
  ): Promise<ErrorHandlingResult<T>> {
    try {
      const result = await operation();
      return { success: true, data: result };
    } catch (error) {
      return await this.handleError(error, context, fallbackHandler);
    }
  }

  /**
   * 包装同步操作，自动处理错误
   */
  wrapSyncOperation<T>(
    operation: () => T,
    context: ErrorContext,
    fallbackHandler?: () => T
  ): ErrorHandlingResult<T> {
    try {
      const result = operation();
      return { success: true, data: result };
    } catch (error) {
      const errorRecord = this.createErrorRecord(error, context);
      
      if (this.config.enableLogging) {
        this.logError(errorRecord);
      }
      
      if (this.config.showNotifications) {
        this.showErrorNotification(errorRecord);
      }
      
      if (fallbackHandler) {
        try {
          const fallbackData = fallbackHandler();
          return {
            success: true,
            data: fallbackData,
            fallbackUsed: true
          };
        } catch (fallbackError) {
          console.error('Fallback handler failed:', fallbackError);
        }
      }
      
      return {
        success: false,
        error: this.getUserFriendlyMessage(errorRecord)
      };
    }
  }

  // ============ 特定错误处理方法 ============

  /**
   * 处理标记操作错误
   */
  async handleMarkOperationError(
    error: unknown,
    operation: string,
    markId?: string,
    bookId?: string
  ): Promise<ErrorHandlingResult> {
    const context: ErrorContext = {
      operation,
      component: 'InteractiveMarkingService',
      markId,
      bookId,
      timestamp: new Date()
    };
    
    return await this.handleError(error, context, () => {
      // 标记操作的降级处理
      showWarning(`${operation}暂时不可用，请稍后重试`);
      return null;
    });
  }

  /**
   * 处理 AI 分析错误
   */
  async handleAIAnalysisError(
    error: unknown,
    templateId?: string,
    markPairId?: string
  ): Promise<ErrorHandlingResult> {
    const context: ErrorContext = {
      operation: 'AI分析',
      component: 'StoryAnalyzer',
      templateId,
      markId: markPairId,
      timestamp: new Date()
    };
    
    return await this.handleError(error, context, () => {
      // AI 分析的降级处理：返回基础分析结果
      return {
        templateId: templateId || 'fallback',
        sections: { '分析结果': '由于AI服务暂时不可用，请手动编辑分析内容' },
        emotionCurve: [],
        characterRoles: [],
        techniques: [],
        summary: 'AI分析服务暂时不可用，已启用降级模式',
        editHistory: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
    });
  }

  /**
   * 处理模板操作错误
   */
  async handleTemplateError(
    error: unknown,
    operation: string,
    templateId?: string
  ): Promise<ErrorHandlingResult> {
    const context: ErrorContext = {
      operation,
      component: 'TemplateService',
      templateId,
      timestamp: new Date()
    };
    
    return await this.handleError(error, context);
  }

  /**
   * 处理存储错误
   */
  async handleStorageError(
    error: unknown,
    operation: string,
    bookId?: string
  ): Promise<ErrorHandlingResult> {
    const context: ErrorContext = {
      operation,
      component: 'InteractiveMarkRepository',
      bookId,
      timestamp: new Date()
    };
    
    return await this.handleError(error, context, () => {
      // 存储错误的降级处理
      showWarning('数据保存失败，请检查磁盘空间或权限设置');
      return null;
    });
  }

  /**
   * 处理性能问题
   */
  handlePerformanceIssue(
    operation: string,
    duration: number,
    threshold: number = 5000
  ): void {
    if (duration > threshold) {
      const context: ErrorContext = {
        operation,
        component: 'PerformanceMonitor',
        timestamp: new Date(),
        additionalData: { duration, threshold }
      };
      
      const errorRecord: ErrorRecord = {
        id: this.generateId(),
        type: ErrorType.PERFORMANCE,
        severity: duration > threshold * 2 ? ErrorSeverity.HIGH : ErrorSeverity.MEDIUM,
        message: `操作 ${operation} 执行时间过长: ${duration}ms`,
        context,
        resolved: false,
        retryCount: 0,
        timestamp: new Date()
      };
      
      if (this.config.enableLogging) {
        this.logError(errorRecord);
      }
      
      if (duration > threshold * 3) {
        showWarning(`${operation} 执行较慢，建议检查网络连接或减少数据量`);
      }
    }
  }

  // ============ 重试机制 ============

  /**
   * 判断是否应该重试
   */
  private shouldRetry(errorRecord: ErrorRecord): boolean {
    return this.config.enableAutoRetry &&
           errorRecord.retryCount < this.config.maxRetryAttempts &&
           ErrorHandlingService.RETRYABLE_ERRORS.has(errorRecord.type);
  }

  /**
   * 尝试重试操作
   */
  private async attemptRetry<T>(
    errorRecord: ErrorRecord,
    context: ErrorContext
  ): Promise<ErrorHandlingResult<T>> {
    // 这里需要重新执行原始操作，但由于我们没有保存原始操作的引用，
    // 实际实现中需要调用方提供重试函数
    return { success: false, error: 'Retry not implemented' };
  }

  /**
   * 带重试的操作包装器
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    maxAttempts?: number
  ): Promise<ErrorHandlingResult<T>> {
    const attempts = maxAttempts || this.config.maxRetryAttempts;
    let lastError: unknown;
    
    for (let attempt = 1; attempt <= attempts; attempt++) {
      try {
        const result = await operation();
        return { success: true, data: result, retryCount: attempt - 1 };
      } catch (error) {
        lastError = error;
        
        if (attempt < attempts) {
          // 等待后重试
          await this.delay(this.config.retryDelay * attempt);
          console.warn(`${context.operation} 重试 ${attempt}/${attempts - 1}`);
        }
      }
    }
    
    // 所有重试都失败了
    return await this.handleError(lastError, {
      ...context,
      additionalData: { ...context.additionalData, retryCount: attempts - 1 }
    });
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ============ 错误记录和日志 ============

  /**
   * 创建错误记录
   */
  private createErrorRecord(error: unknown, context: ErrorContext): ErrorRecord {
    const errorType = this.classifyError(error, context);
    const severity = this.determineSeverity(errorType, error);
    
    return {
      id: this.generateId(),
      type: errorType,
      severity,
      message: extractErrorMessage(error),
      stack: error instanceof Error ? error.stack : undefined,
      context,
      resolved: false,
      retryCount: 0,
      timestamp: new Date()
    };
  }

  /**
   * 分类错误类型
   */
  private classifyError(error: unknown, context: ErrorContext): ErrorType {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      // 网络错误
      if (message.includes('fetch') || message.includes('network') || 
          message.includes('timeout') || message.includes('connection')) {
        return ErrorType.NETWORK;
      }
      
      // LLM 服务错误
      if (message.includes('llm') || message.includes('api') || 
          context.component === 'StoryAnalyzer') {
        return ErrorType.LLM_SERVICE;
      }
      
      // 存储错误
      if (message.includes('storage') || message.includes('save') || 
          message.includes('file') || context.component === 'InteractiveMarkRepository') {
        return ErrorType.STORAGE;
      }
      
      // 标记操作错误
      if (context.component === 'InteractiveMarkingService') {
        return ErrorType.MARK_OPERATION;
      }
      
      // 模板错误
      if (context.component === 'TemplateService') {
        return ErrorType.TEMPLATE;
      }
      
      // 验证错误
      if (message.includes('validation') || message.includes('invalid')) {
        return ErrorType.VALIDATION;
      }
      
      // 解析错误
      if (message.includes('parse') || message.includes('json') || 
          message.includes('syntax')) {
        return ErrorType.PARSING;
      }
    }
    
    return ErrorType.SYSTEM;
  }

  /**
   * 确定错误严重程度
   */
  private determineSeverity(errorType: ErrorType, error: unknown): ErrorSeverity {
    // 关键错误类型
    if (errorType === ErrorType.STORAGE || errorType === ErrorType.SYSTEM) {
      return ErrorSeverity.HIGH;
    }
    
    // 中等严重程度
    if (errorType === ErrorType.LLM_SERVICE || errorType === ErrorType.MARK_OPERATION) {
      return ErrorSeverity.MEDIUM;
    }
    
    // 低严重程度
    return ErrorSeverity.LOW;
  }

  /**
   * 记录错误到日志
   */
  private logError(errorRecord: ErrorRecord): void {
    this.errorLog.push(errorRecord);
    
    // 限制日志大小
    if (this.errorLog.length > this.maxLogSize) {
      this.errorLog = this.errorLog.slice(-this.maxLogSize);
    }
    
    // 控制台输出
    const logLevel = this.getLogLevel(errorRecord.severity);
    console[logLevel](`[NovelCraft Error] ${errorRecord.context.component}.${errorRecord.context.operation}:`, {
      type: errorRecord.type,
      severity: errorRecord.severity,
      message: errorRecord.message,
      context: errorRecord.context,
      stack: errorRecord.stack
    });
  }

  /**
   * 获取日志级别
   */
  private getLogLevel(severity: ErrorSeverity): 'error' | 'warn' | 'info' {
    switch (severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        return 'error';
      case ErrorSeverity.MEDIUM:
        return 'warn';
      default:
        return 'info';
    }
  }

  /**
   * 显示错误通知
   */
  private showErrorNotification(errorRecord: ErrorRecord): void {
    const message = this.getUserFriendlyMessage(errorRecord);
    
    switch (errorRecord.severity) {
      case ErrorSeverity.CRITICAL:
      case ErrorSeverity.HIGH:
        showError(message, errorRecord.message);
        break;
      case ErrorSeverity.MEDIUM:
        showWarning(message);
        break;
      default:
        showInfo(message);
        break;
    }
  }

  /**
   * 获取用户友好的错误消息
   */
  private getUserFriendlyMessage(errorRecord: ErrorRecord): string {
    const baseMessage = ErrorHandlingService.ERROR_MESSAGES[errorRecord.type];
    const operation = errorRecord.context.operation;
    
    return `${operation}时发生${baseMessage}`;
  }

  // ============ 错误统计和分析 ============

  /**
   * 获取错误统计
   */
  getErrorStatistics(): {
    totalErrors: number;
    errorsByType: Record<ErrorType, number>;
    errorsBySeverity: Record<ErrorSeverity, number>;
    recentErrors: ErrorRecord[];
    topErrors: Array<{ message: string; count: number }>;
  } {
    const errorsByType: Record<ErrorType, number> = {} as any;
    const errorsBySeverity: Record<ErrorSeverity, number> = {} as any;
    const errorCounts: Record<string, number> = {};
    
    // 初始化计数器
    Object.values(ErrorType).forEach(type => {
      errorsByType[type] = 0;
    });
    Object.values(ErrorSeverity).forEach(severity => {
      errorsBySeverity[severity] = 0;
    });
    
    // 统计错误
    for (const error of this.errorLog) {
      errorsByType[error.type]++;
      errorsBySeverity[error.severity]++;
      errorCounts[error.message] = (errorCounts[error.message] || 0) + 1;
    }
    
    // 获取最近的错误
    const recentErrors = this.errorLog
      .slice(-10)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // 获取最常见的错误
    const topErrors = Object.entries(errorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([message, count]) => ({ message, count }));
    
    return {
      totalErrors: this.errorLog.length,
      errorsByType,
      errorsBySeverity,
      recentErrors,
      topErrors
    };
  }

  /**
   * 清理错误日志
   */
  clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * 获取特定类型的错误
   */
  getErrorsByType(type: ErrorType): ErrorRecord[] {
    return this.errorLog.filter(error => error.type === type);
  }

  /**
   * 获取特定组件的错误
   */
  getErrorsByComponent(component: string): ErrorRecord[] {
    return this.errorLog.filter(error => error.context.component === component);
  }

  /**
   * 标记错误为已解决
   */
  markErrorAsResolved(errorId: string): boolean {
    const error = this.errorLog.find(e => e.id === errorId);
    if (error) {
      error.resolved = true;
      return true;
    }
    return false;
  }

  // ============ 配置管理 ============

  /**
   * 更新配置
   */
  updateConfig(config: Partial<ErrorHandlingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取当前配置
   */
  getConfig(): ErrorHandlingConfig {
    return { ...this.config };
  }

  // ============ 辅助方法 ============

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `error_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    this.errorLog = [];
  }
}

/**
 * 全局错误处理服务实例
 */
export const globalErrorHandler = new ErrorHandlingService();

/**
 * 错误处理装饰器
 */
export function handleErrors(
  errorType: ErrorType,
  component: string,
  fallbackValue?: any
) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = async function (...args: any[]) {
      const context: ErrorContext = {
        operation: propertyKey,
        component,
        timestamp: new Date()
      };
      
      try {
        return await originalMethod.apply(this, args);
      } catch (error) {
        const result = await globalErrorHandler.handleError(
          error,
          context,
          fallbackValue ? () => fallbackValue : undefined
        );
        
        if (result.success) {
          return result.data;
        } else {
          throw new Error(result.error);
        }
      }
    };
    
    return descriptor;
  };
}