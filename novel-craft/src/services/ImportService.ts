import { Vault, TFile } from 'obsidian';
import { EpubParser } from '../core/EpubParser';
import { MarkdownConverter } from '../core/MarkdownConverter';
import { FileOrganizer } from './FileOrganizer';
import { TimelineDatabaseService } from './DatabaseService';
import { 
  ImportTask, 
  ImportProgress, 
  ImportStatus, 
  ConversionResult, 
  ImportOptions,
  SupportedFormat,
  BookInfo
} from '../types/import';
import { Chapter, BookMetadata } from '../types';
import { ImportError } from '../types/errors';
import { generateId } from '../utils/file-utils';

/**
 * 导入服务
 * 负责协调整个书籍导入流程
 * 
 * 主要功能：
 * - 解析各种格式的电子书文件
 * - 转换为Markdown格式
 * - 组织文件结构
 * - 存储到数据库
 * - 提供进度反馈
 */
export class ImportService {
  private epubParser: EpubParser;
  private markdownConverter: MarkdownConverter;
  private fileOrganizer: FileOrganizer;
  private activeImports = new Map<string, ImportTask>();

  constructor(
    private vault: Vault,
    private databaseService: TimelineDatabaseService
  ) {
    this.epubParser = new EpubParser();
    this.markdownConverter = new MarkdownConverter();
    this.fileOrganizer = new FileOrganizer(vault);
  }

  /**
   * 导入书籍文件
   * @param filePath 文件路径
   * @param options 导入选项
   * @returns 导入任务ID
   */
  async importBook(filePath: string, options: ImportOptions): Promise<string> {
    const taskId = generateId();
    const format = this.detectFileFormat(filePath);

    const task: ImportTask = {
      id: taskId,
      sourceFile: filePath,
      format,
      options,
      status: ImportStatus.PENDING,
      progress: {
        status: ImportStatus.PENDING,
        progress: 0,
        message: '准备导入...'
      },
      startTime: new Date()
    };

    this.activeImports.set(taskId, task);

    // 异步执行导入
    this.executeImport(task).catch(error => {
      console.error(`ImportService: 导入任务 ${taskId} 失败:`, error);
      this.updateTaskStatus(taskId, ImportStatus.FAILED, error.message);
    });

    return taskId;
  }

  /**
   * 获取导入任务状态
   * @param taskId 任务ID
   * @returns 任务信息
   */
  getImportTask(taskId: string): ImportTask | undefined {
    return this.activeImports.get(taskId);
  }

  /**
   * 获取所有活跃的导入任务
   * @returns 任务列表
   */
  getActiveImports(): ImportTask[] {
    return Array.from(this.activeImports.values());
  }

  /**
   * 获取导入任务进度
   * @param taskId 任务ID
   * @returns 进度信息
   */
  getImportProgress(taskId: string): ImportProgress | undefined {
    const task = this.activeImports.get(taskId);
    return task?.progress;
  }

  /**
   * 获取所有活跃任务的进度
   * @returns 进度信息映射
   */
  getAllImportProgress(): Map<string, ImportProgress> {
    const progressMap = new Map<string, ImportProgress>();
    for (const [taskId, task] of this.activeImports) {
      progressMap.set(taskId, task.progress);
    }
    return progressMap;
  }

  /**
   * 取消导入任务
   * @param taskId 任务ID
   */
  cancelImport(taskId: string): void {
    const task = this.activeImports.get(taskId);
    if (task && task.status !== ImportStatus.COMPLETED && task.status !== ImportStatus.FAILED) {
      this.updateTaskStatus(taskId, ImportStatus.FAILED, '用户取消导入');
    }
  }

  /**
   * 执行导入流程
   * @param task 导入任务
   */
  private async executeImport(task: ImportTask): Promise<void> {
    const startTime = Date.now();

    try {
      // 1. 解析文件
      this.updateTaskProgress(task.id, ImportStatus.PARSING, 10, '正在解析文件结构...');
      const parsedBook = await this.parseFile(task.sourceFile, task.format, task.options);

      // 2. 转换为Markdown
      this.updateTaskProgress(task.id, ImportStatus.CONVERTING, 30, '正在转换为Markdown格式...');
      const convertedFiles = this.markdownConverter.convertAllChapters(
        parsedBook.chapters,
        parsedBook.metadata
      );

      // 验证转换结果
      if (!this.markdownConverter.validateConversionResults(convertedFiles)) {
        throw new ImportError('转换结果验证失败，生成的文件不完整', task.sourceFile);
      }

      // 3. 创建目录结构
      this.updateTaskProgress(task.id, ImportStatus.GENERATING, 50, '正在创建书籍目录结构...');
      const bookInfo = this.createBookInfo(parsedBook, task.sourceFile);
      const bookPath = await this.fileOrganizer.createBookDirectory(bookInfo, task.options.targetPath);

      // 4. 保存文件
      this.updateTaskProgress(task.id, ImportStatus.GENERATING, 70, '正在保存章节文件和元数据...');
      const savedFiles = await this.fileOrganizer.saveFiles(bookPath, convertedFiles);

      // 保存元数据文件
      const metadataPath = await this.fileOrganizer.saveMetadataFile(bookInfo, bookPath);
      savedFiles.push(metadataPath);

      // 5. 存储到数据库
      this.updateTaskProgress(task.id, ImportStatus.GENERATING, 90, '正在保存到数据库...');
      await this.saveToDatabase(bookInfo, parsedBook.chapters, bookPath);

      // 6. 完成
      const conversionStats = this.markdownConverter.generateConversionStats(
        parsedBook.chapters,
        convertedFiles,
        startTime
      );

      const result: ConversionResult = {
        success: true,
        generatedFiles: savedFiles,
        bookInfo,
        stats: conversionStats,
        warnings: []
      };

      task.result = result;
      task.endTime = new Date();
      this.updateTaskStatus(task.id, ImportStatus.COMPLETED, `导入完成！生成了 ${savedFiles.length} 个文件`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`ImportService: 导入任务 ${task.id} 失败:`, error);
      this.updateTaskStatus(task.id, ImportStatus.FAILED, `导入失败: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * 解析文件
   * @param filePath 文件路径
   * @param format 文件格式
   * @param options 导入选项
   * @returns 解析结果
   */
  private async parseFile(filePath: string, format: SupportedFormat, options: ImportOptions): Promise<{
    metadata: BookMetadata;
    chapters: Chapter[];
    totalWordCount: number;
  }> {
    switch (format) {
      case SupportedFormat.EPUB:
        return await this.parseEpubFile(filePath);
      
      case SupportedFormat.TXT:
        return await this.parseTxtFile(filePath, options);
      
      default:
        throw new ImportError(`不支持的文件格式: ${format}`, filePath);
    }
  }

  /**
   * 解析EPUB文件
   * @param filePath 文件路径
   * @returns 解析结果
   */
  private async parseEpubFile(filePath: string): Promise<{
    metadata: BookMetadata;
    chapters: Chapter[];
    totalWordCount: number;
  }> {
    try {
      // 读取文件数据
      const fileData = await this.readFileAsArrayBuffer(filePath);
      
      // 解析EPUB
      const parsedBook = await this.epubParser.parse(fileData);
      
      // 验证解析结果
      if (!parsedBook.chapters || parsedBook.chapters.length === 0) {
        throw new ImportError('EPUB文件解析成功但未找到任何章节内容', filePath);
      }

      if (!parsedBook.metadata.title || !parsedBook.metadata.author) {
        console.warn(`ImportService: EPUB文件 ${filePath} 缺少标题或作者信息，使用默认值`);
      }
      
      return {
        metadata: parsedBook.metadata,
        chapters: parsedBook.chapters,
        totalWordCount: parsedBook.totalWordCount
      };
    } catch (error) {
      if (error instanceof ImportError) {
        throw error;
      }
      
      // 提供更详细的错误信息
      let errorMessage = '未知错误';
      if (error instanceof Error) {
        if (error.message.includes('Invalid or corrupted ZIP file')) {
          errorMessage = 'EPUB文件损坏或格式不正确';
        } else if (error.message.includes('Cannot read')) {
          errorMessage = '无法读取EPUB文件，请检查文件是否存在且有读取权限';
        } else {
          errorMessage = error.message;
        }
      }
      
      throw new ImportError(
        `EPUB文件解析失败: ${errorMessage}`,
        filePath
      );
    }
  }

  /**
   * 解析TXT文件
   * @param filePath 文件路径
   * @param options 导入选项
   * @returns 解析结果
   */
  private async parseTxtFile(filePath: string, options: ImportOptions): Promise<{
    metadata: BookMetadata;
    chapters: Chapter[];
    totalWordCount: number;
  }> {
    try {
      // 读取文件内容
      const content = await this.readFileAsText(filePath, options.encoding || 'utf-8');
      
      // 提取书名（从文件名）
      const fileName = filePath.split('/').pop() || '未知书籍';
      const title = fileName.replace(/\.[^/.]+$/, ''); // 移除扩展名

      const metadata: BookMetadata = {
        title,
        author: '未知作者',
        description: undefined,
        coverImage: undefined
      };

      // 分割章节
      const chapters = this.splitTextIntoChapters(content, options);
      const totalWordCount = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

      return { metadata, chapters, totalWordCount };
    } catch (error) {
      throw new ImportError(
        `TXT文件解析失败: ${error instanceof Error ? error.message : String(error)}`,
        filePath
      );
    }
  }

  /**
   * 将文本分割为章节
   * @param content 文本内容
   * @param options 导入选项
   * @returns 章节列表
   */
  private splitTextIntoChapters(content: string, options: ImportOptions): Chapter[] {
    const chapters: Chapter[] = [];
    
    if (options.autoDetectChapters && options.chapterTitlePattern) {
      // 使用正则表达式自动检测章节
      const chapterMatches = Array.from(content.matchAll(options.chapterTitlePattern));
      
      for (let i = 0; i < chapterMatches.length; i++) {
        const match = chapterMatches[i];
        const nextMatch = chapterMatches[i + 1];
        
        const chapterStart = match.index || 0;
        const chapterEnd = nextMatch ? (nextMatch.index || content.length) : content.length;
        
        const chapterContent = content.substring(chapterStart, chapterEnd).trim();
        const title = match[1] || `第${i + 1}章`;
        
        if (chapterContent.length > 0) {
          chapters.push({
            index: i,
            title,
            content: chapterContent,
            wordCount: this.countWords(chapterContent)
          });
        }
      }
    } else {
      // 按最大长度分割
      const maxLength = options.maxChapterLength || 10000;
      const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0);
      
      let currentChapter = '';
      let chapterIndex = 0;
      
      for (const paragraph of paragraphs) {
        if (currentChapter.length + paragraph.length > maxLength && currentChapter.length > 0) {
          // 创建新章节
          chapters.push({
            index: chapterIndex,
            title: `第${chapterIndex + 1}章`,
            content: currentChapter.trim(),
            wordCount: this.countWords(currentChapter)
          });
          
          chapterIndex++;
          currentChapter = paragraph;
        } else {
          currentChapter += (currentChapter ? '\n\n' : '') + paragraph;
        }
      }
      
      // 添加最后一章
      if (currentChapter.trim().length > 0) {
        chapters.push({
          index: chapterIndex,
          title: `第${chapterIndex + 1}章`,
          content: currentChapter.trim(),
          wordCount: this.countWords(currentChapter)
        });
      }
    }

    return chapters;
  }

  /**
   * 创建书籍信息对象
   * @param parsedBook 解析后的书籍
   * @param filePath 原始文件路径
   * @returns 书籍信息
   */
  private createBookInfo(parsedBook: { metadata: BookMetadata; chapters: Chapter[] }, filePath: string): BookInfo {
    return {
      id: generateId(),
      title: parsedBook.metadata.title,
      author: parsedBook.metadata.author,
      description: parsedBook.metadata.description,
      publishInfo: undefined,
      importTime: new Date(),
      filePath,
      coverImage: parsedBook.metadata.coverImage,
      totalWordCount: parsedBook.chapters.reduce((sum, ch) => sum + ch.wordCount, 0),
      chapterCount: parsedBook.chapters.length,
      timelineConfig: {
        tracks: [],
        pastEventArea: false
      }
    };
  }

  /**
   * 保存到数据库
   * @param bookInfo 书籍信息
   * @param chapters 章节列表
   * @param bookPath 书籍路径
   */
  private async saveToDatabase(bookInfo: BookInfo, chapters: Chapter[], bookPath: string): Promise<void> {
    try {
      // 保存书籍信息
      await this.databaseService.books.create({
        title: bookInfo.title,
        author: bookInfo.author,
        description: bookInfo.description,
        publish_info: bookInfo.publishInfo,
        import_time: bookInfo.importTime.getTime(),
        file_path: bookInfo.filePath,
        cover_image: bookInfo.coverImage,
        total_word_count: bookInfo.totalWordCount,
        chapter_count: bookInfo.chapterCount
      });

      // 保存章节信息（可选，根据需要）
      // 这里可以扩展保存章节详细信息到数据库
      
    } catch (error) {
      throw new ImportError(
        `保存到数据库失败: ${error instanceof Error ? error.message : String(error)}`,
        bookInfo.title
      );
    }
  }

  /**
   * 检测文件格式
   * @param filePath 文件路径
   * @returns 文件格式
   */
  private detectFileFormat(filePath: string): SupportedFormat {
    const extension = filePath.toLowerCase().split('.').pop();
    
    switch (extension) {
      case 'epub':
        return SupportedFormat.EPUB;
      case 'txt':
        return SupportedFormat.TXT;
      case 'docx':
        return SupportedFormat.DOCX;
      case 'pdf':
        return SupportedFormat.PDF;
      default:
        throw new ImportError(`不支持的文件格式: ${extension}`, filePath);
    }
  }

  /**
   * 读取文件为ArrayBuffer
   * @param filePath 文件路径
   * @returns ArrayBuffer数据
   */
  private async readFileAsArrayBuffer(filePath: string): Promise<ArrayBuffer> {
    try {
      // 从Vault中读取文件
      const file = this.vault.getAbstractFileByPath(filePath);
      if (!file || !(file instanceof TFile)) {
        throw new ImportError(`文件不存在: ${filePath}`, filePath);
      }
      
      // 读取二进制数据
      const arrayBuffer = await this.vault.readBinary(file);
      return arrayBuffer;
    } catch (error) {
      if (error instanceof ImportError) {
        throw error;
      }
      throw new ImportError(`读取文件失败: ${error instanceof Error ? error.message : '未知错误'}`, filePath);
    }
  }

  /**
   * 读取文件为文本
   * @param filePath 文件路径
   * @param encoding 编码格式
   * @returns 文本内容
   */
  private async readFileAsText(filePath: string, encoding: string): Promise<string> {
    try {
      // 从Vault中读取文件
      const file = this.vault.getAbstractFileByPath(filePath);
      if (!file || !(file instanceof TFile)) {
        throw new ImportError(`文件不存在: ${filePath}`, filePath);
      }
      
      // 读取文本数据
      const content = await this.vault.read(file);
      return content;
    } catch (error) {
      if (error instanceof ImportError) {
        throw error;
      }
      throw new ImportError(`读取文件失败: ${error instanceof Error ? error.message : '未知错误'}`, filePath);
    }
  }

  /**
   * 计算字数
   * @param text 文本内容
   * @returns 字数
   */
  private countWords(text: string): number {
    // 中文字符
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    // 英文单词
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }

  /**
   * 更新任务状态
   * @param taskId 任务ID
   * @param status 新状态
   * @param message 状态消息
   */
  private updateTaskStatus(taskId: string, status: ImportStatus, message: string): void {
    const task = this.activeImports.get(taskId);
    if (task) {
      task.status = status;
      task.progress.status = status;
      task.progress.message = message;
      
      if (status === ImportStatus.COMPLETED || status === ImportStatus.FAILED) {
        task.endTime = new Date();
        // 可以在这里添加清理逻辑，比如一段时间后移除已完成的任务
      }
    }
  }

  /**
   * 更新任务进度
   * @param taskId 任务ID
   * @param status 状态
   * @param progress 进度百分比
   * @param message 进度消息
   * @param currentChapter 当前处理的章节（可选）
   * @param totalChapters 总章节数（可选）
   */
  private updateTaskProgress(
    taskId: string, 
    status: ImportStatus, 
    progress: number, 
    message: string,
    currentChapter?: number,
    totalChapters?: number
  ): void {
    const task = this.activeImports.get(taskId);
    if (task) {
      task.status = status;
      task.progress = {
        status,
        progress,
        message,
        currentChapter,
        totalChapters
      };
      
      // 输出进度日志
      console.log(`ImportService [${taskId}]: ${progress}% - ${message}`);
    }
  }

  /**
   * 清理已完成的任务
   * @param maxAge 最大保留时间（毫秒）
   */
  cleanupCompletedTasks(maxAge: number = 24 * 60 * 60 * 1000): void {
    const now = Date.now();
    
    for (const [taskId, task] of this.activeImports) {
      if (
        (task.status === ImportStatus.COMPLETED || task.status === ImportStatus.FAILED) &&
        task.endTime &&
        (now - task.endTime.getTime()) > maxAge
      ) {
        this.activeImports.delete(taskId);
      }
    }
  }
}