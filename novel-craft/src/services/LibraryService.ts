import { App, TFile, TFolder, normalizePath } from 'obsidian';
import {
  BookEntry,
  LibraryStats,
  DEFAULT_EPUB_CONVERSION_SETTINGS
} from '../types';
import { DATABASE_FILES } from '../types/database';
import { parseFrontmatter } from '../utils/FrontmatterUtils';

/**
 * LibraryService - 书库管理服务
 * 
 * 功能：
 * - 管理书籍数据的存储和读取
 * - 生成和更新书籍管理文档
 * - 生成和更新书库总览文档
 * - 支持从新的数据库结构（_book_meta.md）读取数据
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 13.1, 13.2, 13.3, 13.4, 13.5
 */
export class LibraryService {
  private app: App;
  private outputPath: string;

  /** 书库数据文件名 */
  private static readonly LIBRARY_DATA_FILE = '.library-data.json';
  /** 书库总览文件名 */
  private static readonly LIBRARY_INDEX_FILE = '00-书库总览.md';

  constructor(app: App, outputPath?: string) {
    this.app = app;
    this.outputPath = outputPath || DEFAULT_EPUB_CONVERSION_SETTINGS.outputPath;
  }

  /**
   * 设置输出路径
   */
  setOutputPath(path: string): void {
    this.outputPath = path;
  }

  /**
   * 获取书库统计信息
   * Requirements: 4.2
   */
  async getStats(): Promise<LibraryStats> {
    const books = await this.getAllBooks();
    
    return {
      totalBooks: books.length,
      finishedBooks: books.filter(b => b.readingStatus === 'finished').length,
      readingBooks: books.filter(b => b.readingStatus === 'reading').length,
      unreadBooks: books.filter(b => b.readingStatus === 'unread').length,
      totalWords: books.reduce((sum, b) => sum + b.totalWords, 0)
    };
  }

  /**
   * 获取所有书籍
   * 优先从新的数据库结构（_book_meta.md）读取，同时保持向后兼容
   * 如果都没有，则从管理文件读取
   * Requirements: 3.1, 4.1, 13.1, 13.5
   */
  async getAllBooks(): Promise<BookEntry[]> {
    const books: BookEntry[] = [];
    const seenTitles = new Set<string>();
    const seenPaths = new Set<string>();

    // 1. 首先扫描所有书籍文件夹
    const folder = this.app.vault.getAbstractFileByPath(this.outputPath);
    if (folder instanceof TFolder) {
      for (const child of folder.children) {
        if (!(child instanceof TFolder)) {
          continue;
        }

        // 跳过隐藏文件夹
        if (child.name.startsWith('.') || child.name.startsWith('_')) {
          continue;
        }

        let bookEntry: BookEntry | null = null;

        // 1.1 尝试从 _book_meta.md 读取
        const bookMetaPath = normalizePath(`${child.path}/${DATABASE_FILES.BOOK_META}`);
        const bookMetaExists = await this.app.vault.adapter.exists(bookMetaPath);

        if (bookMetaExists) {
          try {
            bookEntry = await this.readBookFromDatabaseMeta(child.path);
          } catch {
            // 忽略读取错误
          }
        }

        // 1.2 如果没有 _book_meta.md，尝试从管理文件读取
        if (!bookEntry) {
          bookEntry = await this.readBookFromManagerFile(child);
        }

        if (bookEntry && !seenTitles.has(bookEntry.title)) {
          books.push(bookEntry);
          seenTitles.add(bookEntry.title);
          seenPaths.add(child.path);
        }
      }
    }

    // 2. 然后从旧的 JSON 文件读取数据（向后兼容）
    try {
      const dataPath = normalizePath(`${this.outputPath}/${LibraryService.LIBRARY_DATA_FILE}`);
      const exists = await this.app.vault.adapter.exists(dataPath);
      if (exists) {
        const content = await this.app.vault.adapter.read(dataPath);
        const data = JSON.parse(content);
        const legacyBooks = data.books || [];
        
        // 只添加不在新数据库中的书籍
        for (const book of legacyBooks) {
          if (!seenTitles.has(book.title) && !seenPaths.has(book.folderPath)) {
            books.push(book);
            seenTitles.add(book.title);
          }
        }
      }
    } catch {
      // 忽略读取错误
    }

    return books;
  }

  /**
   * 从管理文件读取书籍信息
   */
  private async readBookFromManagerFile(folder: TFolder): Promise<BookEntry | null> {
    // 查找管理文件（00-xxx-管理.md）
    const managerFile = folder.children.find(f => 
      f instanceof TFile && 
      f.name.startsWith('00-') && 
      f.name.endsWith('-管理.md')
    );

    if (!(managerFile instanceof TFile)) {
      // 如果没有管理文件，检查是否有章节文件
      const chapterFiles = folder.children.filter(f => 
        f instanceof TFile && 
        f.extension === 'md' && 
        /^\d+-/.test(f.name) && 
        !f.name.startsWith('00-')
      );

      if (chapterFiles.length > 0) {
        // 有章节文件但没有管理文件，创建基本信息
        return {
          title: folder.name,
          author: '未知作者',
          folderPath: folder.path,
          totalChapters: chapterFiles.length,
          currentChapter: 0,
          readingStatus: 'unread',
          convertedAt: new Date().toISOString().split('T')[0],
          totalWords: 0
        };
      }
      return null;
    }

    try {
      const content = await this.app.vault.read(managerFile);
      const parsed = parseFrontmatter(content);
      
      if (!parsed.hasFrontmatter) {
        return null;
      }

      const data = parsed.data as Record<string, unknown>;
      
      return {
        title: String(data.book || folder.name),
        author: String(data.author || '未知作者'),
        folderPath: folder.path,
        totalChapters: Number(data.totalChapters) || 0,
        currentChapter: Number(data.currentChapter) || 0,
        readingStatus: (data.readingStatus as BookEntry['readingStatus']) || 'unread',
        convertedAt: String(data.convertedAt || new Date().toISOString().split('T')[0]),
        totalWords: Number(data.totalWords) || 0,
        lastReadAt: data.lastReadAt ? String(data.lastReadAt) : undefined,
      };
    } catch {
      return null;
    }
  }

  /**
   * 从 _book_meta.md 读取书籍信息
   * Requirements: 13.5
   */
  private async readBookFromDatabaseMeta(bookFolderPath: string): Promise<BookEntry | null> {
    const bookMetaPath = normalizePath(`${bookFolderPath}/${DATABASE_FILES.BOOK_META}`);
    
    try {
      const content = await this.app.vault.adapter.read(bookMetaPath);
      const parsed = parseFrontmatter(content);
      
      if (!parsed.hasFrontmatter) {
        return null;
      }

      const data = parsed.data as Record<string, unknown>;
      
      return {
        title: String(data.title || ''),
        author: String(data.author || ''),
        folderPath: bookFolderPath,
        totalChapters: Number(data.total_chapters) || 0,
        currentChapter: Number(data.current_chapter) || 0,
        readingStatus: (data.reading_status as BookEntry['readingStatus']) || 'unread',
        convertedAt: String(data.converted_at || new Date().toISOString().split('T')[0]),
        totalWords: Number(data.total_words) || 0,
        lastReadAt: data.last_read_at ? String(data.last_read_at) : undefined,
      };
    } catch {
      return null;
    }
  }


  /**
   * 添加书籍到书库
   * Requirements: 3.1, 4.1
   */
  async addBook(book: BookEntry): Promise<void> {
    const books = await this.getAllBooks();
    
    // 检查是否已存在
    const existingIndex = books.findIndex(b => b.title === book.title);
    if (existingIndex >= 0) {
      // 更新已存在的书籍
      books[existingIndex] = book;
    } else {
      // 添加新书籍
      books.push(book);
    }
    
    await this.saveBooks(books);
  }

  /**
   * 更新书籍信息
   * 同时更新：1. JSON 文件 2. _book_meta.md 3. 管理文件 frontmatter
   * Requirements: 3.1, 13.5
   */
  async updateBook(title: string, updates: Partial<BookEntry>): Promise<void> {
    // 1. 更新旧的 JSON 文件（向后兼容）
    const books = await this.getAllBooks();
    const index = books.findIndex(b => b.title === title);
    
    if (index >= 0) {
      books[index] = { ...books[index], ...updates };
      await this.saveBooks(books);
    }

    // 2. 更新新的数据库结构（_book_meta.md）
    const book = books.find(b => b.title === title);
    if (book?.folderPath) {
      const bookMetaPath = normalizePath(`${book.folderPath}/${DATABASE_FILES.BOOK_META}`);
      const exists = await this.app.vault.adapter.exists(bookMetaPath);
      
      if (exists) {
        try {
          await this.updateBookDatabaseMeta(book.folderPath, updates);
        } catch {
          // 忽略更新错误
        }
      }

      // 3. 更新管理文件的 frontmatter
      try {
        await this.updateManagerFileFrontmatter(book.folderPath, title, updates);
      } catch {
        // 忽略更新错误
      }
    }
  }

  /**
   * 更新管理文件的 frontmatter
   */
  private async updateManagerFileFrontmatter(
    bookFolderPath: string, 
    bookTitle: string, 
    updates: Partial<BookEntry>
  ): Promise<void> {
    const sanitizedTitle = this.sanitizeFilename(bookTitle);
    const managerPath = normalizePath(`${bookFolderPath}/00-${sanitizedTitle}-管理.md`);
    
    const file = this.app.vault.getAbstractFileByPath(managerPath);
    if (!(file instanceof TFile)) {
      return;
    }

    try {
      const content = await this.app.vault.read(file);
      const parsed = parseFrontmatter(content);
      
      if (!parsed.hasFrontmatter) {
        return;
      }

      // 构建更新数据（不要手动添加引号，formatYamlValue 会自动处理）
      const updateData: Record<string, unknown> = {};
      
      if (updates.readingStatus !== undefined) updateData.readingStatus = updates.readingStatus;
      if (updates.currentChapter !== undefined) updateData.currentChapter = updates.currentChapter;
      if (updates.lastReadAt !== undefined) updateData.lastReadAt = updates.lastReadAt;
      if (updates.totalChapters !== undefined) updateData.totalChapters = updates.totalChapters;
      if (updates.totalWords !== undefined) updateData.totalWords = updates.totalWords;

      // 更新 Frontmatter
      const { updateFrontmatter } = await import('../utils/FrontmatterUtils');
      const newContent = updateFrontmatter(content, updateData);
      await this.app.vault.modify(file, newContent);
    } catch {
      // 忽略更新错误
    }
  }

  /**
   * 更新 _book_meta.md 中的书籍信息
   * Requirements: 13.5
   */
  private async updateBookDatabaseMeta(bookFolderPath: string, updates: Partial<BookEntry>): Promise<void> {
    const bookMetaPath = normalizePath(`${bookFolderPath}/${DATABASE_FILES.BOOK_META}`);
    
    try {
      const content = await this.app.vault.adapter.read(bookMetaPath);
      const parsed = parseFrontmatter(content);
      
      if (!parsed.hasFrontmatter) {
        return;
      }

      // 构建更新数据（转换为 snake_case）
      const updateData: Record<string, unknown> = {};
      
      if (updates.readingStatus !== undefined) updateData.reading_status = updates.readingStatus;
      if (updates.currentChapter !== undefined) updateData.current_chapter = updates.currentChapter;
      if (updates.lastReadAt !== undefined) updateData.last_read_at = updates.lastReadAt;
      if (updates.totalChapters !== undefined) updateData.total_chapters = updates.totalChapters;
      if (updates.totalWords !== undefined) updateData.total_words = updates.totalWords;
      
      // 始终更新 updated_at
      updateData.updated_at = new Date().toISOString();

      // 更新 Frontmatter
      const { updateFrontmatter } = await import('../utils/FrontmatterUtils');
      const newContent = updateFrontmatter(content, updateData);
      await this.app.vault.adapter.write(bookMetaPath, newContent);
    } catch {
      // 忽略更新错误
    }
  }

  /**
   * 获取单本书籍信息
   */
  async getBook(title: string): Promise<BookEntry | null> {
    const books = await this.getAllBooks();
    return books.find(b => b.title === title) || null;
  }

  /**
   * 扫描并导入现有书籍文件夹
   * 用于导入之前手动转换或在书库功能实现前转换的书籍
   * 
   * @returns 导入的书籍数量
   */
  async scanAndImportExistingBooks(): Promise<number> {
    const folder = this.app.vault.getAbstractFileByPath(this.outputPath);
    if (!(folder instanceof TFolder)) {
      return 0;
    }

    const existingBooks = await this.getAllBooks();
    const existingTitles = new Set(existingBooks.map(b => b.title));
    let importedCount = 0;

    for (const child of folder.children) {
      if (!(child instanceof TFolder)) {
        continue;
      }

      // 跳过已存在的书籍
      const bookTitle = child.name;
      if (existingTitles.has(bookTitle)) {
        continue;
      }

      // 检查是否有管理文件
      const managerFileName = `00-${bookTitle}-管理.md`;
      let hasManagerFile = false;
      let chapterCount = 0;
      let totalWords = 0;
      let author = '未知作者';

      for (const file of child.children) {
        if (!(file instanceof TFile)) {
          continue;
        }

        if (file.name === managerFileName) {
          hasManagerFile = true;
          // 尝试从管理文件中读取元数据
          try {
            const content = await this.app.vault.read(file);
            const authorMatch = content.match(/author:\s*"([^"]+)"/);
            if (authorMatch) {
              author = authorMatch[1];
            }
            const chaptersMatch = content.match(/totalChapters:\s*(\d+)/);
            if (chaptersMatch) {
              chapterCount = parseInt(chaptersMatch[1], 10);
            }
            const wordsMatch = content.match(/totalWords:\s*(\d+)/);
            if (wordsMatch) {
              totalWords = parseInt(wordsMatch[1], 10);
            }
          } catch {
            // 忽略读取错误
          }
        } else if (file.extension === 'md' && /^\d+-/.test(file.name) && !file.name.startsWith('00-')) {
          // 计算章节文件数量（排除管理文件）
          chapterCount++;
        }
      }

      // 如果有管理文件或有章节文件，则导入
      if (hasManagerFile || chapterCount > 0) {
        const bookEntry: BookEntry = {
          title: bookTitle,
          author,
          folderPath: child.path,
          totalChapters: chapterCount,
          currentChapter: 0,
          readingStatus: 'unread',
          convertedAt: new Date().toISOString().split('T')[0],
          totalWords
        };

        await this.addBook(bookEntry);
        importedCount++;
      }
    }

    // 更新书库总览
    if (importedCount > 0) {
      await this.updateLibraryIndex();
    }

    return importedCount;
  }

  /**
   * 保存书籍数据到 JSON 文件
   */
  private async saveBooks(books: BookEntry[]): Promise<void> {
    await this.ensureFolder(this.outputPath);
    
    const dataPath = normalizePath(`${this.outputPath}/${LibraryService.LIBRARY_DATA_FILE}`);
    const content = JSON.stringify({ books, lastUpdated: new Date().toISOString() }, null, 2);
    
    // 直接使用 adapter API 写入文件，绕过 Obsidian 的文件索引缓存问题
    // adapter.write 会自动处理文件存在与否的情况
    await this.app.vault.adapter.write(dataPath, content);
  }

  /**
   * 生成/更新书库总览文档
   * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6
   */
  async updateLibraryIndex(): Promise<void> {
    const books = await this.getAllBooks();
    const stats = await this.getStats();
    const now = new Date().toISOString().split('T')[0];

    const content = this.generateLibraryIndexMarkdown(books, stats, now);
    
    const indexPath = normalizePath(`${this.outputPath}/${LibraryService.LIBRARY_INDEX_FILE}`);
    const file = this.app.vault.getAbstractFileByPath(indexPath);
    
    if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
    } else {
      await this.ensureFolder(this.outputPath);
      await this.app.vault.create(indexPath, content);
    }
  }

  /**
   * 生成书库总览 Markdown 内容
   * Requirements: 4.2, 4.3, 4.4, 4.5
   */
  private generateLibraryIndexMarkdown(
    books: BookEntry[],
    stats: LibraryStats,
    lastUpdated: string
  ): string {
    // Frontmatter
    const frontmatter = [
      '---',
      'type: library-index',
      `lastUpdated: "${lastUpdated}"`,
      '---'
    ].join('\n');

    // 统计信息
    const statsSection = `## 统计

| 指标 | 数值 |
|-----|-----|
| 总书籍数 | ${stats.totalBooks} 本 |
| 已读完 | ${stats.finishedBooks} 本 |
| 阅读中 | ${stats.readingBooks} 本 |
| 未开始 | ${stats.unreadBooks} 本 |
| 总字数 | ${this.formatWordCount(stats.totalWords)} |`;

    // 正在阅读区域
    const readingBooks = books
      .filter(b => b.readingStatus === 'reading')
      .sort((a, b) => (b.lastReadAt || '').localeCompare(a.lastReadAt || ''));
    
    const readingSection = this.generateReadingSection(readingBooks);

    // 最近添加区域
    const recentBooks = [...books]
      .sort((a, b) => b.convertedAt.localeCompare(a.convertedAt))
      .slice(0, 5);
    
    const recentSection = this.generateRecentSection(recentBooks);

    // 全部书籍（按状态分组）
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
   * Requirements: 4.3
   */
  private generateReadingSection(readingBooks: BookEntry[]): string {
    if (readingBooks.length === 0) {
      return `## 📖 正在阅读

_暂无正在阅读的书籍_`;
    }

    const items = readingBooks.map(book => {
      const progress = Math.round((book.currentChapter / book.totalChapters) * 100);
      const managerFile = `${this.sanitizeFilename(book.title)}/00-${this.sanitizeFilename(book.title)}-管理`;
      const lastRead = book.lastReadAt 
        ? new Date(book.lastReadAt).toLocaleDateString('zh-CN')
        : '-';
      return `- [[${managerFile}|${book.title}]] - ${book.author} - 进度: ${book.currentChapter}/${book.totalChapters} (${progress}%) - 上次阅读: ${lastRead}`;
    }).join('\n');

    return `## 📖 正在阅读

${items}`;
  }

  /**
   * 生成"最近添加"区域
   * Requirements: 4.4
   */
  private generateRecentSection(recentBooks: BookEntry[]): string {
    if (recentBooks.length === 0) {
      return `## 🆕 最近添加

_暂无书籍_`;
    }

    const items = recentBooks.map(book => {
      const managerFile = `${this.sanitizeFilename(book.title)}/00-${this.sanitizeFilename(book.title)}-管理`;
      return `- [[${managerFile}|${book.title}]] - ${book.author} - ${book.totalChapters} 章 - 添加于 ${book.convertedAt}`;
    }).join('\n');

    return `## 🆕 最近添加

${items}`;
  }

  /**
   * 生成"全部书籍"区域（按状态分组）
   * Requirements: 4.5
   */
  private generateAllBooksSection(books: BookEntry[]): string {
    const reading = books.filter(b => b.readingStatus === 'reading');
    const finished = books.filter(b => b.readingStatus === 'finished');
    const unread = books.filter(b => b.readingStatus === 'unread');

    const formatBookList = (bookList: BookEntry[], showProgress: boolean = false): string => {
      if (bookList.length === 0) {
        return '_暂无书籍_';
      }
      return bookList.map(book => {
        const managerFile = `${this.sanitizeFilename(book.title)}/00-${this.sanitizeFilename(book.title)}-管理`;
        if (showProgress) {
          return `- [[${managerFile}|${book.title}]] - ${book.author} - 进度: ${book.currentChapter}/${book.totalChapters}`;
        }
        return `- [[${managerFile}|${book.title}]] - ${book.author}`;
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

  /**
   * 生成/更新书籍管理文档
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6
   */
  async updateBookManager(bookTitle: string): Promise<void> {
    const book = await this.getBook(bookTitle);
    if (!book) {
      throw new Error(`书籍不存在: ${bookTitle}`);
    }

    const content = await this.generateBookManagerMarkdown(book);
    
    const sanitizedTitle = this.sanitizeFilename(bookTitle);
    const managerPath = normalizePath(
      `${this.outputPath}/${sanitizedTitle}/00-${sanitizedTitle}-管理.md`
    );
    
    const file = this.app.vault.getAbstractFileByPath(managerPath);
    if (file instanceof TFile) {
      await this.app.vault.modify(file, content);
    }
  }

  /**
   * 生成书籍管理文档 Markdown 内容
   * Requirements: 3.2, 3.3, 3.4, 3.5, 3.6
   */
  async generateBookManagerMarkdown(book: BookEntry): Promise<string> {
    const sanitizedTitle = this.sanitizeFilename(book.title);
    
    // 获取章节列表（从文件夹中读取）
    const chapters = await this.getChapterList(book.folderPath);
    
    // 计算进度百分比
    const progressPercent = book.totalChapters > 0 
      ? Math.round((book.currentChapter / book.totalChapters) * 100) 
      : 0;

    // 格式化上次阅读时间
    const lastReadDisplay = book.lastReadAt 
      ? new Date(book.lastReadAt).toLocaleString('zh-CN')
      : '-';

    // 阅读状态显示
    const statusDisplay = this.getStatusDisplay(book.readingStatus);

    // 生成章节目录
    const chapterList = this.generateChapterList(chapters, book.currentChapter);

    // 继续阅读链接 - 修复逻辑
    let continueReadingLink: string;
    if (book.currentChapter === 0 || book.readingStatus === 'unread') {
      // 未开始阅读，显示"开始阅读"
      if (chapters.length > 0) {
        continueReadingLink = `[[${chapters[0].filename}|开始阅读]]`;
      } else {
        continueReadingLink = '开始阅读';
      }
    } else if (book.readingStatus === 'finished') {
      // 已读完，显示"重新阅读"
      if (chapters.length > 0) {
        continueReadingLink = `[[${chapters[0].filename}|重新阅读]]`;
      } else {
        continueReadingLink = '重新阅读';
      }
    } else {
      // 阅读中，显示"继续阅读"
      continueReadingLink = this.getContinueReadingLink(chapters, book.currentChapter, sanitizedTitle);
    }

    // 检查是否有分析笔记 (Requirements: 3.5)
    const analysisLinks = await this.getAnalysisLinks(book.title);
    const analysisOverviewLink = await this.getAnalysisOverviewLink(book.title);
    const hasAnalysis = analysisLinks.length > 0;

    // Frontmatter
    const frontmatter = [
      '---',
      'type: book-manager',
      `book: "${book.title}"`,
      `author: "${book.author}"`,
      `totalChapters: ${book.totalChapters}`,
      `totalWords: ${book.totalWords}`,
      `convertedAt: "${book.convertedAt}"`,
      `currentChapter: ${book.currentChapter}`,
      `readingStatus: "${book.readingStatus}"`,
      `lastReadAt: "${book.lastReadAt || ''}"`,
      '---'
    ].join('\n');

    // 构建快捷操作部分
    const quickActions = ['### 快捷操作', '', `- 🔖 ${continueReadingLink}`];
    if (analysisOverviewLink) {
      quickActions.push(`- ${analysisOverviewLink}`);
    }

    // 构建分析笔记部分 (Requirements: 3.5)
    const analysisSection = hasAnalysis
      ? `## 分析笔记\n\n${analysisLinks}\n`
      : '';

    return `${frontmatter}

# 📖 ${book.title}

## 基本信息

| 属性 | 值 |
|-----|-----|
| 作者 | ${book.author} |
| 章节数 | ${book.totalChapters} 章 |
| 总字数 | ${this.formatWordCount(book.totalWords)} |
| 转换时间 | ${book.convertedAt} |

## 阅读进度

**状态**: ${statusDisplay}
**当前进度**: ${book.currentChapter} / ${book.totalChapters} 章 (${progressPercent}%)
**上次阅读**: ${lastReadDisplay}

${quickActions.join('\n')}

${analysisSection}## 章节目录

${chapterList}
`;
  }


  /**
   * 获取章节列表（从文件夹中读取）
   */
  private async getChapterList(folderPath: string): Promise<Array<{ index: number; title: string; filename: string }>> {
    const chapters: Array<{ index: number; title: string; filename: string }> = [];
    
    try {
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!(folder instanceof TFolder)) {
        return chapters;
      }

      for (const file of folder.children) {
        if (file instanceof TFile && file.extension === 'md') {
          // 跳过管理文件
          if (file.name.includes('-管理')) {
            continue;
          }
          
          // 解析文件名: "01-章节标题.md"
          const match = file.name.match(/^(\d+)-(.+)\.md$/);
          if (match) {
            const index = parseInt(match[1], 10);
            const title = match[2];
            chapters.push({
              index,
              title,
              filename: file.name.replace('.md', '')
            });
          }
        }
      }

      // 按章节序号排序
      chapters.sort((a, b) => a.index - b.index);
    } catch {
      // 忽略错误
    }

    return chapters;
  }

  /**
   * 生成章节目录列表
   * Requirements: 3.6
   */
  private generateChapterList(
    chapters: Array<{ index: number; title: string; filename: string }>,
    currentChapter: number
  ): string {
    if (chapters.length === 0) {
      return '_暂无章节_';
    }

    return chapters.map(ch => {
      let marker = '';
      if (ch.index < currentChapter) {
        marker = ' ✅'; // 已读
      } else if (ch.index === currentChapter) {
        marker = ' 📖 ← 当前'; // 当前阅读
      }
      return `${ch.index}. [[${ch.filename}|${ch.title}]]${marker}`;
    }).join('\n');
  }

  /**
   * 获取继续阅读链接
   * Requirements: 3.4
   */
  private getContinueReadingLink(
    chapters: Array<{ index: number; title: string; filename: string }>,
    currentChapter: number,
    _sanitizedTitle: string
  ): string {
    // 如果当前章节为 0，返回第一章
    if (currentChapter === 0 && chapters.length > 0) {
      return `[[${chapters[0].filename}|开始阅读]]`;
    }

    // 查找当前章节
    const chapter = chapters.find(ch => ch.index === currentChapter);
    if (chapter) {
      return `[[${chapter.filename}|继续阅读 第${currentChapter}章]]`;
    }
    
    // 如果当前章节超出范围，返回最后一章
    if (currentChapter > 0 && chapters.length > 0) {
      const lastChapter = chapters[chapters.length - 1];
      return `[[${lastChapter.filename}|继续阅读]]`;
    }
    
    // 如果找不到任何章节，返回第一章
    if (chapters.length > 0) {
      return `[[${chapters[0].filename}|开始阅读]]`;
    }
    
    return '开始阅读';
  }

  /**
   * 获取分析笔记链接
   * Requirements: 3.5
   * 
   * 检测是否存在分析笔记，并返回格式化的链接列表
   * 分析笔记存储在 NovelCraft/notes/{书名}/ 目录下
   */
  private async getAnalysisLinks(bookTitle: string): Promise<string> {
    // 清理书名用于路径
    const sanitizedTitle = this.sanitizeFilename(bookTitle);
    
    // 尝试查找分析笔记文件夹
    const analysisPath = normalizePath(`NovelCraft/notes/${sanitizedTitle}`);
    const folder = this.app.vault.getAbstractFileByPath(analysisPath);
    
    if (!(folder instanceof TFolder)) {
      return '';
    }

    const links: string[] = [];
    const noteFiles: Array<{ name: string; order: number }> = [];
    
    for (const file of folder.children) {
      if (file instanceof TFile && file.extension === 'md') {
        // 跳过元数据文件和断点文件
        if (file.name.startsWith('.') || file.name.includes('checkpoint')) {
          continue;
        }
        
        // 解析文件名获取排序顺序（如 "00-概览.md" -> order: 0）
        const match = file.name.match(/^(\d+)-(.+)\.md$/);
        const order = match ? parseInt(match[1], 10) : 999;
        
        noteFiles.push({
          name: file.name.replace('.md', ''),
          order
        });
      }
    }
    
    // 按顺序排序
    noteFiles.sort((a, b) => a.order - b.order);
    
    // 生成链接列表
    for (const noteFile of noteFiles) {
      links.push(`- [[${analysisPath}/${noteFile.name}|${noteFile.name}]]`);
    }

    return links.join('\n');
  }

  /**
   * 检查是否存在分析笔记
   * Requirements: 3.5
   */
  async hasAnalysisNotes(bookTitle: string): Promise<boolean> {
    const sanitizedTitle = this.sanitizeFilename(bookTitle);
    const analysisPath = normalizePath(`NovelCraft/notes/${sanitizedTitle}`);
    const folder = this.app.vault.getAbstractFileByPath(analysisPath);
    
    if (!(folder instanceof TFolder)) {
      return false;
    }
    
    // 检查是否有任何 .md 文件（排除元数据文件）
    for (const file of folder.children) {
      if (file instanceof TFile && file.extension === 'md' && !file.name.startsWith('.')) {
        return true;
      }
    }
    
    return false;
  }

  /**
   * 获取分析笔记概览链接
   * Requirements: 3.5
   * 
   * 返回指向分析概览的快捷链接
   */
  private async getAnalysisOverviewLink(bookTitle: string): Promise<string> {
    const analysisPath = normalizePath(`NovelCraft/notes/${this.sanitizeFilename(bookTitle)}`);
    const overviewPath = `${analysisPath}/00-概览`;
    
    // 检查概览文件是否存在
    const overviewFile = this.app.vault.getAbstractFileByPath(`${overviewPath}.md`);
    if (overviewFile instanceof TFile) {
      return `[[${overviewPath}|📊 查看分析]]`;
    }
    
    // 如果没有概览文件，检查是否有任何分析笔记
    const folder = this.app.vault.getAbstractFileByPath(analysisPath);
    if (folder instanceof TFolder) {
      for (const file of folder.children) {
        if (file instanceof TFile && file.extension === 'md' && !file.name.startsWith('.')) {
          return `[[${analysisPath}/${file.name.replace('.md', '')}|📊 查看分析]]`;
        }
      }
    }
    
    return '';
  }

  /**
   * 获取阅读状态显示文本
   */
  private getStatusDisplay(status: 'unread' | 'reading' | 'finished'): string {
    switch (status) {
      case 'finished':
        return '✅ 已读完';
      case 'reading':
        return '📖 阅读中';
      case 'unread':
      default:
        return '📚 未开始';
    }
  }

  /**
   * 清理文件名中的非法字符
   */
  private sanitizeFilename(name: string): string {
    if (!name) {
      return 'untitled';
    }
    
    let sanitized = name.replace(/[\/\\:*?"<>|]/g, '');
    sanitized = sanitized.trim();
    
    if (!sanitized) {
      return 'untitled';
    }
    
    return sanitized;
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
   * 确保文件夹存在
   */
  private async ensureFolder(folderPath: string): Promise<void> {
    const normalizedPath = normalizePath(folderPath);
    const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (!folder) {
      try {
        await this.app.vault.createFolder(normalizedPath);
      } catch (error) {
        // 忽略 "File already exists" 错误（可能是竞态条件）
        if (error instanceof Error && !error.message.includes('already exists')) {
          throw error;
        }
      }
    }
  }
}
