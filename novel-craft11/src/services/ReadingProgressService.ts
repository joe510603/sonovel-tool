import { App, TFile, normalizePath, EventRef, Events } from 'obsidian';
import {
  ReadingProgress,
  BookEntry,
  DEFAULT_EPUB_CONVERSION_SETTINGS
} from '../types';
import { LibraryService } from './LibraryService';

/**
 * ReadingProgressService - 阅读进度追踪服务
 * 
 * 功能：
 * - 管理阅读进度数据的存储和读取
 * - 监听章节文件打开事件，自动更新进度
 * - 同步更新书籍管理文档和书库总览
 * 
 * Requirements: 5.1, 5.2, 5.4
 */
export class ReadingProgressService extends Events {
  private app: App;
  private libraryService: LibraryService;
  private outputPath: string;
  private fileOpenRef: EventRef | null = null;

  /** 进度数据文件名 */
  private static readonly PROGRESS_DATA_FILE = '.reading-progress.json';

  constructor(app: App, libraryService: LibraryService, outputPath?: string) {
    super();
    this.app = app;
    this.libraryService = libraryService;
    this.outputPath = outputPath || DEFAULT_EPUB_CONVERSION_SETTINGS.outputPath;
  }

  /**
   * 设置输出路径
   */
  setOutputPath(path: string): void {
    this.outputPath = path;
    this.libraryService.setOutputPath(path);
  }

  /**
   * 启动文件打开事件监听
   * Requirements: 5.1
   */
  startWatching(): void {
    if (this.fileOpenRef) {
      return; // 已经在监听
    }

    console.log(`NovelCraft [ReadingProgress]: 启动阅读进度监听，监控路径: ${this.outputPath}`);

    this.fileOpenRef = this.app.workspace.on('file-open', async (file) => {
      if (file) {
        await this.handleFileOpen(file);
      }
    });
  }

  /**
   * 停止文件打开事件监听
   */
  stopWatching(): void {
    if (this.fileOpenRef) {
      this.app.workspace.offref(this.fileOpenRef);
      this.fileOpenRef = null;
    }
  }

  /**
   * 处理文件打开事件
   * Requirements: 5.1, 5.2
   */
  private async handleFileOpen(file: TFile): Promise<void> {
    // 检查是否是章节文件
    const chapterInfo = this.parseChapterFilePath(file.path);
    if (!chapterInfo) {
      return;
    }

    const { bookTitle, chapterIndex } = chapterInfo;
    
    console.log(`NovelCraft [ReadingProgress]: 检测到章节打开 - 书籍: ${bookTitle}, 章节: ${chapterIndex}`);

    // 更新阅读进度
    await this.updateProgress(bookTitle, chapterIndex);
  }

  /**
   * 解析章节文件路径，提取书籍标题和章节索引
   * 文件路径格式: {outputPath}/{bookTitle}/{chapterIndex}-{chapterTitle}.md
   */
  private parseChapterFilePath(filePath: string): { bookTitle: string; chapterIndex: number } | null {
    const normalizedPath = normalizePath(filePath);
    const normalizedOutputPath = normalizePath(this.outputPath);

    // 检查是否在输出目录下
    if (!normalizedPath.startsWith(normalizedOutputPath)) {
      return null;
    }

    // 提取相对路径
    const relativePath = normalizedPath.slice(normalizedOutputPath.length + 1);
    const parts = relativePath.split('/');

    // 期望格式: bookTitle/chapterFile.md
    if (parts.length !== 2) {
      return null;
    }

    const [bookTitle, chapterFile] = parts;

    // 跳过管理文件和书库总览
    if (chapterFile.includes('-管理') || chapterFile.startsWith('00-')) {
      return null;
    }

    // 解析章节文件名: "01-章节标题.md"
    const match = chapterFile.match(/^(\d+)-(.+)\.md$/);
    if (!match) {
      return null;
    }

    const chapterIndex = parseInt(match[1], 10);
    if (isNaN(chapterIndex) || chapterIndex <= 0) {
      return null;
    }

    return { bookTitle, chapterIndex };
  }

  /**
   * 获取阅读进度
   * Requirements: 5.1
   */
  async getProgress(bookTitle: string): Promise<ReadingProgress | null> {
    const book = await this.libraryService.getBook(bookTitle);
    if (!book) {
      return null;
    }

    return {
      bookTitle: book.title,
      currentChapter: book.currentChapter,
      totalChapters: book.totalChapters,
      lastReadAt: book.lastReadAt || '',
      readingStatus: book.readingStatus,
      bookmarks: [] // 书签功能暂未实现
    };
  }

  /**
   * 更新阅读进度（打开章节时自动调用）
   * Requirements: 5.1, 5.2
   */
  async updateProgress(bookTitle: string, chapter: number): Promise<void> {
    const book = await this.libraryService.getBook(bookTitle);
    if (!book) {
      console.warn(`NovelCraft [ReadingProgress]: 书籍不存在于书库中: ${bookTitle}`);
      return;
    }

    const now = new Date().toISOString();
    const updates: Partial<BookEntry> = {
      currentChapter: chapter,
      lastReadAt: now
    };

    // 如果是第一次阅读，更新状态为"阅读中"
    if (book.readingStatus === 'unread') {
      updates.readingStatus = 'reading';
    }

    console.log(`NovelCraft [ReadingProgress]: 更新进度 - 书籍: ${bookTitle}, 章节: ${chapter}, 状态: ${updates.readingStatus || book.readingStatus}`);

    // 更新书籍数据
    await this.libraryService.updateBook(bookTitle, updates);

    // 同步更新书籍管理文档
    try {
      await this.libraryService.updateBookManager(bookTitle);
      console.log(`NovelCraft [ReadingProgress]: 已更新书籍管理文档`);
    } catch (error) {
      console.warn('NovelCraft [ReadingProgress]: 更新书籍管理文档失败', error);
    }

    // 同步更新书库总览
    try {
      await this.libraryService.updateLibraryIndex();
      console.log(`NovelCraft [ReadingProgress]: 已更新书库总览`);
    } catch (error) {
      console.warn('NovelCraft [ReadingProgress]: 更新书库总览失败', error);
    }

    // 触发进度更新事件
    this.trigger('progress-updated', bookTitle, chapter);
  }

  /**
   * 更新阅读状态
   * Requirements: 5.4
   */
  async updateStatus(
    bookTitle: string,
    status: 'unread' | 'reading' | 'finished'
  ): Promise<void> {
    const book = await this.libraryService.getBook(bookTitle);
    if (!book) {
      throw new Error(`书籍不存在: ${bookTitle}`);
    }

    const updates: Partial<BookEntry> = {
      readingStatus: status
    };

    // 如果标记为已读完，更新当前章节为最后一章
    if (status === 'finished') {
      updates.currentChapter = book.totalChapters;
      updates.lastReadAt = new Date().toISOString();
    }

    // 更新书籍数据
    await this.libraryService.updateBook(bookTitle, updates);

    // 同步更新书籍管理文档
    try {
      await this.libraryService.updateBookManager(bookTitle);
    } catch (error) {
      console.warn('ReadingProgressService: 更新书籍管理文档失败', error);
    }

    // 同步更新书库总览
    try {
      await this.libraryService.updateLibraryIndex();
    } catch (error) {
      console.warn('ReadingProgressService: 更新书库总览失败', error);
    }

    // 触发状态更新事件
    this.trigger('status-updated', bookTitle, status);
  }

  /**
   * 添加书签
   */
  async addBookmark(bookTitle: string, chapter: number): Promise<void> {
    // 书签功能暂未实现，预留接口
    console.log(`ReadingProgressService: 添加书签 ${bookTitle} 第 ${chapter} 章`);
  }

  /**
   * 移除书签
   */
  async removeBookmark(bookTitle: string, chapter: number): Promise<void> {
    // 书签功能暂未实现，预留接口
    console.log(`ReadingProgressService: 移除书签 ${bookTitle} 第 ${chapter} 章`);
  }

  /**
   * 获取上次阅读章节
   * Requirements: 5.3
   */
  async getLastReadChapter(bookTitle: string): Promise<number> {
    const progress = await this.getProgress(bookTitle);
    return progress?.currentChapter || 0;
  }

  /**
   * 获取所有正在阅读的书籍
   */
  async getReadingBooks(): Promise<BookEntry[]> {
    const books = await this.libraryService.getAllBooks();
    return books.filter(b => b.readingStatus === 'reading');
  }

  /**
   * 销毁服务，清理资源
   */
  destroy(): void {
    this.stopWatching();
  }
}
