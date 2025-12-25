import { App } from 'obsidian';
import { ErrorHandlingService, ErrorType, ErrorSeverity } from './ErrorHandlingService';
import { UserGuidanceService } from './UserGuidanceService';
import { PerformanceOptimizationService } from './PerformanceOptimizationService';
import { LLMService } from './LLMService';
import { showError, showWarning, showInfo } from '../ui/NotificationUtils';

/**
 * 系统健康状态
 */
export interface SystemHealthStatus {
  overall: 'healthy' | 'warning' | 'critical';
  components: {
    llmService: 'healthy' | 'warning' | 'error';
    storage: 'healthy' | 'warning' | 'error';
    performance: 'healthy' | 'warning' | 'error';
    userInterface: 'healthy' | 'warning' | 'error';
  };
  issues: Array<{
    component: string;
    severity: ErrorSeverity;
    message: string;
    suggestion?: string;
  }>;
  lastCheck: Date;
}

/**
 * 错误恢复策略
 */
export interface ErrorRecoveryStrategy {
  errorType: ErrorType;
  strategy: 'retry' | 'fallback' | 'user_intervention' | 'ignore';
  maxAttempts?: number;
  fallbackAction?: () => Promise<any>;
  userMessage?: string;
}

/**
 * ErrorHandlingIntegrationService - 错误处理集成服务
 * 
 * 统一管理所有错误处理、用户引导和性能优化功能
 */
export class ErrorHandlingIntegrationService {
  private app: App;
  private errorHandler: ErrorHandlingService;
  private guidanceService: UserGuidanceService;
  private performanceService: PerformanceOptimizationService;
  
  // 服务引用
  private llmService?: LLMService;
  
  // 错误恢复策略
  private recoveryStrategies: Map<ErrorType, ErrorRecoveryStrategy> = new Map();
  
  // 健康检查定时器
  private healthCheckTimer: number | null = null;
  private healthCheckInterval = 5 * 60 * 1000; // 5分钟
  
  constructor(app: App) {
    this.app = app;
    this.errorHandler = new ErrorHandlingService();
    this.guidanceService = new UserGuidanceService(app);
    this.performanceService = new PerformanceOptimizationService(app, this.errorHandler);
    
    this.initializeRecoveryStrategies();
    this.startHealthMonitoring();
  }

  // ============ 服务注册 ============

  /**
   * 注册服务实例
   */
  registerServices(services: {
    llmService?: LLMService;
  }): void {
    this.llmService = services.llmService;
  }

  /**
   * 获取错误处理服务
   */
  getErrorHandler(): ErrorHandlingService {
    return this.errorHandler;
  }

  /**
   * 获取用户引导服务
   */
  getGuidanceService(): UserGuidanceService {
    return this.guidanceService;
  }

  /**
   * 获取性能优化服务
   */
  getPerformanceService(): PerformanceOptimizationService {
    return this.performanceService;
  }

  // ============ 错误恢复策略 ============

  /**
   * 初始化错误恢复策略
   */
  private initializeRecoveryStrategies(): void {
    // 网络错误 - 重试策略
    this.recoveryStrategies.set(ErrorType.NETWORK, {
      errorType: ErrorType.NETWORK,
      strategy: 'retry',
      maxAttempts: 3,
      userMessage: '网络连接异常，正在重试...'
    });

    // LLM 服务错误 - 降级策略
    this.recoveryStrategies.set(ErrorType.LLM_SERVICE, {
      errorType: ErrorType.LLM_SERVICE,
      strategy: 'fallback',
      fallbackAction: async () => {
        return this.createFallbackAnalysis();
      },
      userMessage: 'AI 服务暂时不可用，已启用基础分析模式'
    });

    // 存储错误 - 用户干预策略
    this.recoveryStrategies.set(ErrorType.STORAGE, {
      errorType: ErrorType.STORAGE,
      strategy: 'user_intervention',
      userMessage: '数据保存失败，请检查磁盘空间和权限设置'
    });

    // 标记操作错误 - 重试 + 引导策略
    this.recoveryStrategies.set(ErrorType.MARK_OPERATION, {
      errorType: ErrorType.MARK_OPERATION,
      strategy: 'retry',
      maxAttempts: 2,
      userMessage: '标记操作失败，请检查光标位置'
    });

    // 模板错误 - 降级策略
    this.recoveryStrategies.set(ErrorType.TEMPLATE, {
      errorType: ErrorType.TEMPLATE,
      strategy: 'fallback',
      fallbackAction: async () => {
        return this.getDefaultTemplate();
      },
      userMessage: '模板加载失败，已使用默认模板'
    });

    // 性能问题 - 优化策略
    this.recoveryStrategies.set(ErrorType.PERFORMANCE, {
      errorType: ErrorType.PERFORMANCE,
      strategy: 'fallback',
      fallbackAction: async () => {
        await this.optimizePerformance();
      },
      userMessage: '检测到性能问题，正在优化...'
    });
  }

  /**
   * 应用错误恢复策略
   */
  async applyRecoveryStrategy(
    errorType: ErrorType,
    error: unknown,
    context: any
  ): Promise<{ success: boolean; data?: any; message?: string }> {
    const strategy = this.recoveryStrategies.get(errorType);
    
    if (!strategy) {
      return { success: false, message: '未找到适用的恢复策略' };
    }

    try {
      switch (strategy.strategy) {
        case 'retry':
          return await this.executeRetryStrategy(strategy, error, context);
        
        case 'fallback':
          return await this.executeFallbackStrategy(strategy, error, context);
        
        case 'user_intervention':
          return this.executeUserInterventionStrategy(strategy, error, context);
        
        case 'ignore':
          return { success: true, message: '错误已忽略' };
        
        default:
          return { success: false, message: '未知的恢复策略' };
      }
    } catch (recoveryError) {
      console.error('Error recovery failed:', recoveryError);
      return { success: false, message: '错误恢复失败' };
    }
  }

  /**
   * 执行重试策略
   */
  private async executeRetryStrategy(
    strategy: ErrorRecoveryStrategy,
    _error: unknown,
    _context: any
  ): Promise<{ success: boolean; data?: any; message?: string }> {
    if (strategy.userMessage) {
      showInfo(strategy.userMessage);
    }

    return { 
      success: false, 
      message: '需要重试操作',
      data: { shouldRetry: true, maxAttempts: strategy.maxAttempts }
    };
  }

  /**
   * 执行降级策略
   */
  private async executeFallbackStrategy(
    strategy: ErrorRecoveryStrategy,
    _error: unknown,
    _context: any
  ): Promise<{ success: boolean; data?: any; message?: string }> {
    if (strategy.userMessage) {
      showWarning(strategy.userMessage);
    }

    if (strategy.fallbackAction) {
      const fallbackData = await strategy.fallbackAction();
      return { success: true, data: fallbackData, message: '已使用降级处理' };
    }

    return { success: false, message: '降级处理不可用' };
  }

  /**
   * 执行用户干预策略
   */
  private executeUserInterventionStrategy(
    strategy: ErrorRecoveryStrategy,
    _error: unknown,
    context: any
  ): { success: boolean; data?: any; message?: string } {
    if (strategy.userMessage) {
      showError('需要用户处理', strategy.userMessage);
    }

    this.triggerUserGuidance(strategy.errorType, context);

    return { success: false, message: '需要用户干预' };
  }

  // ============ 降级处理方法 ============

  /**
   * 创建降级分析结果
   */
  private async createFallbackAnalysis(): Promise<any> {
    return {
      templateId: 'fallback',
      sections: {
        '分析结果': 'AI 服务暂时不可用，请手动编辑分析内容'
      },
      emotionCurve: [],
      characterRoles: [],
      techniques: [],
      summary: 'AI 分析服务暂时不可用，已启用降级模式',
      editHistory: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * 获取默认模板
   */
  private async getDefaultTemplate(): Promise<any> {
    return {
      id: 'default',
      name: '基础分析模板',
      description: '默认的分析模板',
      steps: [
        {
          name: '内容概述',
          description: '概述标记内容的主要信息',
          analysisPoints: ['主要内容', '关键信息']
        }
      ],
      promptTemplate: '请分析以下内容：{content}',
      outputFormat: {
        sections: ['分析结果'],
        requiredFields: ['analysis']
      },
      isBuiltIn: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };
  }

  /**
   * 优化性能
   */
  private async optimizePerformance(): Promise<void> {
    this.performanceService.clearCache();
    
    if (global.gc) {
      global.gc();
    }
    
    showInfo('性能优化完成');
  }

  // ============ 用户引导触发 ============

  /**
   * 触发用户引导
   */
  private triggerUserGuidance(errorType: ErrorType, _context: any): void {
    switch (errorType) {
      case ErrorType.MARK_OPERATION:
        this.guidanceService.startGuideFlow('unified-marking-intro');
        break;
      
      case ErrorType.LLM_SERVICE:
        this.guidanceService.startGuideFlow('ai-analysis-intro');
        break;
      
      case ErrorType.STORAGE:
        this.showStorageGuidance();
        break;
      
      default:
        this.showGeneralHelp();
        break;
    }
  }

  /**
   * 显示存储相关引导
   */
  private showStorageGuidance(): void {
    showInfo('数据存储问题，请检查：\n1. 磁盘空间是否充足\n2. 文件权限是否正确\n3. 是否有其他程序占用文件');
  }

  /**
   * 显示通用帮助
   */
  private showGeneralHelp(): void {
    showInfo('遇到问题？请尝试：\n1. 刷新页面\n2. 重启应用\n3. 查看帮助文档');
  }

  // ============ 系统健康监控 ============

  /**
   * 开始健康监控
   */
  private startHealthMonitoring(): void {
    this.healthCheckTimer = window.setInterval(() => {
      this.performHealthCheck();
    }, this.healthCheckInterval);
  }

  /**
   * 执行健康检查
   */
  async performHealthCheck(): Promise<SystemHealthStatus> {
    const status: SystemHealthStatus = {
      overall: 'healthy',
      components: {
        llmService: 'healthy',
        storage: 'healthy',
        performance: 'healthy',
        userInterface: 'healthy'
      },
      issues: [],
      lastCheck: new Date()
    };

    // 检查 LLM 服务
    if (this.llmService) {
      try {
        const provider = this.llmService.getDefaultProvider();
        if (!provider) {
          status.components.llmService = 'warning';
          status.issues.push({
            component: 'LLM Service',
            severity: ErrorSeverity.MEDIUM,
            message: '未配置 LLM 服务提供商',
            suggestion: '请在设置中配置 AI 服务'
          });
        }
      } catch (error) {
        status.components.llmService = 'error';
        status.issues.push({
          component: 'LLM Service',
          severity: ErrorSeverity.HIGH,
          message: 'LLM 服务检查失败',
          suggestion: '请检查 AI 服务配置'
        });
      }
    }

    // 检查存储
    try {
      const testPath = '.novelcraft/health-check.tmp';
      await this.app.vault.adapter.write(testPath, 'test');
      await this.app.vault.adapter.remove(testPath);
    } catch (error) {
      status.components.storage = 'error';
      status.issues.push({
        component: 'Storage',
        severity: ErrorSeverity.HIGH,
        message: '存储系统异常',
        suggestion: '请检查磁盘空间和权限'
      });
    }

    // 检查性能
    const performanceStats = this.performanceService.getPerformanceStatistics();
    if (performanceStats.averageDuration > 5000) {
      status.components.performance = 'warning';
      status.issues.push({
        component: 'Performance',
        severity: ErrorSeverity.MEDIUM,
        message: '平均响应时间较长',
        suggestion: '建议清理缓存或减少数据量'
      });
    }

    // 检查用户界面
    const errorStats = this.errorHandler.getErrorStatistics();
    if (errorStats.totalErrors > 50) {
      status.components.userInterface = 'warning';
      status.issues.push({
        component: 'User Interface',
        severity: ErrorSeverity.MEDIUM,
        message: '错误数量较多',
        suggestion: '建议重启应用或清理数据'
      });
    }

    // 确定整体状态
    const hasErrors = Object.values(status.components).some(s => s === 'error');
    const hasWarnings = Object.values(status.components).some(s => s === 'warning');
    
    if (hasErrors) {
      status.overall = 'critical';
    } else if (hasWarnings) {
      status.overall = 'warning';
    }

    // 如果有严重问题，显示通知
    if (status.overall === 'critical') {
      const criticalIssues = status.issues.filter(i => i.severity === ErrorSeverity.HIGH);
      if (criticalIssues.length > 0) {
        showError('系统健康检查', `发现 ${criticalIssues.length} 个严重问题`);
      }
    }

    return status;
  }

  /**
   * 获取系统健康状态
   */
  async getSystemHealth(): Promise<SystemHealthStatus> {
    return await this.performHealthCheck();
  }

  // ============ 统计和报告 ============

  /**
   * 获取错误处理统计
   */
  getErrorHandlingStatistics(): {
    errorStats: ReturnType<ErrorHandlingService['getErrorStatistics']>;
    performanceStats: ReturnType<PerformanceOptimizationService['getPerformanceStatistics']>;
    guidanceStats: {
      completedGuides: number;
      skippedGuides: number;
      activeGuides: number;
    };
  } {
    const errorStats = this.errorHandler.getErrorStatistics();
    const performanceStats = this.performanceService.getPerformanceStatistics();
    
    const availableGuides = this.guidanceService.getAvailableGuides();
    const guidanceStats = {
      completedGuides: 0,
      skippedGuides: 0,
      activeGuides: availableGuides.length
    };

    return {
      errorStats,
      performanceStats,
      guidanceStats
    };
  }

  /**
   * 生成系统报告
   */
  async generateSystemReport(): Promise<string> {
    const health = await this.getSystemHealth();
    const stats = this.getErrorHandlingStatistics();
    
    const report = `
# NovelCraft 系统报告

## 系统健康状态
- 整体状态: ${health.overall}
- LLM 服务: ${health.components.llmService}
- 存储系统: ${health.components.storage}
- 性能状态: ${health.components.performance}
- 用户界面: ${health.components.userInterface}

## 错误统计
- 总错误数: ${stats.errorStats.totalErrors}
- 最近错误: ${stats.errorStats.recentErrors.length}

## 性能统计
- 总操作数: ${stats.performanceStats.totalOperations}
- 平均耗时: ${Math.round(stats.performanceStats.averageDuration)}ms
- 缓存使用: ${stats.performanceStats.cacheStats.size}/${stats.performanceStats.cacheStats.maxSize}

## 用户引导
- 可用引导: ${stats.guidanceStats.activeGuides}

## 问题和建议
${health.issues.map(issue => `- ${issue.component}: ${issue.message}${issue.suggestion ? ` (建议: ${issue.suggestion})` : ''}`).join('\n')}

---
报告生成时间: ${new Date().toLocaleString()}
    `.trim();

    return report;
  }

  // ============ 配置管理 ============

  /**
   * 更新错误处理配置
   */
  updateErrorHandlingConfig(config: any): void {
    this.errorHandler.updateConfig(config);
  }

  /**
   * 更新性能配置
   */
  updatePerformanceConfig(config: any): void {
    this.performanceService.updateThresholds(config.thresholds);
    this.performanceService.updateCacheConfig(config.cache);
  }

  /**
   * 更新用户引导配置
   */
  updateGuidanceConfig(config: any): void {
    this.guidanceService.updatePreferences(config);
  }

  // ============ 清理和销毁 ============

  /**
   * 清理所有数据
   */
  cleanup(): void {
    this.errorHandler.clearErrorLog();
    this.performanceService.clearCache();
    this.performanceService.clearMetricsHistory();
  }

  /**
   * 销毁服务
   */
  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    this.errorHandler.destroy();
    this.guidanceService.destroy();
    this.performanceService.destroy();
  }
}
