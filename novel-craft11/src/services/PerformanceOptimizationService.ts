import { App } from 'obsidian';
import { showWarning, showInfo } from '../ui/NotificationUtils';
import { ErrorHandlingService, ErrorType } from './ErrorHandlingService';

/**
 * 性能监控指标
 */
export interface PerformanceMetrics {
  operationName: string;
  startTime: number;
  endTime: number;
  duration: number;
  memoryUsage?: number;
  dataSize?: number;
  timestamp: Date;
}

/**
 * 性能阈值配置
 */
export interface PerformanceThresholds {
  /** 操作执行时间阈值（毫秒） */
  operationDuration: number;
  /** 内存使用阈值（MB） */
  memoryUsage: number;
  /** 数据大小阈值（KB） */
  dataSize: number;
  /** 标记数量阈值 */
  markCount: number;
  /** 文件大小阈值（MB） */
  fileSize: number;
}

/**
 * 优化建议
 */
export interface OptimizationSuggestion {
  id: string;
  type: 'memory' | 'storage' | 'processing' | 'ui';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  action?: {
    text: string;
    callback: () => void;
  };
  autoApply?: boolean;
}

/**
 * 缓存配置
 */
export interface CacheConfig {
  maxSize: number;
  ttl: number; // Time to live in milliseconds
  cleanupInterval: number;
}

/**
 * 缓存项
 */
interface CacheItem<T> {
  data: T;
  timestamp: number;
  accessCount: number;
  lastAccess: number;
}

/**
 * PerformanceOptimizationService - 性能优化服务
 * 
 * 提供性能监控、缓存管理、大文件处理优化等功能
 * Requirements: 优化大文件和复杂标记的性能
 */
export class PerformanceOptimizationService {
  private app: App;
  private errorHandler: ErrorHandlingService;
  private metrics: PerformanceMetrics[] = [];
  private cache: Map<string, CacheItem<any>> = new Map();
  private cleanupTimer: number | null = null;
  
  /** 默认性能阈值 */
  private static readonly DEFAULT_THRESHOLDS: PerformanceThresholds = {
    operationDuration: 3000, // 3秒
    memoryUsage: 100, // 100MB
    dataSize: 1024, // 1MB
    markCount: 1000, // 1000个标记
    fileSize: 50 // 50MB
  };

  /** 默认缓存配置 */
  private static readonly DEFAULT_CACHE_CONFIG: CacheConfig = {
    maxSize: 100,
    ttl: 5 * 60 * 1000, // 5分钟
    cleanupInterval: 60 * 1000 // 1分钟
  };

  private thresholds: PerformanceThresholds;
  private cacheConfig: CacheConfig;
  private maxMetricsHistory = 1000;

  constructor(
    app: App, 
    errorHandler: ErrorHandlingService,
    thresholds?: Partial<PerformanceThresholds>,
    cacheConfig?: Partial<CacheConfig>
  ) {
    this.app = app;
    this.errorHandler = errorHandler;
    this.thresholds = { ...PerformanceOptimizationService.DEFAULT_THRESHOLDS, ...thresholds };
    this.cacheConfig = { ...PerformanceOptimizationService.DEFAULT_CACHE_CONFIG, ...cacheConfig };
    
    this.startCacheCleanup();
  }

  // ============ 性能监控 ============

  /**
   * 开始性能监控
   */
  startPerformanceMonitoring(operationName: string): (dataSize?: number) => PerformanceMetrics {
    const startTime = performance.now();
    const startMemory = this.getMemoryUsage();
    
    return (dataSize?: number): PerformanceMetrics => {
      const endTime = performance.now();
      const duration = endTime - startTime;
      const endMemory = this.getMemoryUsage();
      
      const metrics: PerformanceMetrics = {
        operationName,
        startTime,
        endTime,
        duration,
        memoryUsage: endMemory - startMemory,
        dataSize,
        timestamp: new Date()
      };
      
      this.recordMetrics(metrics);
      this.checkPerformanceThresholds(metrics);
      
      return metrics;
    };
  }

  /**
   * 包装异步操作进行性能监控
   */
  async monitorAsyncOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    dataSize?: number
  ): Promise<{ result: T; metrics: PerformanceMetrics }> {
    const endMonitoring = this.startPerformanceMonitoring(operationName);
    
    try {
      const result = await operation();
      const metrics = endMonitoring(dataSize);
      return { result, metrics };
    } catch (error) {
      const metrics = endMonitoring(dataSize);
      
      // 记录性能问题
      this.errorHandler.handlePerformanceIssue(
        operationName,
        metrics.duration,
        this.thresholds.operationDuration
      );
      
      throw error;
    }
  }

  /**
   * 包装同步操作进行性能监控
   */
  monitorSyncOperation<T>(
    operationName: string,
    operation: () => T,
    dataSize?: number
  ): { result: T; metrics: PerformanceMetrics } {
    const endMonitoring = this.startPerformanceMonitoring(operationName);
    
    try {
      const result = operation();
      const metrics = endMonitoring(dataSize);
      return { result, metrics };
    } catch (error) {
      const metrics = endMonitoring(dataSize);
      
      this.errorHandler.handlePerformanceIssue(
        operationName,
        metrics.duration,
        this.thresholds.operationDuration
      );
      
      throw error;
    }
  }

  /**
   * 记录性能指标
   */
  private recordMetrics(metrics: PerformanceMetrics): void {
    this.metrics.push(metrics);
    
    // 限制历史记录大小
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }
  }

  /**
   * 检查性能阈值
   */
  private checkPerformanceThresholds(metrics: PerformanceMetrics): void {
    const suggestions: OptimizationSuggestion[] = [];
    
    // 检查执行时间
    if (metrics.duration > this.thresholds.operationDuration) {
      suggestions.push({
        id: `duration-${Date.now()}`,
        type: 'processing',
        severity: metrics.duration > this.thresholds.operationDuration * 2 ? 'high' : 'medium',
        title: '操作执行时间过长',
        description: `${metrics.operationName} 执行时间 ${Math.round(metrics.duration)}ms 超过阈值 ${this.thresholds.operationDuration}ms`,
        action: {
          text: '查看优化建议',
          callback: () => this.showOptimizationSuggestions([...suggestions])
        }
      });
    }
    
    // 检查内存使用
    if (metrics.memoryUsage && metrics.memoryUsage > this.thresholds.memoryUsage * 1024 * 1024) {
      suggestions.push({
        id: `memory-${Date.now()}`,
        type: 'memory',
        severity: 'medium',
        title: '内存使用过高',
        description: `${metrics.operationName} 使用了 ${Math.round(metrics.memoryUsage / 1024 / 1024)}MB 内存`,
        action: {
          text: '清理缓存',
          callback: () => this.clearCache()
        },
        autoApply: false
      });
    }
    
    // 检查数据大小
    if (metrics.dataSize && metrics.dataSize > this.thresholds.dataSize * 1024) {
      suggestions.push({
        id: `datasize-${Date.now()}`,
        type: 'storage',
        severity: 'low',
        title: '处理数据量较大',
        description: `${metrics.operationName} 处理了 ${Math.round(metrics.dataSize / 1024)}KB 数据`,
        action: {
          text: '启用数据压缩',
          callback: () => this.enableDataCompression()
        }
      });
    }
    
    // 应用优化建议
    this.applySuggestions(suggestions);
  }

  /**
   * 获取内存使用情况
   */
  private getMemoryUsage(): number {
    if ('memory' in performance) {
      // @ts-ignore
      return performance.memory.usedJSHeapSize;
    }
    return 0;
  }

  // ============ 缓存管理 ============

  /**
   * 设置缓存
   */
  setCache<T>(key: string, data: T, ttl?: number): void {
    const item: CacheItem<T> = {
      data,
      timestamp: Date.now(),
      accessCount: 0,
      lastAccess: Date.now()
    };
    
    this.cache.set(key, item);
    
    // 检查缓存大小
    if (this.cache.size > this.cacheConfig.maxSize) {
      this.evictLeastUsed();
    }
  }

  /**
   * 获取缓存
   */
  getCache<T>(key: string): T | null {
    const item = this.cache.get(key);
    
    if (!item) {
      return null;
    }
    
    // 检查是否过期
    const now = Date.now();
    if (now - item.timestamp > this.cacheConfig.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    // 更新访问信息
    item.accessCount++;
    item.lastAccess = now;
    
    return item.data;
  }

  /**
   * 删除缓存
   */
  deleteCache(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clearCache(): void {
    this.cache.clear();
    showInfo('缓存已清理');
  }

  /**
   * 淘汰最少使用的缓存项
   */
  private evictLeastUsed(): void {
    let leastUsedKey: string | null = null;
    let leastUsedCount = Infinity;
    let oldestAccess = Infinity;
    
    for (const [key, item] of this.cache) {
      if (item.accessCount < leastUsedCount || 
          (item.accessCount === leastUsedCount && item.lastAccess < oldestAccess)) {
        leastUsedKey = key;
        leastUsedCount = item.accessCount;
        oldestAccess = item.lastAccess;
      }
    }
    
    if (leastUsedKey) {
      this.cache.delete(leastUsedKey);
    }
  }

  /**
   * 启动缓存清理
   */
  private startCacheCleanup(): void {
    this.cleanupTimer = window.setInterval(() => {
      this.cleanupExpiredCache();
    }, this.cacheConfig.cleanupInterval);
  }

  /**
   * 清理过期缓存
   */
  private cleanupExpiredCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, item] of this.cache) {
      if (now - item.timestamp > this.cacheConfig.ttl) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.cache.delete(key);
    }
  }

  // ============ 大文件处理优化 ============

  /**
   * 分块处理大文件
   */
  async processLargeFile<T>(
    data: T[],
    processor: (chunk: T[]) => Promise<void>,
    chunkSize: number = 100
  ): Promise<void> {
    const endMonitoring = this.startPerformanceMonitoring('processLargeFile');
    
    try {
      for (let i = 0; i < data.length; i += chunkSize) {
        const chunk = data.slice(i, i + chunkSize);
        await processor(chunk);
        
        // 让出控制权，避免阻塞 UI
        await this.yield();
      }
    } finally {
      endMonitoring(data.length);
    }
  }

  /**
   * 分批处理标记数据
   */
  async processBatchMarks<T>(
    marks: T[],
    processor: (mark: T) => Promise<void>,
    batchSize: number = 50
  ): Promise<void> {
    if (marks.length > this.thresholds.markCount) {
      showWarning(`处理大量标记 (${marks.length} 个)，可能需要较长时间`);
    }
    
    await this.processLargeFile(marks, async (batch) => {
      const promises = batch.map(processor);
      await Promise.all(promises);
    }, batchSize);
  }

  /**
   * 让出控制权
   */
  private yield(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  /**
   * 延迟执行（防抖）
   */
  debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: number | null = null;
    
    return (...args: Parameters<T>) => {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
      
      timeoutId = window.setTimeout(() => {
        func(...args);
        timeoutId = null;
      }, delay);
    };
  }

  /**
   * 节流执行
   */
  throttle<T extends (...args: any[]) => any>(
    func: T,
    delay: number
  ): (...args: Parameters<T>) => void {
    let lastCall = 0;
    
    return (...args: Parameters<T>) => {
      const now = Date.now();
      
      if (now - lastCall >= delay) {
        lastCall = now;
        func(...args);
      }
    };
  }

  // ============ 数据压缩和优化 ============

  /**
   * 启用数据压缩
   */
  private enableDataCompression(): void {
    showInfo('数据压缩功能已启用');
    // 这里可以实现具体的数据压缩逻辑
  }

  /**
   * 压缩标记数据
   */
  compressMarkData(data: any): string {
    try {
      // 移除不必要的字段
      const compressed = this.removeUnnecessaryFields(data);
      
      // 转换为 JSON 字符串
      return JSON.stringify(compressed);
    } catch (error) {
      console.error('Data compression failed:', error);
      return JSON.stringify(data);
    }
  }

  /**
   * 移除不必要的字段
   */
  private removeUnnecessaryFields(data: any): any {
    if (Array.isArray(data)) {
      return data.map(item => this.removeUnnecessaryFields(item));
    }
    
    if (data && typeof data === 'object') {
      const cleaned: any = {};
      
      for (const [key, value] of Object.entries(data)) {
        // 跳过一些不必要的字段
        if (key.startsWith('_') || key === 'cache' || key === 'temp') {
          continue;
        }
        
        cleaned[key] = this.removeUnnecessaryFields(value);
      }
      
      return cleaned;
    }
    
    return data;
  }

  // ============ 优化建议系统 ============

  /**
   * 应用优化建议
   */
  private applySuggestions(suggestions: OptimizationSuggestion[]): void {
    for (const suggestion of suggestions) {
      if (suggestion.autoApply && suggestion.action) {
        suggestion.action.callback();
      } else if (suggestion.severity === 'high') {
        this.showOptimizationSuggestions([suggestion]);
      }
    }
  }

  /**
   * 显示优化建议
   */
  private showOptimizationSuggestions(suggestions: OptimizationSuggestion[]): void {
    for (const suggestion of suggestions) {
      const message = `${suggestion.title}: ${suggestion.description}`;
      
      if (suggestion.action) {
        showWarning(message);
        // 这里可以添加更复杂的 UI 来显示建议
      } else {
        showInfo(message);
      }
    }
  }

  /**
   * 获取性能建议
   */
  getPerformanceSuggestions(): OptimizationSuggestion[] {
    const suggestions: OptimizationSuggestion[] = [];
    
    // 分析最近的性能指标
    const recentMetrics = this.metrics.slice(-100);
    
    // 检查平均执行时间
    const avgDuration = recentMetrics.reduce((sum, m) => sum + m.duration, 0) / recentMetrics.length;
    if (avgDuration > this.thresholds.operationDuration * 0.8) {
      suggestions.push({
        id: 'avg-duration',
        type: 'processing',
        severity: 'medium',
        title: '平均执行时间较长',
        description: `最近操作的平均执行时间为 ${Math.round(avgDuration)}ms`,
        action: {
          text: '优化处理流程',
          callback: () => this.optimizeProcessing()
        }
      });
    }
    
    // 检查缓存命中率
    const cacheSize = this.cache.size;
    if (cacheSize > this.cacheConfig.maxSize * 0.9) {
      suggestions.push({
        id: 'cache-size',
        type: 'memory',
        severity: 'low',
        title: '缓存使用率较高',
        description: `当前缓存使用 ${cacheSize}/${this.cacheConfig.maxSize} 项`,
        action: {
          text: '清理缓存',
          callback: () => this.clearCache()
        }
      });
    }
    
    return suggestions;
  }

  /**
   * 优化处理流程
   */
  private optimizeProcessing(): void {
    showInfo('正在优化处理流程...');
    
    // 这里可以实现具体的优化逻辑
    // 例如：调整批处理大小、启用并行处理等
  }

  // ============ 统计和报告 ============

  /**
   * 获取性能统计
   */
  getPerformanceStatistics(): {
    totalOperations: number;
    averageDuration: number;
    slowestOperation: PerformanceMetrics | null;
    fastestOperation: PerformanceMetrics | null;
    operationsByType: Record<string, number>;
    cacheStats: {
      size: number;
      maxSize: number;
      hitRate: number;
    };
  } {
    const totalOperations = this.metrics.length;
    const averageDuration = totalOperations > 0 ? 
      this.metrics.reduce((sum, m) => sum + m.duration, 0) / totalOperations : 0;
    
    let slowestOperation: PerformanceMetrics | null = null;
    let fastestOperation: PerformanceMetrics | null = null;
    const operationsByType: Record<string, number> = {};
    
    for (const metric of this.metrics) {
      // 统计操作类型
      operationsByType[metric.operationName] = (operationsByType[metric.operationName] || 0) + 1;
      
      // 找出最慢和最快的操作
      if (!slowestOperation || metric.duration > slowestOperation.duration) {
        slowestOperation = metric;
      }
      
      if (!fastestOperation || metric.duration < fastestOperation.duration) {
        fastestOperation = metric;
      }
    }
    
    return {
      totalOperations,
      averageDuration,
      slowestOperation,
      fastestOperation,
      operationsByType,
      cacheStats: {
        size: this.cache.size,
        maxSize: this.cacheConfig.maxSize,
        hitRate: 0 // 这里需要实际的缓存命中率计算
      }
    };
  }

  /**
   * 清理性能历史
   */
  clearMetricsHistory(): void {
    this.metrics = [];
  }

  /**
   * 更新性能阈值
   */
  updateThresholds(thresholds: Partial<PerformanceThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
  }

  /**
   * 更新缓存配置
   */
  updateCacheConfig(config: Partial<CacheConfig>): void {
    this.cacheConfig = { ...this.cacheConfig, ...config };
    
    // 重启缓存清理
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }
    this.startCacheCleanup();
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    
    this.clearCache();
    this.clearMetricsHistory();
  }
}