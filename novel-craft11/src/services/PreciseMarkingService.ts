/**
 * PreciseMarkingService - 精确标记服务
 * 
 * 支持章节+行号的精确定位标记，用于圈定跨章节内容范围。
 * 
 * 功能：
 * - 创建开始/结束标记并配对
 * - 获取未配对标记
 * - 跨章节文本提取
 * - 从编辑器选择创建标记
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 4.1
 */

import { App, Editor, TFile, TFolder, normalizePath } from 'obsidian';
import { BookDatabaseService } from './BookDatabaseService';
import { PrecisePosition, PreciseRange, StoryUnit } from '../types/database';
import { parseFrontmatter } from '../utils/FrontmatterUtils';

/**
 * 未配对标记状态
 */
export type UnpairedMarkStatus = 'pending' | 'orphaned';

/**
 * 未配对标记
 */
export interface UnpairedMark {
  /** 标记 ID */
  markId: string;
  /** 书籍 ID */
  bookId: string;
  /** 标记名称 */
  name: string;
  /** 起始位置 */
  position: PrecisePosition;
  /** 状态 */
  status: UnpairedMarkStatus;
  /** 创建时间 */
  createdAt: string;
}

/**
 * 精确标记数据
 */
export interface PreciseMark {
  /** 标记 ID */
  markId: string;
  /** 书籍 ID */
  bookId: string;
  /** 标记名称 */
  name: string;
  /** 精确范围 */
  range: PreciseRange;
  /** 是否已配对 */
  isPaired: boolean;
  /** 关联的故事单元 ID */
  storyUnitId?: string;
  /** 创建时间 */
  createdAt: string;
  /** 更新时间 */
  updatedAt: string;
}

/**
 * 精确标记存储
 */
interface PreciseMarkStorage {
  version: string;
  bookId: string;
  marks: PreciseMark[];
  unpairedMarks: UnpairedMark[];
  lastUpdated: string;
}

/**
 * 精确标记服务
 */
export class PreciseMarkingService {
  private app: App;
  private bookDatabaseService: BookDatabaseService;
  
  /** 存储文件名 */
  private static readonly STORAGE_FILE = '_precise_marks.json';
  
  constructor(app: App, bookDatabaseService: BookDatabaseService) {
    this.app = app;
    this.bookDatabaseService = bookDatabaseService;
  }

  // ============ 标记创建 ============

  /**
   * 创建开始标记
   * 
   * @param bookPath - 书籍文件夹路径
   * @param position - 精确位置
   * @param name - 标记名称（可选）
   * @returns 标记 ID
   * 
   * Requirements: 3.1, 3.2
   */
  async createStartMark(
    bookPath: string,
    position: PrecisePosition,
    name?: string
  ): Promise<string> {
    const bookId = await this.bookDatabaseService.getBookId(bookPath);
    if (!bookId) {
      throw new Error('书籍数据库未初始化');
    }

    // 生成唯一标记 ID
    const markId = this.generateMarkId();
    const now = new Date().toISOString();

    // 创建未配对标记
    const unpairedMark: UnpairedMark = {
      markId,
      bookId,
      name: name || `标记_${markId.slice(-6)}`,
      position,
      status: 'pending',
      createdAt: now,
    };

    // 保存到存储
    const storage = await this.loadStorage(bookPath);
    storage.unpairedMarks.push(unpairedMark);
    storage.lastUpdated = now;
    await this.saveStorage(bookPath, storage);

    return markId;
  }

  /**
   * 创建结束标记并配对
   * 
   * @param bookPath - 书籍文件夹路径
   * @param position - 结束位置
   * @param startMarkId - 开始标记 ID
   * @returns 配对后的精确标记
   * 
   * Requirements: 3.2, 3.3
   */
  async createEndMark(
    bookPath: string,
    position: PrecisePosition,
    startMarkId: string
  ): Promise<PreciseMark> {
    const storage = await this.loadStorage(bookPath);
    
    // 查找未配对的开始标记
    const unpairedIndex = storage.unpairedMarks.findIndex(
      m => m.markId === startMarkId
    );
    
    if (unpairedIndex === -1) {
      throw new Error(`未找到开始标记: ${startMarkId}`);
    }

    const unpairedMark = storage.unpairedMarks[unpairedIndex];
    const now = new Date().toISOString();

    // 验证位置顺序
    const startPos = unpairedMark.position;
    if (!this.isPositionAfter(position, startPos)) {
      throw new Error('结束位置必须在开始位置之后');
    }

    // 创建配对标记
    const pairedMark: PreciseMark = {
      markId: startMarkId,
      bookId: unpairedMark.bookId,
      name: unpairedMark.name,
      range: {
        start: startPos,
        end: position,
      },
      isPaired: true,
      createdAt: unpairedMark.createdAt,
      updatedAt: now,
    };

    // 从未配对列表移除，添加到已配对列表
    storage.unpairedMarks.splice(unpairedIndex, 1);
    storage.marks.push(pairedMark);
    storage.lastUpdated = now;
    await this.saveStorage(bookPath, storage);

    return pairedMark;
  }

  /**
   * 获取未配对的开始标记
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns 未配对标记列表
   * 
   * Requirements: 3.3
   */
  async getUnpairedMarks(bookPath: string): Promise<UnpairedMark[]> {
    const storage = await this.loadStorage(bookPath);
    return storage.unpairedMarks;
  }

  /**
   * 获取所有已配对标记
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns 已配对标记列表
   */
  async getPairedMarks(bookPath: string): Promise<PreciseMark[]> {
    const storage = await this.loadStorage(bookPath);
    return storage.marks;
  }

  /**
   * 删除未配对标记
   * 
   * @param bookPath - 书籍文件夹路径
   * @param markId - 标记 ID
   */
  async deleteUnpairedMark(bookPath: string, markId: string): Promise<void> {
    const storage = await this.loadStorage(bookPath);
    const index = storage.unpairedMarks.findIndex(m => m.markId === markId);
    
    if (index !== -1) {
      storage.unpairedMarks.splice(index, 1);
      storage.lastUpdated = new Date().toISOString();
      await this.saveStorage(bookPath, storage);
    }
  }

  /**
   * 删除已配对标记
   * 
   * @param bookPath - 书籍文件夹路径
   * @param markId - 标记 ID
   */
  async deletePairedMark(bookPath: string, markId: string): Promise<void> {
    const storage = await this.loadStorage(bookPath);
    const index = storage.marks.findIndex(m => m.markId === markId);
    
    if (index !== -1) {
      storage.marks.splice(index, 1);
      storage.lastUpdated = new Date().toISOString();
      await this.saveStorage(bookPath, storage);
    }
  }

  // ============ 跨章节文本提取 ============

  /**
   * 提取标记范围内的文本
   * 支持跨多个章节的文本提取
   * 
   * @param bookPath - 书籍文件夹路径
   * @param markId - 标记 ID
   * @returns 提取的文本内容
   * 
   * Requirements: 3.4, 3.5
   */
  async extractMarkedText(bookPath: string, markId: string): Promise<string> {
    const storage = await this.loadStorage(bookPath);
    const mark = storage.marks.find(m => m.markId === markId);
    
    if (!mark) {
      throw new Error(`未找到标记: ${markId}`);
    }

    return this.extractTextFromRange(bookPath, mark.range);
  }

  /**
   * 从精确范围提取文本
   * 
   * @param bookPath - 书籍文件夹路径
   * @param range - 精确范围
   * @returns 提取的文本内容
   * 
   * Requirements: 3.4
   */
  async extractTextFromRange(bookPath: string, range: PreciseRange): Promise<string> {
    const { start, end } = range;
    
    // 获取所有章节文件
    const chapterFiles = await this.bookDatabaseService.scanChapterFiles(bookPath);
    
    if (chapterFiles.length === 0) {
      return '';
    }

    const extractedParts: string[] = [];

    // 遍历涉及的章节
    for (let chapterIndex = start.chapterIndex; chapterIndex <= end.chapterIndex; chapterIndex++) {
      if (chapterIndex < 0 || chapterIndex >= chapterFiles.length) {
        continue;
      }

      const file = chapterFiles[chapterIndex];
      const content = await this.app.vault.read(file);
      const parsed = parseFrontmatter(content);
      const lines = parsed.content.split('\n');

      // 确定本章节的提取范围
      let startLine = 0;
      let startOffset = 0;
      let endLine = lines.length - 1;
      let endOffset = lines[endLine]?.length || 0;

      if (chapterIndex === start.chapterIndex) {
        startLine = start.lineNumber - 1; // 转为 0-based
        startOffset = start.characterOffset;
      }

      if (chapterIndex === end.chapterIndex) {
        endLine = end.lineNumber - 1; // 转为 0-based
        endOffset = end.characterOffset;
      }

      // 提取文本
      const chapterText = this.extractLinesRange(
        lines,
        startLine,
        startOffset,
        endLine,
        endOffset
      );

      if (chapterText) {
        // 添加章节标题
        const chapterTitle = this.extractChapterTitle(file.name);
        if (start.chapterIndex !== end.chapterIndex) {
          extractedParts.push(`## ${chapterTitle}\n\n${chapterText}`);
        } else {
          extractedParts.push(chapterText);
        }
      }
    }

    return extractedParts.join('\n\n---\n\n');
  }

  /**
   * 从行数组中提取指定范围的文本
   */
  private extractLinesRange(
    lines: string[],
    startLine: number,
    startOffset: number,
    endLine: number,
    endOffset: number
  ): string {
    if (startLine < 0) startLine = 0;
    if (endLine >= lines.length) endLine = lines.length - 1;
    if (startLine > endLine) return '';

    const result: string[] = [];

    for (let i = startLine; i <= endLine; i++) {
      const line = lines[i] || '';
      
      if (i === startLine && i === endLine) {
        // 同一行
        result.push(line.substring(startOffset, endOffset));
      } else if (i === startLine) {
        // 起始行
        result.push(line.substring(startOffset));
      } else if (i === endLine) {
        // 结束行
        result.push(line.substring(0, endOffset));
      } else {
        // 中间行
        result.push(line);
      }
    }

    return result.join('\n');
  }

  /**
   * 从文件名提取章节标题
   */
  private extractChapterTitle(filename: string): string {
    const match = filename.match(/^\d+-(.+)\.md$/);
    return match ? match[1] : filename.replace('.md', '');
  }

  // ============ 编辑器选择标记 ============

  /**
   * 从编辑器选择创建标记
   * 
   * @param bookPath - 书籍文件夹路径
   * @param editor - 编辑器实例
   * @param chapterIndex - 章节索引
   * @param name - 标记名称（可选）
   * @returns 创建的标记 ID 或配对后的标记
   * 
   * Requirements: 4.1
   */
  async createMarkFromSelection(
    bookPath: string,
    editor: Editor,
    chapterIndex: number,
    name?: string
  ): Promise<PreciseMark | string> {
    const selection = editor.getSelection();
    
    if (!selection || selection.length === 0) {
      // 无选择，创建单点开始标记
      const cursor = editor.getCursor();
      const position: PrecisePosition = {
        chapterIndex,
        lineNumber: cursor.line + 1, // 转为 1-based
        characterOffset: cursor.ch,
      };
      
      return this.createStartMark(bookPath, position, name);
    }

    // 有选择，创建配对标记
    const from = editor.getCursor('from');
    const to = editor.getCursor('to');

    const startPosition: PrecisePosition = {
      chapterIndex,
      lineNumber: from.line + 1, // 转为 1-based
      characterOffset: from.ch,
    };

    const endPosition: PrecisePosition = {
      chapterIndex,
      lineNumber: to.line + 1, // 转为 1-based
      characterOffset: to.ch,
    };

    // 直接创建配对标记
    const bookId = await this.bookDatabaseService.getBookId(bookPath);
    if (!bookId) {
      throw new Error('书籍数据库未初始化');
    }

    const markId = this.generateMarkId();
    const now = new Date().toISOString();

    const pairedMark: PreciseMark = {
      markId,
      bookId,
      name: name || `标记_${markId.slice(-6)}`,
      range: {
        start: startPosition,
        end: endPosition,
      },
      isPaired: true,
      createdAt: now,
      updatedAt: now,
    };

    // 保存到存储
    const storage = await this.loadStorage(bookPath);
    storage.marks.push(pairedMark);
    storage.lastUpdated = now;
    await this.saveStorage(bookPath, storage);

    return pairedMark;
  }

  /**
   * 从编辑器获取当前位置
   * 
   * @param editor - 编辑器实例
   * @param chapterIndex - 章节索引
   * @returns 精确位置
   * 
   * Requirements: 3.3
   */
  getPositionFromEditor(editor: Editor, chapterIndex: number): PrecisePosition {
    const cursor = editor.getCursor();
    return {
      chapterIndex,
      lineNumber: cursor.line + 1, // 转为 1-based
      characterOffset: cursor.ch,
    };
  }

  /**
   * 从编辑器获取选择范围
   * 
   * @param editor - 编辑器实例
   * @param chapterIndex - 章节索引
   * @returns 精确范围，如果没有选择返回 null
   */
  getRangeFromEditor(editor: Editor, chapterIndex: number): PreciseRange | null {
    const selection = editor.getSelection();
    if (!selection || selection.length === 0) {
      return null;
    }

    const from = editor.getCursor('from');
    const to = editor.getCursor('to');

    return {
      start: {
        chapterIndex,
        lineNumber: from.line + 1,
        characterOffset: from.ch,
      },
      end: {
        chapterIndex,
        lineNumber: to.line + 1,
        characterOffset: to.ch,
      },
    };
  }

  // ============ 与故事单元集成 ============

  /**
   * 将精确标记转换为故事单元
   * 
   * @param bookPath - 书籍文件夹路径
   * @param markId - 标记 ID
   * @param unitName - 故事单元名称
   * @param options - 其他选项
   * @returns 创建的故事单元 ID
   */
  async convertToStoryUnit(
    bookPath: string,
    markId: string,
    unitName: string,
    options?: {
      lineType?: 'main' | 'sub' | 'independent' | 'custom';
      categories?: string[];
      relatedCharacters?: string[];
    }
  ): Promise<string> {
    const storage = await this.loadStorage(bookPath);
    const mark = storage.marks.find(m => m.markId === markId);
    
    if (!mark) {
      throw new Error(`未找到标记: ${markId}`);
    }

    // 提取文本内容
    const textContent = await this.extractMarkedText(bookPath, markId);

    // 安全地计算章节范围
    const startChapterIndex = mark.range?.start?.chapterIndex ?? 0;
    const endChapterIndex = mark.range?.end?.chapterIndex ?? startChapterIndex;
    
    const chapterRange = {
      start: startChapterIndex + 1, // 转为 1-based
      end: endChapterIndex + 1,
    };

    // 创建故事单元
    const unitId = await this.bookDatabaseService.addStoryUnit(bookPath, {
      bookId: mark.bookId,
      name: unitName,
      chapterRange,
      preciseRange: mark.range,
      lineType: options?.lineType || 'main',
      categories: options?.categories,
      relatedCharacters: options?.relatedCharacters || [],
      textContent,
      analysisTemplate: 'seven-step',
      source: 'manual',
    });

    // 更新标记关联
    const markIndex = storage.marks.findIndex(m => m.markId === markId);
    if (markIndex !== -1) {
      storage.marks[markIndex].storyUnitId = unitId;
      storage.marks[markIndex].updatedAt = new Date().toISOString();
      storage.lastUpdated = new Date().toISOString();
      await this.saveStorage(bookPath, storage);
    }

    return unitId;
  }

  // ============ 辅助方法 ============

  /**
   * 生成唯一标记 ID
   */
  private generateMarkId(): string {
    return `pm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 判断位置 a 是否在位置 b 之后
   */
  private isPositionAfter(a: PrecisePosition, b: PrecisePosition): boolean {
    if (a.chapterIndex > b.chapterIndex) return true;
    if (a.chapterIndex < b.chapterIndex) return false;
    
    if (a.lineNumber > b.lineNumber) return true;
    if (a.lineNumber < b.lineNumber) return false;
    
    return a.characterOffset >= b.characterOffset;
  }

  /**
   * 加载存储
   */
  private async loadStorage(bookPath: string): Promise<PreciseMarkStorage> {
    const filePath = normalizePath(`${bookPath}/.novelcraft/${PreciseMarkingService.STORAGE_FILE}`);
    
    try {
      const exists = await this.app.vault.adapter.exists(filePath);
      if (!exists) {
        return this.createEmptyStorage(bookPath);
      }
      
      const content = await this.app.vault.adapter.read(filePath);
      return JSON.parse(content) as PreciseMarkStorage;
    } catch {
      return this.createEmptyStorage(bookPath);
    }
  }

  /**
   * 保存存储
   */
  private async saveStorage(bookPath: string, storage: PreciseMarkStorage): Promise<void> {
    const folderPath = normalizePath(`${bookPath}/.novelcraft`);
    const filePath = normalizePath(`${folderPath}/${PreciseMarkingService.STORAGE_FILE}`);
    
    // 确保文件夹存在
    const folderExists = await this.app.vault.adapter.exists(folderPath);
    if (!folderExists) {
      await this.app.vault.createFolder(folderPath);
    }
    
    await this.app.vault.adapter.write(filePath, JSON.stringify(storage, null, 2));
  }

  /**
   * 创建空存储
   */
  private async createEmptyStorage(bookPath: string): Promise<PreciseMarkStorage> {
    const bookId = await this.bookDatabaseService.getBookId(bookPath);
    return {
      version: '1.0.0',
      bookId: bookId || '',
      marks: [],
      unpairedMarks: [],
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * 获取标记信息
   * 
   * @param bookPath - 书籍文件夹路径
   * @param markId - 标记 ID
   * @returns 标记信息
   */
  async getMark(bookPath: string, markId: string): Promise<PreciseMark | UnpairedMark | null> {
    const storage = await this.loadStorage(bookPath);
    
    // 先查找已配对标记
    const pairedMark = storage.marks.find(m => m.markId === markId);
    if (pairedMark) {
      return pairedMark;
    }
    
    // 再查找未配对标记
    const unpairedMark = storage.unpairedMarks.find(m => m.markId === markId);
    return unpairedMark || null;
  }

  /**
   * 更新标记名称
   * 
   * @param bookPath - 书籍文件夹路径
   * @param markId - 标记 ID
   * @param name - 新名称
   */
  async updateMarkName(bookPath: string, markId: string, name: string): Promise<void> {
    const storage = await this.loadStorage(bookPath);
    const now = new Date().toISOString();
    
    // 查找并更新已配对标记
    const pairedIndex = storage.marks.findIndex(m => m.markId === markId);
    if (pairedIndex !== -1) {
      storage.marks[pairedIndex].name = name;
      storage.marks[pairedIndex].updatedAt = now;
      storage.lastUpdated = now;
      await this.saveStorage(bookPath, storage);
      return;
    }
    
    // 查找并更新未配对标记
    const unpairedIndex = storage.unpairedMarks.findIndex(m => m.markId === markId);
    if (unpairedIndex !== -1) {
      storage.unpairedMarks[unpairedIndex].name = name;
      storage.lastUpdated = now;
      await this.saveStorage(bookPath, storage);
    }
  }
}
