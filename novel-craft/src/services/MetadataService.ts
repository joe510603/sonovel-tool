/**
 * MetadataService - 分析元数据服务
 * 
 * 负责分析元数据的读写和管理，支持增量分析功能。
 * Requirements: 1.1.1.1, 1.1.3.1, 1.1.3.3, 1.1.3.4
 */

import { App, TFile, TFolder } from 'obsidian';
import { AnalysisMetadata, AnalysisRange, AnalysisMode } from '../types';

/**
 * 元数据文件名常量
 */
const METADATA_FILENAME = '.analysis-meta.json';

/**
 * 当前元数据版本
 */
const METADATA_VERSION = '1.0';

/**
 * MetadataService 类
 * 管理书籍分析元数据的持久化和查询
 */
export class MetadataService {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * 清理文件名，移除不合法字符
   * @param name 原始文件名
   * @returns 清理后的文件名
   */
  sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
  }

  /**
   * 获取书籍笔记文件夹路径
   * @param bookTitle 书籍标题
   * @param notesPath 笔记根路径
   * @returns 书籍笔记文件夹路径
   */
  getBookFolderPath(bookTitle: string, notesPath: string): string {
    const sanitizedTitle = this.sanitizeFileName(bookTitle);
    return `${notesPath}/${sanitizedTitle}`;
  }

  /**
   * 获取元数据文件路径
   * Requirements: 1.1.3.3
   * @param bookTitle 书籍标题
   * @param notesPath 笔记根路径
   * @returns 元数据文件完整路径
   */
  getMetadataPath(bookTitle: string, notesPath: string): string {
    const sanitizedTitle = this.sanitizeFileName(bookTitle);
    return `${notesPath}/${sanitizedTitle}/${METADATA_FILENAME}`;
  }

  /**
   * 检查书籍笔记文件夹是否存在
   * @param bookTitle 书籍标题
   * @param notesPath 笔记根路径
   * @returns 是否存在
   */
  hasExistingNotes(bookTitle: string, notesPath: string): boolean {
    const folderPath = this.getBookFolderPath(bookTitle, notesPath);
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    return folder instanceof TFolder;
  }

  /**
   * 从现有笔记文件推断已分析的章节范围
   * 通过读取概览笔记中的"章节数"信息来推断
   * @param bookTitle 书籍标题
   * @param notesPath 笔记根路径
   * @returns 推断的章节范围，如果无法推断则返回 null
   */
  async inferAnalyzedRangeFromNotes(
    bookTitle: string,
    notesPath: string
  ): Promise<{ start: number; end: number } | null> {
    const folderPath = this.getBookFolderPath(bookTitle, notesPath);
    const overviewPath = `${folderPath}/00-概览.md`;
    
    try {
      const file = this.app.vault.getAbstractFileByPath(overviewPath);
      if (!file || !(file instanceof TFile)) {
        console.log(`概览文件不存在: ${overviewPath}`);
        return null;
      }

      const content = await this.app.vault.read(file);
      console.log(`读取概览文件成功，内容长度: ${content.length}`);
      
      // 尝试从内容中提取章节数信息
      // 支持多种格式，按优先级排序:
      // - "- **章节数**: 30 章"
      // - "**章节数**: 30 章"
      // - "章节数: 30 章"
      // - "章节数：30章"
      // - "分析章节: 1-30"
      // - "第1-30章"
      const chapterPatterns = [
        /\*\*章节数\*\*\s*[：:]\s*(\d+)\s*章?/i,     // **章节数**: 30 章 或 **章节数**:30
        /章节数\s*[：:]\s*(\d+)\s*章?/i,              // 章节数: 30 章 或 章节数：30
        /分析章节\s*[：:]\s*\d+\s*[-~]\s*(\d+)/i,    // 分析章节: 1-30
        /第\s*\d+\s*[-~]\s*(\d+)\s*章/i,             // 第1-30章
        /共\s*(\d+)\s*章/i,                          // 共30章
        /(\d+)\s*章/i,                               // 30章 (最宽松的匹配)
      ];
      
      for (const pattern of chapterPatterns) {
        const match = content.match(pattern);
        if (match) {
          const endChapter = parseInt(match[1], 10);
          if (endChapter > 0) {
            console.log(`从笔记推断章节范围: 1-${endChapter} (匹配模式: ${pattern})`);
            return { start: 1, end: endChapter };
          }
        }
      }

      // 尝试从分析日期后的内容推断
      // 如果有"新增分析"部分，提取最后的章节范围
      const rangeMatches = content.matchAll(/新增分析\s*\(第\s*(\d+)\s*[-~]\s*(\d+)\s*章\)/g);
      let maxEnd = 0;
      for (const match of rangeMatches) {
        const end = parseInt(match[2], 10);
        if (end > maxEnd) {
          maxEnd = end;
        }
      }
      
      if (maxEnd > 0) {
        console.log(`从新增分析部分推断章节范围: 1-${maxEnd}`);
        return { start: 1, end: maxEnd };
      }

      // 最后尝试：查找任何形如 "X-Y章" 或 "X~Y章" 的范围
      const anyRangeMatch = content.match(/(\d+)\s*[-~]\s*(\d+)\s*章/);
      if (anyRangeMatch) {
        const end = parseInt(anyRangeMatch[2], 10);
        if (end > 0) {
          console.log(`从通用范围模式推断章节范围: 1-${end}`);
          return { start: 1, end };
        }
      }

      console.log('无法从笔记推断章节范围，内容片段:', content.substring(0, 500));
      return null;
    } catch (error) {
      console.error('Failed to infer analyzed range from notes:', error);
      return null;
    }
  }

  /**
   * 获取或推断书籍的分析元数据
   * 如果元数据文件不存在但笔记文件夹存在，则尝试从笔记推断
   * @param bookPath 书籍文件路径
   * @param bookTitle 书籍标题
   * @param notesPath 笔记根路径
   * @returns 分析元数据，如果不存在则返回 null
   */
  async getOrInferMetadata(
    bookPath: string,
    bookTitle: string,
    notesPath: string
  ): Promise<AnalysisMetadata | null> {
    // 首先尝试获取现有元数据
    const existingMetadata = await this.getMetadata(bookPath, bookTitle, notesPath);
    if (existingMetadata) {
      return existingMetadata;
    }

    // 如果没有元数据文件，检查是否有笔记文件夹
    if (!this.hasExistingNotes(bookTitle, notesPath)) {
      return null;
    }

    // 尝试从笔记推断章节范围
    const inferredRange = await this.inferAnalyzedRangeFromNotes(bookTitle, notesPath);
    if (!inferredRange) {
      // 无法推断，但文件夹存在，创建一个基本的元数据
      // 假设至少分析过一些内容
      return {
        bookTitle,
        bookPath,
        ranges: [{
          id: 'inferred-range',
          startChapter: 1,
          endChapter: 1, // 保守估计
          mode: 'standard',
          analyzedAt: new Date().toISOString(),
          stages: ['synopsis', 'characters', 'techniques']
        }],
        lastUpdated: new Date().toISOString(),
        version: METADATA_VERSION
      };
    }

    // 创建推断的元数据
    const inferredMetadata: AnalysisMetadata = {
      bookTitle,
      bookPath,
      ranges: [{
        id: `inferred-${Date.now()}`,
        startChapter: inferredRange.start,
        endChapter: inferredRange.end,
        mode: 'standard', // 默认假设是标准模式
        analyzedAt: new Date().toISOString(),
        stages: ['synopsis', 'characters', 'techniques', 'takeaways']
      }],
      lastUpdated: new Date().toISOString(),
      version: METADATA_VERSION
    };

    // 保存推断的元数据以便后续使用
    await this.saveMetadata(inferredMetadata, notesPath);

    return inferredMetadata;
  }

  /**
   * 获取书籍的分析元数据
   * Requirements: 1.1.1.1
   * @param bookPath 书籍文件路径
   * @param bookTitle 书籍标题
   * @param notesPath 笔记根路径
   * @returns 分析元数据，如果不存在则返回 null
   */
  async getMetadata(
    bookPath: string,
    bookTitle: string,
    notesPath: string
  ): Promise<AnalysisMetadata | null> {
    const metadataPath = this.getMetadataPath(bookTitle, notesPath);
    
    try {
      const file = this.app.vault.getAbstractFileByPath(metadataPath);
      if (!file || !(file instanceof TFile)) {
        return null;
      }

      const content = await this.app.vault.read(file);
      const metadata = JSON.parse(content) as AnalysisMetadata;
      
      // 验证基本结构
      if (!metadata.bookTitle || !metadata.ranges || !Array.isArray(metadata.ranges)) {
        console.warn('Invalid metadata structure, returning null');
        return null;
      }

      return metadata;
    } catch (error) {
      console.error('Failed to read metadata:', error);
      return null;
    }
  }

  /**
   * 保存/更新分析元数据
   * Requirements: 1.1.3.1, 1.1.3.2
   * @param metadata 要保存的元数据
   * @param notesPath 笔记根路径
   */
  async saveMetadata(metadata: AnalysisMetadata, notesPath: string): Promise<void> {
    const metadataPath = this.getMetadataPath(metadata.bookTitle, notesPath);
    
    // 确保目录存在
    const folderPath = metadataPath.substring(0, metadataPath.lastIndexOf('/'));
    await this.ensureFolderExists(folderPath);

    // 更新时间戳
    metadata.lastUpdated = new Date().toISOString();
    metadata.version = METADATA_VERSION;

    const content = JSON.stringify(metadata, null, 2);
    
    const existingFile = this.app.vault.getAbstractFileByPath(metadataPath);
    if (existingFile && existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      try {
        await this.app.vault.create(metadataPath, content);
      } catch (e) {
        // 文件可能已存在，尝试修改
        const file = this.app.vault.getAbstractFileByPath(metadataPath);
        if (file instanceof TFile) {
          await this.app.vault.modify(file, content);
        }
      }
    }
  }

  /**
   * 添加新的分析范围
   * Requirements: 1.1.3.4
   * @param bookPath 书籍文件路径
   * @param bookTitle 书籍标题
   * @param range 新的分析范围
   * @param notesPath 笔记根路径
   */
  async addRange(
    bookPath: string,
    bookTitle: string,
    range: AnalysisRange,
    notesPath: string
  ): Promise<void> {
    let metadata = await this.getMetadata(bookPath, bookTitle, notesPath);
    
    if (!metadata) {
      // 创建新的元数据
      metadata = {
        bookTitle,
        bookPath,
        ranges: [],
        lastUpdated: new Date().toISOString(),
        version: METADATA_VERSION
      };
    }

    // 追加新范围
    metadata.ranges.push(range);
    
    await this.saveMetadata(metadata, notesPath);
  }

  /**
   * 获取下一个建议的分析起始章节
   * Requirements: 1.1.2.2
   * @param metadata 分析元数据
   * @returns 下一个起始章节号（1-based）
   */
  getNextStartChapter(metadata: AnalysisMetadata): number {
    if (!metadata.ranges || metadata.ranges.length === 0) {
      return 1;
    }

    // 找到所有范围中最大的结束章节
    const maxEndChapter = Math.max(...metadata.ranges.map(r => r.endChapter));
    return maxEndChapter + 1;
  }

  /**
   * 检查章节范围是否有重叠
   * @param metadata 分析元数据
   * @param start 起始章节（1-based）
   * @param end 结束章节（1-based）
   * @returns 是否有重叠
   */
  hasOverlap(metadata: AnalysisMetadata, start: number, end: number): boolean {
    if (!metadata.ranges || metadata.ranges.length === 0) {
      return false;
    }

    for (const range of metadata.ranges) {
      // 检查是否有交集
      // 两个区间 [a, b] 和 [c, d] 有交集当且仅当 a <= d && c <= b
      if (start <= range.endChapter && range.startChapter <= end) {
        return true;
      }
    }

    return false;
  }

  /**
   * 获取重叠的章节范围详情
   * @param metadata 分析元数据
   * @param start 起始章节（1-based）
   * @param end 结束章节（1-based）
   * @returns 重叠的章节范围列表
   */
  getOverlappingRanges(metadata: AnalysisMetadata, start: number, end: number): AnalysisRange[] {
    if (!metadata.ranges || metadata.ranges.length === 0) {
      return [];
    }

    return metadata.ranges.filter(range => 
      start <= range.endChapter && range.startChapter <= end
    );
  }

  /**
   * 获取未分析的章节范围
   * @param metadata 分析元数据
   * @param totalChapters 总章节数
   * @returns 未分析的章节范围列表 [{start, end}]
   */
  getUnanalyzedRanges(metadata: AnalysisMetadata, totalChapters: number): Array<{start: number; end: number}> {
    if (!metadata.ranges || metadata.ranges.length === 0) {
      return [{ start: 1, end: totalChapters }];
    }

    // 获取所有已分析的章节
    const analyzedChapters = new Set<number>();
    for (const range of metadata.ranges) {
      for (let i = range.startChapter; i <= range.endChapter; i++) {
        analyzedChapters.add(i);
      }
    }

    // 找出未分析的连续范围
    const unanalyzedRanges: Array<{start: number; end: number}> = [];
    let rangeStart: number | null = null;

    for (let i = 1; i <= totalChapters; i++) {
      if (!analyzedChapters.has(i)) {
        if (rangeStart === null) {
          rangeStart = i;
        }
      } else {
        if (rangeStart !== null) {
          unanalyzedRanges.push({ start: rangeStart, end: i - 1 });
          rangeStart = null;
        }
      }
    }

    // 处理最后一个范围
    if (rangeStart !== null) {
      unanalyzedRanges.push({ start: rangeStart, end: totalChapters });
    }

    return unanalyzedRanges;
  }

  /**
   * 智能分析建议
   * 根据已分析的内容和用户选择的范围，给出分析建议
   * @param metadata 分析元数据（可能为 null）
   * @param requestedStart 用户请求的起始章节
   * @param requestedEnd 用户请求的结束章节
   * @param totalChapters 总章节数
   * @returns 分析建议
   */
  getSmartAnalysisSuggestion(
    metadata: AnalysisMetadata | null,
    requestedStart: number,
    requestedEnd: number,
    totalChapters: number
  ): {
    hasExistingAnalysis: boolean;
    overlappingChapters: Array<{start: number; end: number}>;
    newChapters: Array<{start: number; end: number}>;
    suggestion: 'new' | 'continue' | 'partial_overlap' | 'full_overlap';
    message: string;
  } {
    // 没有元数据，全新分析
    if (!metadata || metadata.ranges.length === 0) {
      return {
        hasExistingAnalysis: false,
        overlappingChapters: [],
        newChapters: [{ start: requestedStart, end: requestedEnd }],
        suggestion: 'new',
        message: '这是首次分析此书籍'
      };
    }

    // 获取已分析的章节集合
    const analyzedChapters = new Set<number>();
    for (const range of metadata.ranges) {
      for (let i = range.startChapter; i <= range.endChapter; i++) {
        analyzedChapters.add(i);
      }
    }

    // 计算重叠和新章节
    const overlappingChapters: Array<{start: number; end: number}> = [];
    const newChapters: Array<{start: number; end: number}> = [];
    
    let overlapStart: number | null = null;
    let newStart: number | null = null;

    for (let i = requestedStart; i <= requestedEnd; i++) {
      const isAnalyzed = analyzedChapters.has(i);
      
      if (isAnalyzed) {
        // 结束新章节范围
        if (newStart !== null) {
          newChapters.push({ start: newStart, end: i - 1 });
          newStart = null;
        }
        // 开始或继续重叠范围
        if (overlapStart === null) {
          overlapStart = i;
        }
      } else {
        // 结束重叠范围
        if (overlapStart !== null) {
          overlappingChapters.push({ start: overlapStart, end: i - 1 });
          overlapStart = null;
        }
        // 开始或继续新章节范围
        if (newStart === null) {
          newStart = i;
        }
      }
    }

    // 处理最后的范围
    if (overlapStart !== null) {
      overlappingChapters.push({ start: overlapStart, end: requestedEnd });
    }
    if (newStart !== null) {
      newChapters.push({ start: newStart, end: requestedEnd });
    }

    // 判断建议类型
    const totalRequested = requestedEnd - requestedStart + 1;
    const totalOverlap = overlappingChapters.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
    const totalNew = newChapters.reduce((sum, r) => sum + (r.end - r.start + 1), 0);

    let suggestion: 'new' | 'continue' | 'partial_overlap' | 'full_overlap';
    let message: string;

    if (totalOverlap === 0) {
      suggestion = 'continue';
      message = `将分析 ${totalNew} 个新章节`;
    } else if (totalNew === 0) {
      suggestion = 'full_overlap';
      message = `所选的 ${totalRequested} 章已全部分析过`;
    } else {
      suggestion = 'partial_overlap';
      message = `${totalOverlap} 章已分析，${totalNew} 章为新内容`;
    }

    return {
      hasExistingAnalysis: true,
      overlappingChapters,
      newChapters,
      suggestion,
      message
    };
  }

  /**
   * 创建新的分析范围对象
   * @param startChapter 起始章节（1-based）
   * @param endChapter 结束章节（1-based）
   * @param mode 分析模式
   * @param stages 已完成的分析阶段
   * @returns 新的分析范围对象
   */
  createRange(
    startChapter: number,
    endChapter: number,
    mode: AnalysisMode,
    stages: string[]
  ): AnalysisRange {
    return {
      id: this.generateRangeId(),
      startChapter,
      endChapter,
      mode,
      analyzedAt: new Date().toISOString(),
      stages
    };
  }

  /**
   * 生成唯一的范围 ID
   * @returns 唯一 ID
   */
  private generateRangeId(): string {
    return `range-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * 确保文件夹存在
   * @param folderPath 文件夹路径
   */
  private async ensureFolderExists(folderPath: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      try {
        await this.app.vault.createFolder(folderPath);
      } catch (e) {
        // 忽略文件夹已存在错误
      }
    }
  }

  /**
   * 格式化已分析状态显示
   * Requirements: 1.1.1.3, 1.3.3.2
   * @param metadata 分析元数据
   * @param includeMode 是否包含分析模式信息（默认 true）
   * @returns 格式化的状态字符串
   */
  formatAnalysisStatus(metadata: AnalysisMetadata, includeMode: boolean = true): string {
    if (!metadata.ranges || metadata.ranges.length === 0) {
      return '尚未分析';
    }

    // 合并连续的范围用于显示
    const sortedRanges = [...metadata.ranges].sort((a, b) => a.startChapter - b.startChapter);
    
    const rangeStrings = sortedRanges.map(range => {
      const date = new Date(range.analyzedAt);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      
      // Requirements: 1.3.3.2 - 显示每个范围的分析模式
      if (includeMode && range.mode) {
        const modeLabel = this.formatModeLabel(range.mode);
        return `已分析: ${range.startChapter}-${range.endChapter}章 [${modeLabel}] (${dateStr})`;
      }
      return `已分析: ${range.startChapter}-${range.endChapter}章 (${dateStr})`;
    });

    return rangeStrings.join('\n');
  }

  /**
   * 格式化分析模式标签
   * @param mode 分析模式
   * @returns 中文模式标签
   */
  formatModeLabel(mode: AnalysisMode): string {
    switch (mode) {
      case 'quick':
        return '快速';
      case 'standard':
        return '标准';
      case 'deep':
        return '深度';
      default:
        return mode;
    }
  }

  /**
   * 获取指定范围的分析模式
   * Requirements: 1.3.3.1
   * @param metadata 分析元数据
   * @param chapterIndex 章节索引（1-based）
   * @returns 该章节所属范围的分析模式，如果未找到则返回 null
   */
  getModeForChapter(metadata: AnalysisMetadata, chapterIndex: number): AnalysisMode | null {
    if (!metadata.ranges || metadata.ranges.length === 0) {
      return null;
    }

    for (const range of metadata.ranges) {
      if (chapterIndex >= range.startChapter && chapterIndex <= range.endChapter) {
        return range.mode;
      }
    }

    return null;
  }

  /**
   * 检查是否存在混合模式分析
   * Requirements: 1.3.3.1
   * @param metadata 分析元数据
   * @returns 是否存在不同模式的分析范围
   */
  hasMixedModes(metadata: AnalysisMetadata): boolean {
    if (!metadata.ranges || metadata.ranges.length <= 1) {
      return false;
    }

    const modes = new Set(metadata.ranges.map(r => r.mode));
    return modes.size > 1;
  }

  /**
   * 获取所有使用深度模式分析的章节范围
   * Requirements: 1.3.3.4
   * @param metadata 分析元数据
   * @returns 深度模式分析的章节索引数组
   */
  getDeepModeChapters(metadata: AnalysisMetadata): number[] {
    if (!metadata.ranges || metadata.ranges.length === 0) {
      return [];
    }

    const deepChapters: number[] = [];
    for (const range of metadata.ranges) {
      if (range.mode === 'deep') {
        for (let i = range.startChapter; i <= range.endChapter; i++) {
          deepChapters.push(i);
        }
      }
    }

    return deepChapters;
  }

  /**
   * 删除元数据文件
   * @param bookTitle 书籍标题
   * @param notesPath 笔记根路径
   */
  async deleteMetadata(bookTitle: string, notesPath: string): Promise<void> {
    const metadataPath = this.getMetadataPath(bookTitle, notesPath);
    
    try {
      const file = this.app.vault.getAbstractFileByPath(metadataPath);
      if (file && file instanceof TFile) {
        await this.app.vault.delete(file);
      }
    } catch (error) {
      console.error('Failed to delete metadata:', error);
    }
  }
}
