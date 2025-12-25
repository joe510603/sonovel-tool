/**
 * DocxParser - 解析 Word 文档 (.docx)
 * 
 * 使用 mammoth 库提取文本内容
 * 支持功能：
 * - 提取文档文本
 * - 智能章节分割
 * - 从文件名提取元数据
 */

import { Chapter, BookMetadata, ParsedBook } from '../types';
import { IDocumentParser, DocumentFormat, DocumentParseError } from './DocumentParser';

// mammoth 类型声明
interface MammothResult {
  value: string;
  messages: Array<{ type: string; message: string }>;
}

interface MammothModule {
  extractRawText(options: { arrayBuffer: ArrayBuffer }): Promise<MammothResult>;
}

export class DocxParser implements IDocumentParser {
  private mammoth: MammothModule | null = null;
  
  // 章节标题正则表达式
  private static readonly CHAPTER_PATTERNS = [
    /^第[一二三四五六七八九十百千万零\d]+[章节回卷集部篇]/,
    /^[第]?\s*[\d一二三四五六七八九十百千万零]+\s*[章节回卷集部篇]/,
    /^Chapter\s*\d+/i,
    /^卷[一二三四五六七八九十\d]+/,
  ];

  getSupportedFormat(): DocumentFormat {
    return 'docx';
  }

  /**
   * 动态加载 mammoth 库
   */
  private async loadMammoth(): Promise<MammothModule> {
    if (this.mammoth) return this.mammoth;
    
    try {
      // 动态导入 mammoth
      const mammothModule = await import('mammoth');
      this.mammoth = mammothModule.default || mammothModule;
      return this.mammoth;
    } catch (error) {
      throw new DocumentParseError(
        'Word 文档解析需要 mammoth 库，请运行: npm install mammoth',
        'docx'
      );
    }
  }

  async parse(data: ArrayBuffer, filename?: string): Promise<ParsedBook> {
    try {
      const mammoth = await this.loadMammoth();
      
      // 提取文本内容
      const result = await mammoth.extractRawText({ arrayBuffer: data });
      const content = result.value;
      
      if (!content || content.trim().length === 0) {
        throw new DocumentParseError('Word 文档内容为空', 'docx');
      }
      
      // 提取元数据
      const metadata = this.extractMetadata(content, filename);
      
      // 分割章节
      const chapters = this.splitChapters(content);
      
      // 计算总字数
      const totalWordCount = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
      
      return {
        metadata,
        chapters,
        totalWordCount
      };
    } catch (error) {
      if (error instanceof DocumentParseError) {
        throw error;
      }
      throw new DocumentParseError(
        `Word 文档解析失败: ${error instanceof Error ? error.message : String(error)}`,
        'docx'
      );
    }
  }


  /**
   * 从文件名和内容提取元数据
   */
  private extractMetadata(content: string, filename?: string): BookMetadata {
    let title = '未知书名';
    let author = '未知作者';
    
    if (filename) {
      const nameWithoutExt = filename.replace(/\.docx?$/i, '');
      
      // 匹配 书名(作者) 或 书名（作者）
      const parenMatch = nameWithoutExt.match(/^(.+?)[（(](.+?)[）)]$/);
      if (parenMatch) {
        title = parenMatch[1].trim();
        author = parenMatch[2].trim();
      } else {
        title = nameWithoutExt;
      }
    }
    
    // 尝试从内容开头提取
    const lines = content.split('\n').slice(0, 20);
    for (const line of lines) {
      const trimmed = line.trim();
      
      const titleMatch = trimmed.match(/^(?:书名|名称|title)[：:]\s*(.+)/i);
      if (titleMatch && title === '未知书名') {
        title = titleMatch[1].trim();
      }
      
      const authorMatch = trimmed.match(/^(?:作者|author)[：:]\s*(.+)/i);
      if (authorMatch && author === '未知作者') {
        author = authorMatch[1].trim();
      }
    }
    
    return { title, author };
  }

  /**
   * 智能分割章节
   */
  private splitChapters(content: string): Chapter[] {
    const lines = content.split(/\r?\n/);
    const chapters: Chapter[] = [];
    
    let currentTitle = '序章';
    let currentContent: string[] = [];
    let chapterIndex = 0;
    
    for (const line of lines) {
      const trimmedLine = line.trim();
      
      if (this.isChapterTitle(trimmedLine)) {
        if (currentContent.length > 0 || chapterIndex > 0) {
          const chapterText = currentContent.join('\n').trim();
          if (chapterText.length > 0) {
            chapters.push({
              index: chapterIndex,
              title: currentTitle,
              content: chapterText,
              wordCount: this.countWords(chapterText)
            });
            chapterIndex++;
          }
        }
        
        currentTitle = trimmedLine;
        currentContent = [];
      } else {
        currentContent.push(line);
      }
    }
    
    // 保存最后一个章节
    const lastContent = currentContent.join('\n').trim();
    if (lastContent.length > 0) {
      chapters.push({
        index: chapterIndex,
        title: currentTitle,
        content: lastContent,
        wordCount: this.countWords(lastContent)
      });
    }
    
    // 如果没有识别到章节
    if (chapters.length === 0) {
      const fullContent = content.trim();
      chapters.push({
        index: 0,
        title: '正文',
        content: fullContent,
        wordCount: this.countWords(fullContent)
      });
    }
    
    return chapters;
  }

  private isChapterTitle(line: string): boolean {
    if (!line || line.length > 50) return false;
    return DocxParser.CHAPTER_PATTERNS.some(pattern => pattern.test(line));
  }

  private countWords(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }
}
