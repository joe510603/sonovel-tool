import { Chapter, BookMetadata } from '../types';
import { ConversionOptions, ConversionResult, ImportOptions } from '../types/import';

/**
 * Markdown转换器
 * 负责将解析后的书籍内容转换为Markdown格式
 * 
 * 功能特性：
 * - 章节内容转换为标准Markdown格式
 * - 保持章节结构和标题层级
 * - 生成目录文件和元数据文件
 * - 支持自定义转换选项
 */
export class MarkdownConverter {
  private readonly defaultOptions: ConversionOptions = {
    preserveHtml: false,
    addChapterNumbers: true,
    titleLevel: 1,
    addSeparators: true
  };

  /**
   * 转换章节内容为Markdown格式
   * @param chapter 章节数据
   * @param options 转换选项（可选）
   * @returns Markdown格式的章节内容
   */
  convertChapter(chapter: Chapter, options?: Partial<ConversionOptions>): string {
    const opts = { ...this.defaultOptions, ...options };
    let content = '';

    // 添加章节标题
    const titlePrefix = '#'.repeat(opts.titleLevel);
    const chapterTitle = opts.addChapterNumbers 
      ? `${titlePrefix} 第${chapter.index + 1}章 ${chapter.title}`
      : `${titlePrefix} ${chapter.title}`;
    
    content += `${chapterTitle}\n\n`;

    // 处理章节内容
    let chapterContent = chapter.content;

    if (!opts.preserveHtml) {
      // 移除HTML标签（如果有残留）
      chapterContent = this.stripHtmlTags(chapterContent);
    }

    // 格式化段落
    chapterContent = this.formatParagraphs(chapterContent);

    content += chapterContent;

    // 添加分隔线
    if (opts.addSeparators) {
      content += '\n\n---\n\n';
    }

    return content;
  }

  /**
   * 生成目录文件内容
   * @param chapters 章节列表
   * @param bookInfo 书籍信息
   * @returns 目录Markdown内容
   */
  generateToc(chapters: Chapter[], bookInfo: BookMetadata): string {
    let toc = `# ${bookInfo.title}\n\n`;
    
    // 添加书籍信息
    toc += `**作者**: ${bookInfo.author}\n\n`;
    
    if (bookInfo.description) {
      toc += `**简介**: ${bookInfo.description}\n\n`;
    }

    toc += `**总章节数**: ${chapters.length}\n`;
    toc += `**总字数**: ${chapters.reduce((sum, ch) => sum + ch.wordCount, 0).toLocaleString()}\n\n`;

    // 生成章节目录
    toc += '## 目录\n\n';
    
    for (const chapter of chapters) {
      const chapterFileName = this.generateChapterFileName(chapter);
      toc += `- [第${chapter.index + 1}章 ${chapter.title}](./${chapterFileName}) (${chapter.wordCount.toLocaleString()}字)\n`;
    }

    return toc;
  }

  /**
   * 生成元数据文件内容
   * @param bookInfo 书籍信息
   * @returns JSON格式的元数据内容
   */
  generateMetadata(bookInfo: BookMetadata): string {
    const metadata = {
      title: bookInfo.title,
      author: bookInfo.author,
      description: bookInfo.description,
      coverImage: bookInfo.coverImage,
      importTime: new Date().toISOString(),
      version: '1.0.0'
    };

    return JSON.stringify(metadata, null, 2);
  }

  /**
   * 批量转换所有章节
   * @param chapters 章节列表
   * @param bookInfo 书籍信息
   * @param options 转换选项
   * @returns 转换结果映射（文件名 -> 内容）
   */
  convertAllChapters(
    chapters: Chapter[], 
    bookInfo: BookMetadata, 
    options?: Partial<ConversionOptions>
  ): Map<string, string> {
    const results = new Map<string, string>();

    // 转换每个章节
    for (const chapter of chapters) {
      const fileName = this.generateChapterFileName(chapter);
      const content = this.convertChapter(chapter, options);
      results.set(fileName, content);
    }

    // 生成目录文件
    const tocContent = this.generateToc(chapters, bookInfo);
    results.set('README.md', tocContent);

    // 生成元数据文件
    const metadataContent = this.generateMetadata(bookInfo);
    results.set('book.json', metadataContent);

    return results;
  }

  /**
   * 生成章节文件名
   * @param chapter 章节数据
   * @returns 标准化的文件名
   */
  generateChapterFileName(chapter: Chapter): string {
    // 清理标题中的特殊字符
    const cleanTitle = this.sanitizeFileName(chapter.title);
    const chapterNumber = String(chapter.index + 1).padStart(3, '0');
    return `${chapterNumber}-${cleanTitle}.md`;
  }

  /**
   * 清理文件名中的非法字符
   * @param fileName 原始文件名
   * @returns 清理后的文件名
   */
  private sanitizeFileName(fileName: string): string {
    // 移除或替换非法字符
    return fileName
      .replace(/[<>:"/\\|?*]/g, '') // 移除Windows非法字符
      .replace(/\s+/g, '-') // 空格替换为连字符
      .replace(/[^\w\u4e00-\u9fa5-]/g, '') // 只保留字母、数字、中文和连字符
      .substring(0, 50); // 限制长度
  }

  /**
   * 移除HTML标签
   * @param content 包含HTML的内容
   * @returns 纯文本内容
   */
  private stripHtmlTags(content: string): string {
    return content
      .replace(/<[^>]+>/g, '') // 移除HTML标签
      .replace(/&nbsp;/g, ' ') // 替换HTML实体
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  /**
   * 格式化段落
   * @param content 原始内容
   * @returns 格式化后的内容
   */
  private formatParagraphs(content: string): string {
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n\n'); // 段落间添加空行
  }

  /**
   * 验证转换结果
   * @param results 转换结果
   * @returns 验证是否通过
   */
  validateConversionResults(results: Map<string, string>): boolean {
    // 检查必需文件是否存在
    if (!results.has('README.md')) {
      console.warn('MarkdownConverter: 缺少目录文件 README.md');
      return false;
    }

    if (!results.has('book.json')) {
      console.warn('MarkdownConverter: 缺少元数据文件 book.json');
      return false;
    }

    // 检查章节文件
    const chapterFiles = Array.from(results.keys()).filter(name => 
      name.endsWith('.md') && name !== 'README.md'
    );

    if (chapterFiles.length === 0) {
      console.warn('MarkdownConverter: 没有找到章节文件');
      return false;
    }

    // 检查文件内容是否为空
    for (const [fileName, content] of results) {
      if (!content || content.trim().length === 0) {
        console.warn(`MarkdownConverter: 文件 ${fileName} 内容为空`);
        return false;
      }
    }

    return true;
  }

  /**
   * 生成转换统计信息
   * @param chapters 章节列表
   * @param results 转换结果
   * @param startTime 开始时间
   * @returns 转换统计
   */
  generateConversionStats(
    chapters: Chapter[], 
    results: Map<string, string>, 
    startTime: number
  ): ConversionResult['stats'] {
    const conversionTime = Date.now() - startTime;
    const chaptersGenerated = Array.from(results.keys()).filter(name => 
      name.endsWith('.md') && name !== 'README.md'
    ).length;
    
    const totalFileSize = Array.from(results.values())
      .reduce((sum, content) => sum + new Blob([content]).size, 0);

    return {
      conversionTime,
      chaptersGenerated,
      totalFileSize
    };
  }
}