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
      await this.app.vault.create(metadataPath, content);
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
      await this.app.vault.createFolder(folderPath);
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
