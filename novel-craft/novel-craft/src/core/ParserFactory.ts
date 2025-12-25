/**
 * ParserFactory - 文档解析器工厂
 * 
 * 根据文件格式返回对应的解析器
 */

import { ParsedBook } from '../types';
import { 
  DocumentFormat, 
  DocumentParseError, 
  getDocumentFormat,
  isSupportedDocument,
  getSupportedExtensions
} from './DocumentParser';
import { EpubParser } from './EpubParser';
import { TxtParser } from './TxtParser';
import { DocxParser } from './DocxParser';
import { PdfParser } from './PdfParser';

/**
 * 文档解析器工厂类
 */
export class ParserFactory {
  private static epubParser: EpubParser | null = null;
  private static txtParser: TxtParser | null = null;
  private static docxParser: DocxParser | null = null;
  private static pdfParser: PdfParser | null = null;

  /**
   * 解析文档
   * @param data 文档数据
   * @param filename 文件名
   * @returns 解析后的书籍对象
   */
  static async parseDocument(data: ArrayBuffer, filename: string): Promise<ParsedBook> {
    const format = getDocumentFormat(filename);
    
    if (!format) {
      throw new DocumentParseError(
        `不支持的文件格式: ${filename}。支持的格式: ${getSupportedExtensions().join(', ')}`
      );
    }
    
    switch (format) {
      case 'epub':
        return this.getEpubParser().parse(data);
      case 'txt':
        return this.getTxtParser().parse(data, filename);
      case 'docx':
        return this.getDocxParser().parse(data, filename);
      case 'pdf':
        return this.getPdfParser().parse(data, filename);
      default:
        throw new DocumentParseError(`未实现的格式解析器: ${format}`);
    }
  }

  /**
   * 检查文件是否支持
   */
  static isSupported(filename: string): boolean {
    return isSupportedDocument(filename);
  }

  /**
   * 获取支持的扩展名
   */
  static getSupportedExtensions(): string[] {
    return getSupportedExtensions();
  }

  /**
   * 获取文件格式
   */
  static getFormat(filename: string): DocumentFormat | null {
    return getDocumentFormat(filename);
  }

  // 懒加载解析器实例
  private static getEpubParser(): EpubParser {
    if (!this.epubParser) {
      this.epubParser = new EpubParser();
    }
    return this.epubParser;
  }

  private static getTxtParser(): TxtParser {
    if (!this.txtParser) {
      this.txtParser = new TxtParser();
    }
    return this.txtParser;
  }

  private static getDocxParser(): DocxParser {
    if (!this.docxParser) {
      this.docxParser = new DocxParser();
    }
    return this.docxParser;
  }

  private static getPdfParser(): PdfParser {
    if (!this.pdfParser) {
      this.pdfParser = new PdfParser();
    }
    return this.pdfParser;
  }
}

// 导出便捷函数
export { 
  getDocumentFormat, 
  isSupportedDocument, 
  getSupportedExtensions,
  DocumentParseError 
} from './DocumentParser';
