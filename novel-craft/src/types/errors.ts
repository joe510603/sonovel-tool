/**
 * 错误处理相关类型定义
 * 定义插件特有的错误类型和错误处理机制
 */

/**
 * 插件错误基类
 * 所有插件特有错误都应继承此类
 */
export abstract class TimelinePluginError extends Error {
  /** 错误代码 */
  abstract readonly code: string;
  /** 用户友好的中文错误信息 */
  abstract readonly userMessage: string;
  
  constructor(
    message: string, 
    public readonly context?: any,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    
    // 保持错误堆栈信息
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
  
  /**
   * 获取完整的错误信息（包含上下文）
   */
  getFullMessage(): string {
    let fullMessage = this.userMessage;
    if (this.context) {
      fullMessage += `\n上下文信息: ${JSON.stringify(this.context, null, 2)}`;
    }
    if (this.originalError) {
      fullMessage += `\n原始错误: ${this.originalError.message}`;
    }
    return fullMessage;
  }
}

/**
 * 故事单元相关错误
 */
export class StoryUnitError extends TimelinePluginError {
  readonly code = 'STORY_UNIT_ERROR';
  readonly userMessage: string;
  
  constructor(
    message: string, 
    public readonly unitId?: string,
    context?: any,
    originalError?: Error
  ) {
    super(message, context, originalError);
    this.userMessage = `故事单元操作失败：${message}${unitId ? `（单元ID：${unitId}）` : ''}`;
  }
}

/**
 * 故事单元标记错误
 * 处理跨章节标记相关的错误
 */
export class StoryUnitMarkError extends TimelinePluginError {
  readonly code = 'STORY_UNIT_MARK_ERROR';
  readonly userMessage: string;
  
  constructor(
    message: string, 
    public readonly markId?: string,
    context?: any,
    originalError?: Error
  ) {
    super(message, context, originalError);
    this.userMessage = `故事单元标记异常：${message}${markId ? `（标记ID：${markId}）` : ''}`;
  }
}

/**
 * AI分析错误
 */
export class AIAnalysisError extends TimelinePluginError {
  readonly code = 'AI_ANALYSIS_ERROR';
  readonly userMessage: string;
  
  constructor(
    message: string, 
    public readonly templateName?: string,
    public readonly unitId?: string,
    context?: any,
    originalError?: Error
  ) {
    super(message, context, originalError);
    this.userMessage = `AI分析失败：${message}${templateName ? `（模板：${templateName}）` : ''}${unitId ? `（单元ID：${unitId}）` : ''}`;
  }
}

/**
 * 时间线渲染错误
 */
export class TimelineRenderError extends TimelinePluginError {
  readonly code = 'TIMELINE_RENDER_ERROR';
  readonly userMessage: string;
  
  constructor(
    message: string, 
    public readonly bookId?: string,
    context?: any,
    originalError?: Error
  ) {
    super(message, context, originalError);
    this.userMessage = `时间线渲染失败：${message}${bookId ? `（书籍ID：${bookId}）` : ''}`;
  }
}

/**
 * 人物关系图谱错误
 */
export class CharacterGraphError extends TimelinePluginError {
  readonly code = 'CHARACTER_GRAPH_ERROR';
  readonly userMessage: string;
  
  constructor(
    message: string, 
    public readonly unitId?: string,
    context?: any,
    originalError?: Error
  ) {
    super(message, context, originalError);
    this.userMessage = `人物关系图谱操作失败：${message}${unitId ? `（单元ID：${unitId}）` : ''}`;
  }
}

/**
 * 人物关系错误
 */
export class CharacterRelationError extends TimelinePluginError {
  readonly code = 'CHARACTER_RELATION_ERROR';
  readonly userMessage: string;
  
  constructor(
    message: string, 
    public readonly relationId?: string,
    context?: any,
    originalError?: Error
  ) {
    super(message, context, originalError);
    this.userMessage = `人物关系操作失败：${message}${relationId ? `（关系ID：${relationId}）` : ''}`;
  }
}

/**
 * 数据同步错误
 */
export class DataSyncError extends TimelinePluginError {
  readonly code = 'DATA_SYNC_ERROR';
  readonly userMessage: string;
  
  constructor(
    message: string, 
    public readonly filePath?: string,
    context?: any,
    originalError?: Error
  ) {
    super(message, context, originalError);
    this.userMessage = `数据同步失败：${message}${filePath ? `（文件：${filePath}）` : ''}`;
  }
}

/**
 * 文件导入错误
 */
export class ImportError extends TimelinePluginError {
  readonly code = 'IMPORT_ERROR';
  readonly userMessage: string;
  
  constructor(
    message: string, 
    public readonly fileName: string,
    context?: any,
    originalError?: Error
  ) {
    super(message, context, originalError);
    this.userMessage = `导入文件 "${fileName}" 时发生错误：${message}`;
  }
}

/**
 * 数据库操作错误
 */
export class DatabaseError extends TimelinePluginError {
  readonly code = 'DATABASE_ERROR';
  readonly userMessage: string;
  
  constructor(
    message: string, 
    public readonly operation?: string,
    public readonly tableName?: string,
    context?: any,
    originalError?: Error
  ) {
    super(message, context, originalError);
    this.userMessage = `数据库操作失败：${message}${operation ? `（操作：${operation}）` : ''}${tableName ? `（表：${tableName}）` : ''}`;
  }
}

/**
 * 配置错误
 */
export class ConfigurationError extends TimelinePluginError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly userMessage: string;
  
  constructor(
    message: string, 
    public readonly configKey?: string,
    context?: any,
    originalError?: Error
  ) {
    super(message, context, originalError);
    this.userMessage = `配置错误：${message}${configKey ? `（配置项：${configKey}）` : ''}`;
  }
}

/**
 * 验证错误
 */
export class ValidationError extends TimelinePluginError {
  readonly code = 'VALIDATION_ERROR';
  readonly userMessage: string;
  
  constructor(
    message: string, 
    public readonly fieldName?: string,
    public readonly fieldValue?: any,
    context?: any,
    originalError?: Error
  ) {
    super(message, context, originalError);
    this.userMessage = `数据验证失败：${message}${fieldName ? `（字段：${fieldName}）` : ''}`;
  }
}

/**
 * 网络请求错误
 */
export class NetworkError extends TimelinePluginError {
  readonly code = 'NETWORK_ERROR';
  readonly userMessage: string;
  
  constructor(
    message: string, 
    public readonly url?: string,
    public readonly statusCode?: number,
    context?: any,
    originalError?: Error
  ) {
    super(message, context, originalError);
    this.userMessage = `网络请求失败：${message}${url ? `（URL：${url}）` : ''}${statusCode ? `（状态码：${statusCode}）` : ''}`;
  }
}

/**
 * 文件系统错误
 */
export class FileSystemError extends TimelinePluginError {
  readonly code = 'FILE_SYSTEM_ERROR';
  readonly userMessage: string;
  
  constructor(
    message: string, 
    public readonly filePath?: string,
    public readonly operation?: string,
    context?: any,
    originalError?: Error
  ) {
    super(message, context, originalError);
    this.userMessage = `文件系统操作失败：${message}${filePath ? `（文件：${filePath}）` : ''}${operation ? `（操作：${operation}）` : ''}`;
  }
}

/**
 * Result模式类型定义
 * 用于处理可能失败的操作
 */
export type Result<T, E = TimelinePluginError> = 
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * 创建成功结果
 */
export function createSuccess<T>(data: T): Result<T> {
  return { success: true, data };
}

/**
 * 创建失败结果
 */
export function createFailure<E extends TimelinePluginError>(error: E): Result<never, E> {
  return { success: false, error };
}

/**
 * 错误日志级别
 */
export enum LogLevel {
  /** 调试信息 */
  DEBUG = 'debug',
  /** 普通信息 */
  INFO = 'info',
  /** 警告信息 */
  WARN = 'warn',
  /** 错误信息 */
  ERROR = 'error',
  /** 致命错误 */
  FATAL = 'fatal'
}

/**
 * 错误日志记录
 */
export interface ErrorLogRecord {
  /** 时间戳 */
  timestamp: number;
  /** 日志级别 */
  level: LogLevel;
  /** 错误代码 */
  errorCode: string;
  /** 错误消息 */
  message: string;
  /** 上下文信息 */
  context?: any;
  /** 错误堆栈 */
  stack?: string;
  /** 用户ID（如果有） */
  userId?: string;
  /** 会话ID */
  sessionId?: string;
}

/**
 * 错误处理器接口
 */
export interface ErrorHandler {
  /**
   * 处理错误
   * @param error 错误对象
   * @param context 上下文信息
   */
  handleError(error: TimelinePluginError, context?: any): void;
  
  /**
   * 记录错误日志
   * @param record 日志记录
   */
  logError(record: ErrorLogRecord): void;
  
  /**
   * 获取错误统计
   * @returns 错误统计信息
   */
  getErrorStats(): ErrorStats;
}

/**
 * 错误统计信息
 */
export interface ErrorStats {
  /** 总错误数 */
  totalErrors: number;
  /** 按错误代码分组的统计 */
  byErrorCode: Record<string, number>;
  /** 按日志级别分组的统计 */
  byLogLevel: Record<LogLevel, number>;
  /** 最近24小时错误数 */
  last24Hours: number;
  /** 最常见的错误 */
  mostCommonErrors: Array<{
    code: string;
    count: number;
    lastOccurred: number;
  }>;
}

/**
 * 错误恢复策略
 */
export interface ErrorRecoveryStrategy {
  /** 策略名称 */
  name: string;
  /** 是否可以自动恢复 */
  canAutoRecover: boolean;
  /** 最大重试次数 */
  maxRetries: number;
  /** 重试间隔（毫秒） */
  retryInterval: number;
  
  /**
   * 执行恢复操作
   * @param error 错误对象
   * @param context 上下文信息
   * @returns 是否恢复成功
   */
  recover(error: TimelinePluginError, context?: any): Promise<boolean>;
}

/**
 * 错误恢复结果
 */
export interface ErrorRecoveryResult {
  /** 是否恢复成功 */
  success: boolean;
  /** 使用的策略 */
  strategy: string;
  /** 重试次数 */
  retryCount: number;
  /** 恢复耗时（毫秒） */
  recoveryTime: number;
  /** 错误信息（如果恢复失败） */
  error?: string;
}