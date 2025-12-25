/**
 * TxtParser - 解析 TXT 文本文件
 * 
 * 支持功能：
 * - 自动检测编码（UTF-8, GBK, GB2312）
 * - 智能章节分割
 * - 从文件名提取书名和作者
 */

import { Chapter, BookMetadata, ParsedBook } from '../types';
import { IDocumentParser, DocumentFormat, DocumentParseError } from './DocumentParser';

export class TxtParser implements IDocumentParser {
  // 章节标题正则表达式
  private static readonly CHAPTER_PATTERNS = [
    /^第[一二三四五六七八九十百千万零\d]+[章节回卷集部篇]/,
    /^[第]?\s*[\d一二三四五六七八九十百千万零]+\s*[章节回卷集部篇]/,
    /^Chapter\s*\d+/i,
    /^卷[一二三四五六七八九十\d]+/,
    /^[【\[]\s*第?[一二三四五六七八九十百千万零\d]+[章节回]\s*[】\]]/,
  ];

  getSupportedFormat(): DocumentFormat {
    return 'txt';
  }

  async parse(data: ArrayBuffer, filename?: string): Promise<ParsedBook> {
    try {
      // 解码文本内容
      const content = await this.decodeContent(data);
      
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
        `TXT 文件解析失败: ${error instanceof Error ? error.message : String(error)}`,
        'txt'
      );
    }
  }

  /**
   * 解码文本内容，自动检测编码
   */
  private async decodeContent(data: ArrayBuffer): Promise<string> {
    const uint8Array = new Uint8Array(data);
    
    // 尝试 UTF-8
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      return decoder.decode(uint8Array);
    } catch {
      // UTF-8 失败，尝试 GBK
    }
    
    // 尝试 GBK/GB2312
    try {
      const decoder = new TextDecoder('gbk', { fatal: false });
      return decoder.decode(uint8Array);
    } catch {
      // GBK 也失败
    }
    
    // 最后使用 UTF-8 非严格模式
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return decoder.decode(uint8Array);
  }


  /**
   * 从文件名和内容提取元数据
   */
  private extractMetadata(content: string, filename?: string): BookMetadata {
    let title = '未知书名';
    let author = '未知作者';
    
    if (filename) {
      // 尝试从文件名提取：书名(作者).txt 或 书名-作者.txt
      const nameWithoutExt = filename.replace(/\.txt$/i, '');
      
      // 匹配 书名(作者) 或 书名（作者）
      const parenMatch = nameWithoutExt.match(/^(.+?)[（(](.+?)[）)]$/);
      if (parenMatch) {
        title = parenMatch[1].trim();
        author = parenMatch[2].trim();
      } else {
        // 匹配 书名-作者 或 书名_作者
        const dashMatch = nameWithoutExt.match(/^(.+?)[-_](.+?)$/);
        if (dashMatch) {
          title = dashMatch[1].trim();
          author = dashMatch[2].trim();
        } else {
          title = nameWithoutExt;
        }
      }
    }
    
    // 尝试从内容开头提取
    const lines = content.split('\n').slice(0, 20);
    for (const line of lines) {
      const trimmed = line.trim();
      
      // 匹配 书名：xxx 或 书名:xxx
      const titleMatch = trimmed.match(/^(?:书名|名称|title)[：:]\s*(.+)/i);
      if (titleMatch && title === '未知书名') {
        title = titleMatch[1].trim();
      }
      
      // 匹配 作者：xxx 或 作者:xxx
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
      
      // 检查是否是章节标题
      if (this.isChapterTitle(trimmedLine)) {
        // 保存之前的章节
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
        
        // 开始新章节
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
    
    // 如果没有识别到章节，将整个内容作为一个章节
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

  /**
   * 检查是否是章节标题
   */
  private isChapterTitle(line: string): boolean {
    if (!line || line.length > 50) return false;
    
    return TxtParser.CHAPTER_PATTERNS.some(pattern => pattern.test(line));
  }

  /**
   * 计算字数（中文按字符，英文按单词）
   */
  private countWords(text: string): number {
    // 中文字符数
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    // 英文单词数
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }
}
