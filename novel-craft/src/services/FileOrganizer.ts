import { TFile, TFolder, Vault } from 'obsidian';
import { Chapter } from '../types';
import { BookInfo, FileOrganizer as IFileOrganizer } from '../types/import';
import { ImportError } from '../types/errors';

/**
 * 文件组织器服务
 * 负责创建书籍目录结构和保存文件到Obsidian vault
 * 
 * 功能特性：
 * - 创建标准化的书籍目录结构
 * - 保存章节文件和元数据文件
 * - 处理文件名冲突和路径规范化
 * - 与Obsidian vault系统集成
 */
export class FileOrganizer implements IFileOrganizer {
  constructor(private vault: Vault) {}

  /**
   * 创建书籍目录结构
   * @param bookInfo 书籍信息
   * @param targetPath 目标路径（相对于vault根目录）
   * @returns 创建的书籍目录路径
   */
  async createBookDirectory(bookInfo: BookInfo, targetPath: string): Promise<string> {
    try {
      // 规范化目标路径
      const normalizedTargetPath = this.normalizePath(targetPath);
      
      // 生成书籍目录名
      const bookDirName = this.generateBookDirectoryName(bookInfo);
      const bookPath = this.joinPath(normalizedTargetPath, bookDirName);

      // 检查目录是否已存在
      const existingFolder = this.vault.getAbstractFileByPath(bookPath);
      if (existingFolder && this.isFolder(existingFolder)) {
        // 目录已存在，生成唯一名称
        const uniqueBookPath = await this.generateUniqueDirectoryName(bookPath);
        await this.ensureDirectoryExists(uniqueBookPath);
        return uniqueBookPath;
      }

      // 创建目录
      await this.ensureDirectoryExists(bookPath);
      return bookPath;
    } catch (error) {
      throw new ImportError(
        `创建书籍目录失败: ${error instanceof Error ? error.message : String(error)}`,
        bookInfo.title
      );
    }
  }

  /**
   * 保存章节文件
   * @param chapter 章节数据
   * @param bookPath 书籍目录路径
   * @param content Markdown内容
   * @returns 保存的文件路径
   */
  async saveChapterFile(chapter: Chapter, bookPath: string, content: string): Promise<string> {
    try {
      // 生成章节文件名
      const fileName = this.generateChapterFileName(chapter);
      const filePath = this.joinPath(bookPath, fileName);

      // 检查文件是否已存在
      const existingFile = this.vault.getAbstractFileByPath(filePath);
      if (existingFile && this.isFile(existingFile)) {
        // 文件已存在，询问用户是否覆盖或生成新名称
        const uniqueFilePath = await this.generateUniqueFileName(filePath);
        await this.vault.create(uniqueFilePath, content);
        return uniqueFilePath;
      }

      // 创建文件
      await this.vault.create(filePath, content);
      return filePath;
    } catch (error) {
      throw new ImportError(
        `保存章节文件失败: ${error instanceof Error ? error.message : String(error)}`,
        `第${chapter.index + 1}章 ${chapter.title}`
      );
    }
  }

  /**
   * 保存元数据文件
   * @param bookInfo 书籍信息
   * @param bookPath 书籍目录路径
   * @returns 保存的文件路径
   */
  async saveMetadataFile(bookInfo: BookInfo, bookPath: string): Promise<string> {
    try {
      const metadataPath = this.joinPath(bookPath, 'book.json');
      
      // 生成元数据内容
      const metadata = {
        id: bookInfo.id,
        title: bookInfo.title,
        author: bookInfo.author,
        description: bookInfo.description,
        publishInfo: bookInfo.publishInfo,
        importTime: bookInfo.importTime.toISOString(),
        filePath: bookInfo.filePath,
        coverImage: bookInfo.coverImage,
        totalWordCount: bookInfo.totalWordCount,
        chapterCount: bookInfo.chapterCount,
        timelineConfig: bookInfo.timelineConfig,
        version: '1.0.0'
      };

      const content = JSON.stringify(metadata, null, 2);

      // 检查文件是否已存在
      const existingFile = this.vault.getAbstractFileByPath(metadataPath);
      if (existingFile && this.isFile(existingFile)) {
        // 覆盖现有文件
        await this.vault.modify(existingFile as TFile, content);
      } else {
        // 创建新文件
        await this.vault.create(metadataPath, content);
      }

      return metadataPath;
    } catch (error) {
      throw new ImportError(
        `保存元数据文件失败: ${error instanceof Error ? error.message : String(error)}`,
        bookInfo.title
      );
    }
  }

  /**
   * 保存目录文件
   * @param bookPath 书籍目录路径
   * @param tocContent 目录内容
   * @returns 保存的文件路径
   */
  async saveTocFile(bookPath: string, tocContent: string): Promise<string> {
    try {
      const tocPath = this.joinPath(bookPath, 'README.md');

      // 检查文件是否已存在
      const existingFile = this.vault.getAbstractFileByPath(tocPath);
      if (existingFile && this.isFile(existingFile)) {
        // 覆盖现有文件
        await this.vault.modify(existingFile as TFile, tocContent);
      } else {
        // 创建新文件
        await this.vault.create(tocPath, tocContent);
      }

      return tocPath;
    } catch (error) {
      throw new ImportError(
        `保存目录文件失败: ${error instanceof Error ? error.message : String(error)}`,
        'README.md'
      );
    }
  }

  /**
   * 批量保存文件
   * @param bookPath 书籍目录路径
   * @param files 文件映射（文件名 -> 内容）
   * @returns 保存的文件路径列表
   */
  async saveFiles(bookPath: string, files: Map<string, string>): Promise<string[]> {
    const savedFiles: string[] = [];

    for (const [fileName, content] of files) {
      try {
        const filePath = this.joinPath(bookPath, fileName);
        
        // 检查文件是否已存在
        const existingFile = this.vault.getAbstractFileByPath(filePath);
        if (existingFile && this.isFile(existingFile)) {
          // 覆盖现有文件
          await this.vault.modify(existingFile as TFile, content);
        } else {
          // 创建新文件
          await this.vault.create(filePath, content);
        }

        savedFiles.push(filePath);
      } catch (error) {
        console.warn(`FileOrganizer: 保存文件 ${fileName} 失败:`, error);
        // 继续保存其他文件，不中断整个过程
      }
    }

    return savedFiles;
  }

  /**
   * 检查对象是否为文件夹
   * @param obj 要检查的对象
   * @returns 是否为文件夹
   */
  private isFolder(obj: any): boolean {
    try {
      return obj instanceof TFolder || (obj && typeof obj === 'object' && 'children' in obj);
    } catch {
      return obj && typeof obj === 'object' && 'children' in obj;
    }
  }

  /**
   * 检查对象是否为文件
   * @param obj 要检查的对象
   * @returns 是否为文件
   */
  private isFile(obj: any): boolean {
    try {
      return obj instanceof TFile || (obj && typeof obj === 'object' && 'stat' in obj);
    } catch {
      return obj && typeof obj === 'object' && 'stat' in obj;
    }
  }

  /**
   * 生成书籍目录名
   * @param bookInfo 书籍信息
   * @returns 目录名
   */
  private generateBookDirectoryName(bookInfo: BookInfo): string {
    // 格式：《书名》- 作者
    const title = this.sanitizeFileName(bookInfo.title);
    const author = this.sanitizeFileName(bookInfo.author);
    return `《${title}》- ${author}`;
  }

  /**
   * 生成章节文件名
   * @param chapter 章节数据
   * @returns 文件名
   */
  private generateChapterFileName(chapter: Chapter): string {
    const chapterNumber = String(chapter.index + 1).padStart(3, '0');
    const title = this.sanitizeFileName(chapter.title);
    return `${chapterNumber}-${title}.md`;
  }

  /**
   * 清理文件名中的非法字符
   * @param fileName 原始文件名
   * @returns 清理后的文件名
   */
  private sanitizeFileName(fileName: string): string {
    return fileName
      .replace(/[<>:"/\\|?*]/g, '') // 移除非法字符
      .replace(/\s+/g, ' ') // 规范化空格
      .trim()
      .substring(0, 50); // 限制长度
  }

  /**
   * 规范化路径
   * @param path 原始路径
   * @returns 规范化后的路径
   */
  private normalizePath(path: string): string {
    return path
      .replace(/\\/g, '/') // 统一使用正斜杠
      .replace(/\/+/g, '/') // 移除重复斜杠
      .replace(/^\/|\/$/g, ''); // 移除首尾斜杠
  }

  /**
   * 连接路径
   * @param basePath 基础路径
   * @param relativePath 相对路径
   * @returns 连接后的路径
   */
  private joinPath(basePath: string, relativePath: string): string {
    const normalizedBase = this.normalizePath(basePath);
    const normalizedRelative = this.normalizePath(relativePath);
    
    if (!normalizedBase) return normalizedRelative;
    if (!normalizedRelative) return normalizedBase;
    
    return `${normalizedBase}/${normalizedRelative}`;
  }

  /**
   * 确保目录存在
   * @param dirPath 目录路径
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      const pathParts = dirPath.split('/');
      let currentPath = '';

      for (const part of pathParts) {
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        
        const existingFolder = this.vault.getAbstractFileByPath(currentPath);
        if (!existingFolder) {
          await this.vault.createFolder(currentPath);
        }
      }
    } catch (error) {
      throw new ImportError(
        `无法创建目录: ${dirPath}`,
        dirPath
      );
    }
  }

  /**
   * 生成唯一目录名
   * @param basePath 基础路径
   * @returns 唯一目录路径
   */
  private async generateUniqueDirectoryName(basePath: string): Promise<string> {
    let counter = 1;
    let uniquePath = `${basePath} (${counter})`;

    while (this.vault.getAbstractFileByPath(uniquePath)) {
      counter++;
      uniquePath = `${basePath} (${counter})`;
    }

    return uniquePath;
  }

  /**
   * 生成唯一文件名
   * @param basePath 基础文件路径
   * @returns 唯一文件路径
   */
  private async generateUniqueFileName(basePath: string): Promise<string> {
    const lastDotIndex = basePath.lastIndexOf('.');
    const nameWithoutExt = lastDotIndex > 0 ? basePath.substring(0, lastDotIndex) : basePath;
    const extension = lastDotIndex > 0 ? basePath.substring(lastDotIndex) : '';

    let counter = 1;
    let uniquePath = `${nameWithoutExt} (${counter})${extension}`;

    while (this.vault.getAbstractFileByPath(uniquePath)) {
      counter++;
      uniquePath = `${nameWithoutExt} (${counter})${extension}`;
    }

    return uniquePath;
  }

  /**
   * 检查路径是否有效
   * @param path 路径
   * @returns 是否有效
   */
  isValidPath(path: string): boolean {
    // 检查路径是否包含非法字符
    const invalidChars = /[<>:"|?*]/;
    return !invalidChars.test(path) && path.length > 0 && path.length < 260;
  }

  /**
   * 获取目录大小统计
   * @param dirPath 目录路径
   * @returns 目录统计信息
   */
  async getDirectoryStats(dirPath: string): Promise<{
    fileCount: number;
    totalSize: number;
    directories: string[];
    files: string[];
  }> {
    const stats = {
      fileCount: 0,
      totalSize: 0,
      directories: [] as string[],
      files: [] as string[]
    };

    const folder = this.vault.getAbstractFileByPath(dirPath);
    if (!(folder && folder.constructor.name === 'TFolder')) {
      return stats;
    }

    const processFolder = (currentFolder: any) => {
      for (const child of currentFolder.children) {
        if (child && child.constructor.name === 'TFile') {
          stats.fileCount++;
          stats.totalSize += child.stat.size;
          stats.files.push(child.path);
        } else if (child && child.constructor.name === 'TFolder') {
          stats.directories.push(child.path);
          processFolder(child);
        }
      }
    };

    processFolder(folder);
    return stats;
  }
}