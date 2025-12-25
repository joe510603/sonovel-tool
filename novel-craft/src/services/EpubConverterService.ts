import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { EpubParser } from '../core/EpubParser';
import { TimelineDatabaseService } from './DatabaseService';
import { Chapter, ParsedBook } from '../types';

/**
 * EPUB 转换选项
 */
export interface ConversionOptions {
  /** 输出目录 */
  outputPath: string;
  /** 是否合并为单文件 */
  mergeToSingleFile: boolean;
  /** 是否保留 HTML 标签 */
  preserveHtmlTags: boolean;
  /** 是否包含章节导航 */
  includeNavigation: boolean;
  /** 是否链接到分析笔记 */
  linkToAnalysis: boolean;
}

/**
 * 单个 EPUB 转换结果
 */
export interface ConversionResult {
  /** 是否成功 */
  success: boolean;
  /** 书籍文件夹路径 */
  bookFolder: string;
  /** 索引文件路径 */
  indexFile: string;
  /** 章节文件路径列表 */
  chapterFiles: string[];
  /** 总章节数 */
  totalChapters: number;
  /** 总字数 */
  totalWords: number;
  /** 错误信息列表 */
  errors: string[];
}

/**
 * 批量转换结果
 */
export interface BatchConversionResult {
  /** 成功数量 */
  successCount: number;
  /** 失败数量 */
  failedCount: number;
  /** 跳过数量 */
  skippedCount: number;
  /** 各文件转换结果 */
  results: Array<{
    epubPath: string;
    result?: ConversionResult;
    error?: string;
    skipped?: boolean;
  }>;
}

/**
 * 默认 EPUB 转换设置
 */
export const DEFAULT_EPUB_CONVERSION_SETTINGS: ConversionOptions = {
  outputPath: 'NovelCraft/books',
  mergeToSingleFile: false,
  preserveHtmlTags: false,
  includeNavigation: true,
  linkToAnalysis: true
};

/**
 * EpubConverterService - EPUB 转 Markdown 转换服务
 * 
 * 功能：
 * - 将 EPUB 文件转换为 Markdown 格式
 * - 生成章节文件和索引文件
 * - 支持批量转换
 * - 支持已转换检测
 * - 自动初始化书籍数据库
 */
export class EpubConverterService {
  private app: App;
  private epubParser: EpubParser;
  private databaseService: TimelineDatabaseService | null = null;

  /** 文件名中需要清理的非法字符 */
  private static readonly ILLEGAL_CHARS = /[\/\\:*?"<>|]/g;

  constructor(app: App, databaseService?: TimelineDatabaseService) {
    this.app = app;
    this.epubParser = new EpubParser();
    this.databaseService = databaseService || null;
  }

  /**
   * 设置 DatabaseService 实例
   * 用于在转换完成后自动初始化书籍数据库
   */
  setDatabaseService(databaseService: TimelineDatabaseService): void {
    this.databaseService = databaseService;
  }


  /**
   * 转换单个 EPUB 文件为 Markdown
   * @param epubPath EPUB 文件路径
   * @param options 转换选项
   * @param onProgress 进度回调
   * @returns 转换结果
   */
  async convert(
    epubPath: string,
    options: Partial<ConversionOptions> = {},
    onProgress?: (progress: number, message: string) => void
  ): Promise<ConversionResult> {
    const fullOptions: ConversionOptions = {
      ...DEFAULT_EPUB_CONVERSION_SETTINGS,
      ...options
    };

    const result: ConversionResult = {
      success: false,
      bookFolder: '',
      indexFile: '',
      chapterFiles: [],
      totalChapters: 0,
      totalWords: 0,
      errors: []
    };

    try {
      // 1. 读取 EPUB 文件
      onProgress?.(10, '正在读取 EPUB 文件...');
      const epubFile = this.app.vault.getAbstractFileByPath(epubPath);
      if (!(epubFile instanceof TFile)) {
        throw new Error(`文件不存在: ${epubPath}`);
      }

      const epubData = await this.app.vault.readBinary(epubFile);

      // 2. 解析 EPUB
      onProgress?.(20, '正在解析 EPUB 结构...');
      const parsedBook = await this.epubParser.parse(epubData);

      // 3. 创建书籍文件夹
      onProgress?.(30, '正在创建书籍目录...');
      const bookFolderName = this.sanitizeFilename(parsedBook.metadata.title);
      const bookFolderPath = normalizePath(`${fullOptions.outputPath}/${bookFolderName}`);
      result.bookFolder = bookFolderPath;

      await this.ensureFolder(bookFolderPath);

      // 4. 根据选项生成文件
      if (fullOptions.mergeToSingleFile) {
        // 合并为单文件模式
        onProgress?.(50, '正在生成单文件...');
        const singleFilePath = await this.generateSingleFile(
          parsedBook,
          bookFolderPath,
          fullOptions
        );
        result.indexFile = singleFilePath;
        result.chapterFiles = [singleFilePath];
      } else {
        // 多文件模式：生成章节文件和索引
        onProgress?.(40, '正在生成章节文件...');
        const chapterFiles = await this.generateChapterFiles(
          parsedBook,
          bookFolderPath,
          fullOptions,
          (current, total) => {
            const progress = 40 + Math.floor((current / total) * 40);
            onProgress?.(progress, `正在生成章节 ${current}/${total}...`);
          }
        );
        result.chapterFiles = chapterFiles;

        onProgress?.(85, '正在生成索引文件...');
        const indexFile = await this.generateIndexFile(
          parsedBook,
          bookFolderPath,
          chapterFiles,
          fullOptions
        );
        result.indexFile = indexFile;
      }

      result.totalChapters = parsedBook.chapters.length;
      result.totalWords = parsedBook.totalWordCount;
      result.success = true;

      // 5. 保存到数据库
      onProgress?.(95, '正在保存到数据库...');
      if (this.databaseService) {
        try {
          await this.databaseService.books.create({
            title: parsedBook.metadata.title,
            author: parsedBook.metadata.author,
            description: parsedBook.metadata.description,
            import_time: Date.now(),
            file_path: bookFolderPath,
            cover_image: parsedBook.metadata.coverImage,
            total_word_count: parsedBook.totalWordCount,
            chapter_count: parsedBook.chapters.length
          });
        } catch (dbError) {
          // 数据库保存失败不影响转换结果，只记录警告
          result.errors.push(`数据库保存警告: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
        }
      }

      // 6. 更新书库总览
      onProgress?.(98, '正在更新书库总览...');
      try {
        await this.updateLibraryIndex(fullOptions.outputPath);
      } catch (indexError) {
        // 书库总览更新失败不影响转换结果，只记录警告
        result.errors.push(`书库总览更新警告: ${indexError instanceof Error ? indexError.message : String(indexError)}`);
      }

      onProgress?.(100, '转换完成！');

    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    return result;
  }

  /**
   * 批量转换 EPUB 文件
   * @param epubPaths EPUB 文件路径列表
   * @param options 转换选项
   * @param onProgress 进度回调
   * @returns 批量转换结果
   */
  async convertBatch(
    epubPaths: string[],
    options: Partial<ConversionOptions> = {},
    onProgress?: (current: number, total: number, filename: string) => void
  ): Promise<BatchConversionResult> {
    const batchResult: BatchConversionResult = {
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      results: []
    };

    const total = epubPaths.length;

    for (let i = 0; i < epubPaths.length; i++) {
      const epubPath = epubPaths[i];
      const filename = epubPath.split('/').pop() || epubPath;

      onProgress?.(i + 1, total, filename);

      try {
        // 检查是否已转换
        const alreadyConverted = await this.isConverted(epubPath, options.outputPath);
        if (alreadyConverted) {
          batchResult.skippedCount++;
          batchResult.results.push({
            epubPath,
            skipped: true
          });
          continue;
        }

        const result = await this.convert(epubPath, options);
        
        if (result.success) {
          batchResult.successCount++;
        } else {
          batchResult.failedCount++;
        }

        batchResult.results.push({
          epubPath,
          result
        });

      } catch (error) {
        batchResult.failedCount++;
        batchResult.results.push({
          epubPath,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    // 批量转换完成后更新书库总览
    if (batchResult.successCount > 0) {
      try {
        await this.updateLibraryIndex(options.outputPath);
      } catch {
        // 忽略书库总览更新错误
      }
    }

    return batchResult;
  }

  /**
   * 检查 EPUB 是否已被转换
   * @param epubPath EPUB 文件路径
   * @param outputPath 输出目录（可选）
   * @returns 是否已转换
   */
  async isConverted(
    epubPath: string,
    outputPath?: string
  ): Promise<boolean> {
    try {
      // 获取 EPUB 文件
      const epubFile = this.app.vault.getAbstractFileByPath(epubPath);
      if (!(epubFile instanceof TFile)) {
        return false;
      }

      // 读取 EPUB 获取书名
      const epubData = await this.app.vault.readBinary(epubFile);
      const parsedBook = await this.epubParser.parse(epubData);
      
      const bookFolderName = this.sanitizeFilename(parsedBook.metadata.title);
      const basePath = outputPath || DEFAULT_EPUB_CONVERSION_SETTINGS.outputPath;
      const bookFolderPath = normalizePath(`${basePath}/${bookFolderName}`);

      // 检查文件夹是否存在
      const folder = this.app.vault.getAbstractFileByPath(bookFolderPath);
      return folder instanceof TFolder;

    } catch {
      return false;
    }
  }

  /**
   * 清理文件名中的非法字符
   * @param name 原始文件名
   * @returns 清理后的文件名
   */
  sanitizeFilename(name: string): string {
    if (!name) {
      return 'untitled';
    }
    
    // 移除非法字符: / \ : * ? " < > |
    let sanitized = name.replace(EpubConverterService.ILLEGAL_CHARS, '');
    
    // 移除首尾空白
    sanitized = sanitized.trim();
    
    // 如果清理后为空，返回默认名称
    if (!sanitized) {
      return 'untitled';
    }
    
    return sanitized;
  }


  /**
   * 生成所有章节文件
   * @param book 解析后的书籍
   * @param bookFolderPath 书籍文件夹路径
   * @param options 转换选项
   * @param onChapterProgress 章节进度回调
   * @returns 章节文件路径列表
   */
  private async generateChapterFiles(
    book: ParsedBook,
    bookFolderPath: string,
    options: ConversionOptions,
    onChapterProgress?: (current: number, total: number) => void
  ): Promise<string[]> {
    const chapterFiles: string[] = [];
    const total = book.chapters.length;

    // 先收集所有章节标题用于生成正确的导航链接
    const chapterTitles = book.chapters.map(ch => this.sanitizeFilename(ch.title));

    for (let i = 0; i < book.chapters.length; i++) {
      const chapter = book.chapters[i];
      const chapterNum = i + 1;
      const sanitizedTitle = this.sanitizeFilename(chapter.title);
      const filename = `${String(chapterNum).padStart(2, '0')}-${sanitizedTitle}.md`;
      const filePath = normalizePath(`${bookFolderPath}/${filename}`);

      // 生成带正确导航链接的 Markdown
      const markdown = this.generateChapterMarkdownWithTitles(
        chapter,
        i,
        total,
        book.metadata.title,
        chapterTitles,
        options
      );

      // 检查文件是否已存在
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);
      if (existingFile instanceof TFile) {
        await this.app.vault.modify(existingFile, markdown);
      } else {
        await this.app.vault.create(filePath, markdown);
      }
      
      chapterFiles.push(filePath);
      onChapterProgress?.(i + 1, total);
    }

    return chapterFiles;
  }

  /**
   * 生成章节 Markdown（使用真实章节标题）
   * @param chapter 章节对象
   * @param index 章节索引 (0-based)
   * @param total 总章节数
   * @param bookTitle 书籍标题
   * @param chapterTitles 所有章节标题列表
   * @param options 转换选项
   * @returns Markdown 内容
   */
  private generateChapterMarkdownWithTitles(
    chapter: Chapter,
    index: number,
    total: number,
    bookTitle: string,
    chapterTitles: string[],
    options: ConversionOptions
  ): string {
    const chapterNum = index + 1;
    const sanitizedBookTitle = this.sanitizeFilename(bookTitle);
    
    // 生成前后章节链接
    const prevLink = index === 0
      ? `[[00-${sanitizedBookTitle}-管理|📚 目录]]`
      : `[[${String(index).padStart(2, '0')}-${chapterTitles[index - 1]}|⬅️ 上一章]]`;
    
    const nextLink = index === total - 1
      ? ''
      : `[[${String(chapterNum + 1).padStart(2, '0')}-${chapterTitles[index + 1]}|➡️ 下一章]]`;

    // 构建 YAML frontmatter
    const frontmatter = [
      '---',
      `book: "${bookTitle}"`,
      `chapter: ${chapterNum}`,
      `title: "${chapter.title}"`,
      `wordCount: ${chapter.wordCount}`,
      `prev: "${prevLink}"`,
      `next: "${nextLink}"`,
      '---'
    ].join('\n');

    // 构建正文内容
    const content = chapter.content;

    // 构建底部导航
    const navigation = options.includeNavigation
      ? this.generateNavigationLinks(prevLink, nextLink)
      : '';

    return `${frontmatter}\n\n# ${chapter.title}\n\n${content}\n\n${navigation}`;
  }

  /**
   * 生成底部导航链接
   * @param prevLink 上一章链接
   * @param nextLink 下一章链接
   * @returns 导航 Markdown
   */
  private generateNavigationLinks(prevLink: string, nextLink: string): string {
    const parts: string[] = ['---', ''];
    
    if (prevLink && nextLink) {
      parts.push(`${prevLink} | ${nextLink}`);
    } else if (prevLink) {
      parts.push(prevLink);
    } else if (nextLink) {
      parts.push(nextLink);
    }
    
    return parts.join('\n');
  }

  /**
   * 生成索引文件
   * @param book 解析后的书籍
   * @param bookFolderPath 书籍文件夹路径
   * @param chapterFiles 章节文件路径列表
   * @param options 转换选项
   * @returns 索引文件路径
   */
  private async generateIndexFile(
    book: ParsedBook,
    bookFolderPath: string,
    _chapterFiles: string[],
    _options: ConversionOptions
  ): Promise<string> {
    const sanitizedTitle = this.sanitizeFilename(book.metadata.title);
    const filename = `00-${sanitizedTitle}-管理.md`;
    const filePath = normalizePath(`${bookFolderPath}/${filename}`);

    const now = new Date().toISOString().split('T')[0];

    // 构建 frontmatter
    const frontmatter = [
      '---',
      'type: book-manager',
      `book: "${book.metadata.title}"`,
      `author: "${book.metadata.author}"`,
      `totalChapters: ${book.chapters.length}`,
      `totalWords: ${book.totalWordCount}`,
      `convertedAt: "${now}"`,
      'currentChapter: 1',
      'readingStatus: "unread"',
      'lastReadAt: ""',
      '---'
    ].join('\n');

    // 构建章节目录
    const chapterList = book.chapters.map((ch, i) => {
      const chapterNum = i + 1;
      const sanitizedChTitle = this.sanitizeFilename(ch.title);
      const chapterFilename = `${String(chapterNum).padStart(2, '0')}-${sanitizedChTitle}`;
      return `${chapterNum}. [[${chapterFilename}|${ch.title}]]`;
    }).join('\n');

    // 构建完整内容
    const content = `${frontmatter}

# 📖 ${book.metadata.title}

## 基本信息

| 属性 | 值 |
|-----|-----|
| 作者 | ${book.metadata.author} |
| 章节数 | ${book.chapters.length} 章 |
| 总字数 | ${this.formatWordCount(book.totalWordCount)} |
| 转换时间 | ${now} |

## 阅读进度

**当前进度**: 0 / ${book.chapters.length} 章 (0%)
**上次阅读**: -

### 快捷操作

- 🔖 [[01-${this.sanitizeFilename(book.chapters[0]?.title || 'chapter-1')}|开始阅读]]

## 章节目录

${chapterList}
`;

    // 检查文件是否已存在
    const existingFile = this.app.vault.getAbstractFileByPath(filePath);
    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      await this.app.vault.create(filePath, content);
    }
    
    return filePath;
  }


  /**
   * 生成单文件（合并所有章节）
   * @param book 解析后的书籍
   * @param bookFolderPath 书籍文件夹路径
   * @param options 转换选项
   * @returns 单文件路径
   */
  private async generateSingleFile(
    book: ParsedBook,
    bookFolderPath: string,
    _options: ConversionOptions
  ): Promise<string> {
    const sanitizedTitle = this.sanitizeFilename(book.metadata.title);
    const filename = `${sanitizedTitle}.md`;
    const filePath = normalizePath(`${bookFolderPath}/${filename}`);

    const now = new Date().toISOString().split('T')[0];

    // 构建 frontmatter
    const frontmatter = [
      '---',
      'type: book-single',
      `book: "${book.metadata.title}"`,
      `author: "${book.metadata.author}"`,
      `totalChapters: ${book.chapters.length}`,
      `totalWords: ${book.totalWordCount}`,
      `convertedAt: "${now}"`,
      '---'
    ].join('\n');

    // 构建目录
    const toc = book.chapters.map((ch, i) => {
      return `${i + 1}. [${ch.title}](#${this.slugify(ch.title)})`;
    }).join('\n');

    // 构建所有章节内容
    const chaptersContent = book.chapters.map((ch) => {
      return `## ${ch.title}\n\n${ch.content}`;
    }).join('\n\n---\n\n');

    const content = `${frontmatter}

# ${book.metadata.title}

**作者**: ${book.metadata.author}
**章节数**: ${book.chapters.length} 章
**总字数**: ${this.formatWordCount(book.totalWordCount)}

## 目录

${toc}

---

${chaptersContent}
`;

    // 检查文件是否已存在
    const existingFile = this.app.vault.getAbstractFileByPath(filePath);
    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      await this.app.vault.create(filePath, content);
    }
    
    return filePath;
  }

  /**
   * 确保文件夹存在
   * @param folderPath 文件夹路径
   */
  private async ensureFolder(folderPath: string): Promise<void> {
    const parts = folderPath.split('/').filter(p => p);
    let currentPath = '';
    
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const folder = this.app.vault.getAbstractFileByPath(currentPath);
      
      if (!folder) {
        await this.app.vault.createFolder(currentPath);
      }
    }
  }

  /**
   * 格式化字数显示
   * @param count 字数
   * @returns 格式化后的字符串
   */
  private formatWordCount(count: number): string {
    if (count >= 10000) {
      return `${(count / 10000).toFixed(1)} 万字`;
    }
    return `${count} 字`;
  }

  /**
   * 生成 slug（用于锚点链接）
   * @param text 文本
   * @returns slug 字符串
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u4e00-\u9fa5-]/g, '');
  }

  /** 书库总览文件名 */
  private static readonly LIBRARY_INDEX_FILE = '00-书库总览.md';

  /**
   * 更新书库总览文档
   * 扫描 books 目录下所有书籍，生成统一的书库总览
   * @param outputPath 输出目录（默认为 NovelCraft/books）
   */
  async updateLibraryIndex(outputPath?: string): Promise<void> {
    const basePath = outputPath || DEFAULT_EPUB_CONVERSION_SETTINGS.outputPath;
    const libraryIndexPath = normalizePath(`${basePath}/${EpubConverterService.LIBRARY_INDEX_FILE}`);

    // 获取所有书籍信息
    const books = await this.scanBooksFolder(basePath);

    // 生成书库总览内容
    const content = this.generateLibraryIndexContent(books);

    // 保存文件
    const existingFile = this.app.vault.getAbstractFileByPath(libraryIndexPath);
    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      // 确保目录存在
      await this.ensureFolder(basePath);
      await this.app.vault.create(libraryIndexPath, content);
    }
  }

  /**
   * 扫描书籍文件夹，获取所有书籍信息
   * @param basePath 书籍根目录
   * @returns 书籍信息列表
   */
  private async scanBooksFolder(basePath: string): Promise<BookInfo[]> {
    const books: BookInfo[] = [];
    const baseFolder = this.app.vault.getAbstractFileByPath(basePath);
    
    if (!(baseFolder instanceof TFolder)) {
      return books;
    }

    // 遍历所有子文件夹
    for (const child of baseFolder.children) {
      if (child instanceof TFolder) {
        // 查找书籍管理文件（00-xxx-管理.md）
        const managerFile = child.children.find(f => 
          f instanceof TFile && 
          f.name.startsWith('00-') && 
          f.name.endsWith('-管理.md')
        );

        if (managerFile instanceof TFile) {
          const bookInfo = await this.parseBookManagerFile(managerFile, child.path);
          if (bookInfo) {
            books.push(bookInfo);
          }
        }
      }
    }

    // 按转换时间倒序排列
    books.sort((a, b) => {
      const dateA = new Date(a.convertedAt || '1970-01-01').getTime();
      const dateB = new Date(b.convertedAt || '1970-01-01').getTime();
      return dateB - dateA;
    });

    return books;
  }

  /**
   * 解析书籍管理文件，提取书籍信息
   * @param file 管理文件
   * @param folderPath 书籍文件夹路径
   * @returns 书籍信息
   */
  private async parseBookManagerFile(file: TFile, folderPath: string): Promise<BookInfo | null> {
    try {
      const content = await this.app.vault.read(file);
      
      // 解析 frontmatter
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      if (!frontmatterMatch) {
        return null;
      }

      const frontmatter = frontmatterMatch[1];
      
      // 提取各字段
      const getField = (field: string): string => {
        const match = frontmatter.match(new RegExp(`${field}:\\s*"?([^"\\n]*)"?`));
        return match ? match[1].trim() : '';
      };

      const getNumberField = (field: string): number => {
        const match = frontmatter.match(new RegExp(`${field}:\\s*(\\d+)`));
        return match ? parseInt(match[1], 10) : 0;
      };

      return {
        title: getField('book'),
        author: getField('author'),
        totalChapters: getNumberField('totalChapters'),
        totalWords: getNumberField('totalWords'),
        currentChapter: getNumberField('currentChapter'),
        readingStatus: getField('readingStatus') as 'unread' | 'reading' | 'finished' || 'unread',
        convertedAt: getField('convertedAt'),
        lastReadAt: getField('lastReadAt'),
        folderPath,
        managerFile: file.path
      };
    } catch {
      return null;
    }
  }

  /**
   * 生成书库总览内容
   * 按照 novel-craft1111 的设计，包含统计、正在阅读、最近添加、全部书籍四个区域
   * @param books 书籍列表
   * @returns Markdown 内容
   */
  private generateLibraryIndexContent(books: BookInfo[]): string {
    const now = new Date().toISOString().split('T')[0];
    
    // 统计信息
    const totalBooks = books.length;
    const readingBooks = books.filter(b => b.readingStatus === 'reading').length;
    const finishedBooks = books.filter(b => b.readingStatus === 'finished').length;
    const unreadBooks = books.filter(b => b.readingStatus === 'unread').length;
    const totalWords = books.reduce((sum, b) => sum + (b.totalWords || 0), 0);

    // 构建 frontmatter
    const frontmatter = [
      '---',
      'type: library-index',
      `lastUpdated: "${now}"`,
      '---'
    ].join('\n');

    // 统计区域
    const statsSection = `## 统计

| 指标 | 数值 |
|-----|-----|
| 总书籍数 | ${totalBooks} 本 |
| 已读完 | ${finishedBooks} 本 |
| 阅读中 | ${readingBooks} 本 |
| 未开始 | ${unreadBooks} 本 |
| 总字数 | ${this.formatWordCount(totalWords)} |`;

    // 正在阅读区域
    const readingList = books
      .filter(b => b.readingStatus === 'reading')
      .sort((a, b) => (b.lastReadAt || '').localeCompare(a.lastReadAt || ''));
    const readingSection = this.generateReadingSection(readingList);

    // 最近添加区域（最多显示5本）
    const recentBooks = [...books]
      .sort((a, b) => b.convertedAt.localeCompare(a.convertedAt))
      .slice(0, 5);
    const recentSection = this.generateRecentSection(recentBooks);

    // 全部书籍区域（按状态分组）
    const allBooksSection = this.generateAllBooksSection(books);

    return `${frontmatter}

# 📚 我的小说书库

${statsSection}

${readingSection}

${recentSection}

${allBooksSection}
`;
  }

  /**
   * 生成"正在阅读"区域
   * @param readingBooks 正在阅读的书籍列表
   * @returns Markdown 内容
   */
  private generateReadingSection(readingBooks: BookInfo[]): string {
    if (readingBooks.length === 0) {
      return `## 📖 正在阅读

_暂无正在阅读的书籍_`;
    }

    const items = readingBooks.map(book => {
      const progress = book.totalChapters > 0 
        ? Math.round((book.currentChapter / book.totalChapters) * 100) 
        : 0;
      const sanitizedTitle = this.sanitizeFilename(book.title);
      const managerFile = `${sanitizedTitle}/00-${sanitizedTitle}-管理`;
      const lastRead = book.lastReadAt 
        ? new Date(book.lastReadAt).toLocaleDateString('zh-CN')
        : '-';
      return `- [[${managerFile}|${book.title}]] - ${book.author || '未知'} - 进度: ${book.currentChapter}/${book.totalChapters} (${progress}%) - 上次阅读: ${lastRead}`;
    }).join('\n');

    return `## 📖 正在阅读

${items}`;
  }

  /**
   * 生成"最近添加"区域
   * @param recentBooks 最近添加的书籍列表
   * @returns Markdown 内容
   */
  private generateRecentSection(recentBooks: BookInfo[]): string {
    if (recentBooks.length === 0) {
      return `## 🆕 最近添加

_暂无书籍_`;
    }

    const items = recentBooks.map(book => {
      const sanitizedTitle = this.sanitizeFilename(book.title);
      const managerFile = `${sanitizedTitle}/00-${sanitizedTitle}-管理`;
      return `- [[${managerFile}|${book.title}]] - ${book.author || '未知'} - ${book.totalChapters} 章 - 添加于 ${book.convertedAt}`;
    }).join('\n');

    return `## 🆕 最近添加

${items}`;
  }

  /**
   * 生成"全部书籍"区域（按状态分组）
   * @param books 所有书籍列表
   * @returns Markdown 内容
   */
  private generateAllBooksSection(books: BookInfo[]): string {
    const reading = books.filter(b => b.readingStatus === 'reading');
    const finished = books.filter(b => b.readingStatus === 'finished');
    const unread = books.filter(b => b.readingStatus === 'unread');

    /**
     * 格式化书籍列表
     * @param bookList 书籍列表
     * @param showProgress 是否显示进度
     * @returns 格式化后的列表字符串
     */
    const formatBookList = (bookList: BookInfo[], showProgress: boolean = false): string => {
      if (bookList.length === 0) {
        return '_暂无书籍_';
      }
      return bookList.map(book => {
        const sanitizedTitle = this.sanitizeFilename(book.title);
        const managerFile = `${sanitizedTitle}/00-${sanitizedTitle}-管理`;
        if (showProgress) {
          return `- [[${managerFile}|${book.title}]] - ${book.author || '未知'} - 进度: ${book.currentChapter}/${book.totalChapters}`;
        }
        return `- [[${managerFile}|${book.title}]] - ${book.author || '未知'}`;
      }).join('\n');
    };

    return `## 全部书籍

### 📖 阅读中

${formatBookList(reading, true)}

### ✅ 已读完

${formatBookList(finished)}

### 📚 待阅读

${formatBookList(unread)}`;
  }
}

/**
 * 书籍信息接口（用于书库总览）
 */
interface BookInfo {
  title: string;
  author: string;
  totalChapters: number;
  totalWords: number;
  currentChapter: number;
  readingStatus: 'unread' | 'reading' | 'finished';
  convertedAt: string;
  lastReadAt: string;
  folderPath: string;
  managerFile: string;
}
