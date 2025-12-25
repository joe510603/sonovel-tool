/**
 * PdfParser - 解析 PDF 文档
 * 
 * 使用 pdfjs-dist 库提取文本内容
 * 支持功能：
 * - 提取 PDF 文本
 * - 智能章节分割
 * - 从文件名提取元数据
 */

import { Chapter, BookMetadata, ParsedBook } from '../types';
import { IDocumentParser, DocumentFormat, DocumentParseError } from './DocumentParser';

export class PdfParser implements IDocumentParser {
  // 章节标题正则表达式
  private static readonly CHAPTER_PATTERNS = [
    /^第[一二三四五六七八九十百千万零\d]+[章节回卷集部篇]/,
    /^[第]?\s*[\d一二三四五六七八九十百千万零]+\s*[章节回卷集部篇]/,
    /^Chapter\s*\d+/i,
    /^卷[一二三四五六七八九十\d]+/,
  ];

  getSupportedFormat(): DocumentFormat {
    return 'pdf';
  }

  async parse(data: ArrayBuffer, filename?: string): Promise<ParsedBook> {
    try {
      // 动态加载 pdfjs-dist
      const pdfjsLib = await this.loadPdfJs();
      
      // 加载 PDF 文档
      const loadingTask = pdfjsLib.getDocument({ data });
      const pdf = await loadingTask.promise;
      
      // 提取所有页面的文本
      const textContent: string[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: { str?: string }) => item.str || '')
          .join(' ');
        textContent.push(pageText);
      }
      
      const fullContent = textContent.join('\n\n');
      
      if (!fullContent || fullContent.trim().length === 0) {
        throw new DocumentParseError('PDF 文档内容为空或无法提取文本', 'pdf');
      }
      
      // 提取元数据
      const metadata = await this.extractMetadata(pdf, fullContent, filename);
      
      // 分割章节
      const chapters = this.splitChapters(fullContent);
      
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
        `PDF 文档解析失败: ${error instanceof Error ? error.message : String(error)}`,
        'pdf'
      );
    }
  }


  /**
   * 动态加载 pdfjs-dist 库
   */
  private async loadPdfJs(): Promise<any> {
    try {
      const pdfjsLib = await import('pdfjs-dist');
      
      // 设置 worker（在 Obsidian 环境中可能需要禁用）
      if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = '';
      }
      
      return pdfjsLib;
    } catch (error) {
      throw new DocumentParseError(
        'PDF 文档解析需要 pdfjs-dist 库，请运行: npm install pdfjs-dist',
        'pdf'
      );
    }
  }

  /**
   * 提取元数据
   */
  private async extractMetadata(
    pdf: any, 
    content: string, 
    filename?: string
  ): Promise<BookMetadata> {
    let title = '未知书名';
    let author = '未知作者';
    
    // 尝试从 PDF 元数据获取
    try {
      const metadata = await pdf.getMetadata();
      if (metadata?.info) {
        if (metadata.info.Title) {
          title = metadata.info.Title;
        }
        if (metadata.info.Author) {
          author = metadata.info.Author;
        }
      }
    } catch {
      // 忽略元数据提取错误
    }
    
    // 如果元数据为空，从文件名提取
    if (title === '未知书名' && filename) {
      const nameWithoutExt = filename.replace(/\.pdf$/i, '');
      
      const parenMatch = nameWithoutExt.match(/^(.+?)[（(](.+?)[）)]$/);
      if (parenMatch) {
        title = parenMatch[1].trim();
        if (author === '未知作者') {
          author = parenMatch[2].trim();
        }
      } else {
        title = nameWithoutExt;
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
    return PdfParser.CHAPTER_PATTERNS.some(pattern => pattern.test(line));
  }

  private countWords(text: string): number {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }
}
