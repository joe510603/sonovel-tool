import { App, TFile, TFolder, normalizePath } from 'obsidian';
import { EpubParser } from '../core/EpubParser';
import { LibraryService } from './LibraryService';
import { BookDatabaseService } from './BookDatabaseService';
import {
  ConversionOptions,
  ConversionResult,
  BatchConversionResult,
  ParsedBook,
  Chapter,
  BookEntry,
  DEFAULT_EPUB_CONVERSION_SETTINGS
} from '../types';

/**
 * EpubConverterService - EPUB 转 Markdown 转换服务
 * 
 * 功能：
 * - 将 EPUB 文件转换为 Markdown 格式
 * - 生成章节文件和索引文件
 * - 支持批量转换
 * - 支持已转换检测
 * - 自动更新书库总览
 * - 自动初始化书籍数据库（集成 BookDatabaseService）
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 4.6, 12.1, 12.2, 12.3
 */
export class EpubConverterService {
  private app: App;
  private epubParser: EpubParser;
  private libraryService: LibraryService | null = null;
  private bookDatabaseService: BookDatabaseService | null = null;

  /** 文件名中需要清理的非法字符 */
  private static readonly ILLEGAL_CHARS = /[\/\\:*?"<>|]/g;

  constructor(app: App, libraryService?: LibraryService, bookDatabaseService?: BookDatabaseService) {
    this.app = app;
    this.epubParser = new EpubParser();
    this.libraryService = libraryService || null;
    this.bookDatabaseService = bookDatabaseService || null;
  }

  /**
   * 设置 LibraryService 实例
   * 用于在转换完成后自动更新书库
   * Requirements: 4.6
   */
  setLibraryService(libraryService: LibraryService): void {
    this.libraryService = libraryService;
  }

  /**
   * 设置 BookDatabaseService 实例
   * 用于在转换完成后自动初始化书籍数据库
   * Requirements: 12.1, 12.2, 12.3
   */
  setBookDatabaseService(bookDatabaseService: BookDatabaseService): void {
    this.bookDatabaseService = bookDatabaseService;
  }

  /**
   * 转换单个 EPUB 文件为 Markdown
   * @param epubPath EPUB 文件路径
   * @param options 转换选项
   * @param skipLibraryUpdate 是否跳过书库更新（用于批量转换）
   * @returns 转换结果
   * Requirements: 1.1, 1.2, 1.4, 4.6
   */
  async convert(
    epubPath: string,
    options: Partial<ConversionOptions> = {},
    skipLibraryUpdate: boolean = false
  ): Promise<ConversionResult> {
    const fullOptions: ConversionOptions = {
      ...DEFAULT_EPUB_CONVERSION_SETTINGS,
      linkToAnalysis: DEFAULT_EPUB_CONVERSION_SETTINGS.autoLinkAnalysis,
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
      const epubFile = this.app.vault.getAbstractFileByPath(epubPath);
      if (!(epubFile instanceof TFile)) {
        throw new Error(`文件不存在: ${epubPath}`);
      }

      const epubData = await this.app.vault.readBinary(epubFile);

      // 2. 解析 EPUB
      const parsedBook = await this.epubParser.parse(epubData);

      // 3. 创建书籍文件夹
      const bookFolderName = this.sanitizeFilename(parsedBook.metadata.title);
      const bookFolderPath = normalizePath(`${fullOptions.outputPath}/${bookFolderName}`);
      result.bookFolder = bookFolderPath;

      await this.ensureFolder(bookFolderPath);

      // 4. 根据选项生成文件
      if (fullOptions.mergeToSingleFile) {
        // 合并为单文件模式
        const singleFilePath = await this.generateSingleFile(
          parsedBook,
          bookFolderPath,
          fullOptions
        );
        result.indexFile = singleFilePath;
        result.chapterFiles = [singleFilePath];
      } else {
        // 多文件模式：生成章节文件和索引
        const chapterFiles = await this.generateChapterFiles(
          parsedBook,
          bookFolderPath,
          fullOptions
        );
        result.chapterFiles = chapterFiles;

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

      // 5. 更新书库（添加书籍并更新书库总览）
      // Requirements: 4.6
      if (this.libraryService) {
        const bookEntry: BookEntry = {
          title: parsedBook.metadata.title,
          author: parsedBook.metadata.author,
          folderPath: bookFolderPath,
          totalChapters: parsedBook.chapters.length,
          currentChapter: 0,
          readingStatus: 'unread',
          convertedAt: new Date().toISOString().split('T')[0],
          totalWords: parsedBook.totalWordCount
        };
        
        await this.libraryService.addBook(bookEntry);
        
        // 单个转换时更新书库总览，批量转换时跳过（由批量方法统一更新）
        if (!skipLibraryUpdate) {
          await this.libraryService.updateLibraryIndex();
        }
      }

      // 6. 初始化书籍数据库（创建数据库文件并给章节添加 Frontmatter）
      // Requirements: 12.1, 12.2, 12.3
      if (this.bookDatabaseService && !fullOptions.mergeToSingleFile) {
        try {
          // 初始化数据库，创建 _book_meta.md, _characters.md, _story_units.md, _events.md
          const bookId = await this.bookDatabaseService.initializeDatabase(bookFolderPath, {
            title: parsedBook.metadata.title,
            author: parsedBook.metadata.author,
            description: parsedBook.metadata.description || '',
          });

          // 更新书籍元数据（总章节数和总字数）
          await this.bookDatabaseService.updateBookMeta(bookFolderPath, {
            totalChapters: parsedBook.chapters.length,
            totalWords: parsedBook.totalWordCount,
          });

          // 给章节文件添加 Frontmatter（book_id, chapter_id, chapter_num）
          await this.bookDatabaseService.injectChapterFrontmatters(bookFolderPath, bookId);
        } catch (dbError) {
          // 数据库初始化失败不影响转换结果，只记录错误
          result.errors.push(`数据库初始化警告: ${dbError instanceof Error ? dbError.message : String(dbError)}`);
        }
      }

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
   * Requirements: 8.1, 8.3, 8.4
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

      if (onProgress) {
        onProgress(i + 1, total, filename);
      }

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

        const result = await this.convert(epubPath, options, true);
        
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
    // Requirements: 4.6
    if (this.libraryService && batchResult.successCount > 0) {
      await this.libraryService.updateLibraryIndex();
    }

    return batchResult;
  }

  /**
   * 检查 EPUB 是否已被转换
   * @param epubPath EPUB 文件路径
   * @param outputPath 输出目录（可选）
   * @returns 是否已转换
   * Requirements: 1.5
   */
  async isConverted(
    epubPath: string,
    outputPath?: string
  ): Promise<boolean> {
    try {
      // 获取 EPUB 文件名（不含扩展名）作为书籍文件夹名
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
   * Requirements: 2.4
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
   * 生成章节 Markdown 内容
   * @param chapter 章节对象
   * @param index 章节索引 (0-based)
   * @param total 总章节数
   * @param bookTitle 书籍标题
   * @param options 转换选项
   * @returns Markdown 内容
   * Requirements: 1.3, 2.1, 2.2, 2.3
   */
  generateChapterMarkdown(
    chapter: Chapter,
    index: number,
    total: number,
    bookTitle: string,
    options: ConversionOptions
  ): string {
    const chapterNum = index + 1;
    const sanitizedTitle = this.sanitizeFilename(chapter.title);
    
    // 生成前后章节链接
    const prevLink = index === 0
      ? `[[00-${this.sanitizeFilename(bookTitle)}-管理|📚 目录]]`
      : `[[${String(index).padStart(2, '0')}-${this.sanitizeFilename(this.getChapterTitle(index - 1, bookTitle))}|⬅️ 上一章]]`;
    
    const nextLink = index === total - 1
      ? ''
      : `[[${String(chapterNum + 1).padStart(2, '0')}-${this.sanitizeFilename(this.getChapterTitle(index + 1, bookTitle))}|➡️ 下一章]]`;

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
    const content = options.preserveHtmlTags
      ? chapter.content
      : chapter.content;

    // 构建底部导航
    const navigation = options.includeNavigation
      ? this.generateNavigationLinks(prevLink, nextLink)
      : '';

    return `${frontmatter}\n\n# ${chapter.title}\n\n${content}\n\n${navigation}`;
  }

  /**
   * 生成底部导航链接
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
   * 获取章节标题（用于生成链接时的占位）
   * 实际使用时会被真实标题替换
   */
  private getChapterTitle(index: number, bookTitle: string): string {
    // 这是一个占位方法，实际生成时会使用真实的章节标题
    return `chapter-${index + 1}`;
  }

  /**
   * 生成所有章节文件
   */
  private async generateChapterFiles(
    book: ParsedBook,
    bookFolderPath: string,
    options: ConversionOptions
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

      await this.app.vault.create(filePath, markdown);
      chapterFiles.push(filePath);
    }

    return chapterFiles;
  }

  /**
   * 生成章节 Markdown（使用真实章节标题）
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
   * 生成索引文件
   */
  private async generateIndexFile(
    book: ParsedBook,
    bookFolderPath: string,
    chapterFiles: string[],
    options: ConversionOptions
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

    await this.app.vault.create(filePath, content);
    return filePath;
  }

  /**
   * 生成单文件（合并所有章节）
   */
  private async generateSingleFile(
    book: ParsedBook,
    bookFolderPath: string,
    options: ConversionOptions
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
    const chaptersContent = book.chapters.map((ch, i) => {
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

    await this.app.vault.create(filePath, content);
    return filePath;
  }

  /**
   * 确保文件夹存在
   */
  private async ensureFolder(folderPath: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      await this.app.vault.createFolder(folderPath);
    }
  }

  /**
   * 格式化字数显示
   */
  private formatWordCount(count: number): string {
    if (count >= 10000) {
      return `${(count / 10000).toFixed(1)} 万字`;
    }
    return `${count} 字`;
  }

  /**
   * 生成 slug（用于锚点链接）
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^\w\u4e00-\u9fa5-]/g, '');
  }
}
