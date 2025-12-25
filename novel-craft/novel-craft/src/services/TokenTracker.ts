/**
 * TokenTracker - Token 使用量追踪服务
 * 
 * 功能：
 * - 记录每次 API 调用的 Token 消耗
 * - 统计总消耗和分类消耗
 * - 预估分析任务的 Token 消耗
 */

import { 
  TokenUsage, 
  TokenUsageRecord, 
  TokenStats, 
  ParsedBook, 
  AnalysisMode 
} from '../types';

/**
 * Token 预估结果
 */
export interface TokenEstimate {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  breakdown: {
    stage: string;
    promptTokens: number;
    completionTokens: number;
  }[];
  confidence: 'low' | 'medium' | 'high';
  note: string;
}

/**
 * 简单的 Token 计数器（基于字符数估算）
 * 中文约 1.5-2 字符/token，英文约 4 字符/token
 */
export function estimateTokenCount(text: string): number {
  if (!text) return 0;
  
  // 统计中文字符数
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  // 统计英文和其他字符
  const otherChars = text.length - chineseChars;
  
  // 中文约 1.5 字符/token，英文约 4 字符/token
  const chineseTokens = chineseChars / 1.5;
  const otherTokens = otherChars / 4;
  
  return Math.ceil(chineseTokens + otherTokens);
}

export class TokenTracker {
  private records: TokenUsageRecord[] = [];
  private currentSession: {
    bookTitle?: string;
    providerId?: string;
    model?: string;
  } = {};
  private onRecordAdded?: (record: TokenUsageRecord) => void;

  constructor(existingRecords?: TokenUsageRecord[]) {
    if (existingRecords) {
      this.records = [...existingRecords];
    }
  }

  /**
   * 设置记录添加回调
   */
  setOnRecordAdded(callback: (record: TokenUsageRecord) => void): void {
    this.onRecordAdded = callback;
  }

  /**
   * 设置当前会话信息
   */
  setCurrentSession(info: { bookTitle?: string; providerId?: string; model?: string }): void {
    this.currentSession = { ...this.currentSession, ...info };
  }

  /**
   * 记录 Token 使用
   */
  recordUsage(stage: string, usage: TokenUsage): void {
    const record: TokenUsageRecord = {
      timestamp: Date.now(),
      stage,
      bookTitle: this.currentSession.bookTitle,
      providerId: this.currentSession.providerId || 'unknown',
      model: this.currentSession.model || 'unknown',
      usage
    };
    
    this.records.push(record);
    this.onRecordAdded?.(record);
  }

  /**
   * 从 API 响应中提取并记录 Token 使用
   */
  recordFromResponse(stage: string, response: unknown): TokenUsage | null {
    const usage = this.extractUsageFromResponse(response);
    if (usage) {
      this.recordUsage(stage, usage);
    }
    return usage;
  }

  /**
   * 从 API 响应中提取 Token 使用信息
   */
  private extractUsageFromResponse(response: unknown): TokenUsage | null {
    if (!response || typeof response !== 'object') return null;
    
    const data = response as Record<string, unknown>;
    const usage = data.usage as Record<string, number> | undefined;
    
    if (!usage) return null;
    
    return {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0
    };
  }

  /**
   * 获取所有记录
   */
  getRecords(): TokenUsageRecord[] {
    return [...this.records];
  }

  /**
   * 获取统计信息
   */
  getStats(): TokenStats {
    const stats: TokenStats = {
      totalPromptTokens: 0,
      totalCompletionTokens: 0,
      totalTokens: 0,
      recordCount: this.records.length,
      byProvider: {},
      byBook: {}
    };

    for (const record of this.records) {
      stats.totalPromptTokens += record.usage.promptTokens;
      stats.totalCompletionTokens += record.usage.completionTokens;
      stats.totalTokens += record.usage.totalTokens;

      // 按 Provider 统计
      if (!stats.byProvider[record.providerId]) {
        stats.byProvider[record.providerId] = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      }
      stats.byProvider[record.providerId].promptTokens += record.usage.promptTokens;
      stats.byProvider[record.providerId].completionTokens += record.usage.completionTokens;
      stats.byProvider[record.providerId].totalTokens += record.usage.totalTokens;

      // 按书籍统计
      const bookKey = record.bookTitle || '未知书籍';
      if (!stats.byBook[bookKey]) {
        stats.byBook[bookKey] = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
      }
      stats.byBook[bookKey].promptTokens += record.usage.promptTokens;
      stats.byBook[bookKey].completionTokens += record.usage.completionTokens;
      stats.byBook[bookKey].totalTokens += record.usage.totalTokens;
    }

    return stats;
  }

  /**
   * 获取当前会话的 Token 使用
   */
  getCurrentSessionUsage(): TokenUsage {
    const sessionRecords = this.records.filter(
      r => r.bookTitle === this.currentSession.bookTitle
    );
    
    return sessionRecords.reduce(
      (acc, r) => ({
        promptTokens: acc.promptTokens + r.usage.promptTokens,
        completionTokens: acc.completionTokens + r.usage.completionTokens,
        totalTokens: acc.totalTokens + r.usage.totalTokens
      }),
      { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    );
  }

  /**
   * 清除所有记录
   */
  clearRecords(): void {
    this.records = [];
  }

  /**
   * 清除指定时间之前的记录
   */
  clearRecordsBefore(timestamp: number): void {
    this.records = this.records.filter(r => r.timestamp >= timestamp);
  }

  /**
   * 预估分析任务的 Token 消耗
   */
  static estimateAnalysis(book: ParsedBook, mode: AnalysisMode, chapterRange?: { start: number; end: number }): TokenEstimate {
    const chapters = chapterRange 
      ? book.chapters.slice(chapterRange.start - 1, chapterRange.end)
      : book.chapters;
    
    const totalContent = chapters.map(c => c.content).join('\n');
    const contentTokens = estimateTokenCount(totalContent);
    
    // 基于内容长度和模式估算
    const breakdown: TokenEstimate['breakdown'] = [];
    let totalPrompt = 0;
    let totalCompletion = 0;

    // 基础分析阶段（所有模式）
    const baseStages = [
      { stage: '故事梗概', promptRatio: 0.15, completionTokens: 800 },
      { stage: '人物分析', promptRatio: 0.3, completionTokens: 1500 },
      { stage: '写作技法', promptRatio: 0.2, completionTokens: 1200 },
      { stage: '可借鉴清单', promptRatio: 0.05, completionTokens: 600 }
    ];

    // 标准模式额外阶段
    const standardStages = [
      { stage: '情绪曲线', promptRatio: 0.25, completionTokens: 1000 },
      { stage: '章节结构', promptRatio: 0.3, completionTokens: 1500 },
      { stage: '伏笔分析', promptRatio: 0.15, completionTokens: 800 }
    ];

    // 深度模式额外阶段
    const deepStages = [
      { stage: '逐章拆解', promptRatio: 0.4, completionTokens: 3000 },
      { stage: '写作复盘', promptRatio: 0.1, completionTokens: 1500 }
    ];

    const stages = [...baseStages];
    if (mode === 'standard' || mode === 'deep') {
      stages.push(...standardStages);
    }
    if (mode === 'deep') {
      stages.push(...deepStages);
    }

    for (const stage of stages) {
      const promptTokens = Math.ceil(contentTokens * stage.promptRatio) + 500; // 500 for system prompt
      breakdown.push({
        stage: stage.stage,
        promptTokens,
        completionTokens: stage.completionTokens
      });
      totalPrompt += promptTokens;
      totalCompletion += stage.completionTokens;
    }

    // 确定置信度
    let confidence: TokenEstimate['confidence'] = 'medium';
    let note = '基于内容长度和分析模式的估算';
    
    if (contentTokens > 100000) {
      confidence = 'low';
      note = '内容较长，实际消耗可能有较大偏差';
    } else if (contentTokens < 10000) {
      confidence = 'high';
      note = '内容较短，估算相对准确';
    }

    return {
      promptTokens: totalPrompt,
      completionTokens: totalCompletion,
      totalTokens: totalPrompt + totalCompletion,
      breakdown,
      confidence,
      note
    };
  }

  /**
   * 格式化 Token 数量显示
   */
  static formatTokenCount(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(2)}M`;
    }
    if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`;
    }
    return count.toString();
  }

  /**
   * 估算费用（基于常见定价）
   */
  static estimateCost(usage: TokenUsage, pricePerMillionInput: number = 1, pricePerMillionOutput: number = 2): number {
    const inputCost = (usage.promptTokens / 1000000) * pricePerMillionInput;
    const outputCost = (usage.completionTokens / 1000000) * pricePerMillionOutput;
    return inputCost + outputCost;
  }
}
