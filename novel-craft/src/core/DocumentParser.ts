/**
 * DocumentParser - 通用文档解析器接口
 * 
 * 支持多种文档格式：epub, txt, docx, pdf
 */

import { Chapter, BookMetadata, ParsedBook } from '../types';

/**
 * 支持的文档格式
 */
export type DocumentFormat = 'epub' | 'txt' | 'docx' | 'pdf';

/**
 * 文档解析器接口
 */
export interface IDocumentParser {
  /**
   * 解析文档
   * @param data 文档数据
   * @param filename 文件名（用于提取元数据）
   */
  parse(data: ArrayBuffer, filename?: string): Promise<ParsedBook>;
  
  /**
   * 获取支持的格式
   */
  getSupportedFormat(): DocumentFormat;
}

/**
 * 文档解析错误
 */
export class DocumentParseError extends Error {
  constructor(message: string, public readonly format?: DocumentFormat) {
    super(message);
    this.name = 'DocumentParseError';
  }
}

/**
 * 获取文件扩展名对应的格式
 */
export function getDocumentFormat(filename: string): DocumentFormat | null {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'epub':
      return 'epub';
    case 'txt':
      return 'txt';
    case 'docx':
    case 'doc':
      return 'docx';
    case 'pdf':
      return 'pdf';
    default:
      return null;
  }
}

/**
 * 检查是否为支持的文档格式
 */
export function isSupportedDocument(filename: string): boolean {
  return getDocumentFormat(filename) !== null;
}

/**
 * 获取支持的文件扩展名列表
 */
export function getSupportedExtensions(): string[] {
  return ['epub', 'txt', 'docx', 'doc', 'pdf'];
}
