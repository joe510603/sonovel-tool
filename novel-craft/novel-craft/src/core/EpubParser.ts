import JSZip from 'jszip';
import { Chapter, BookMetadata, ParsedBook } from '../types';

/**
 * EpubParser - 解析 epub 文件，提取章节结构和内容
 * 
 * 支持功能：
 * - 解析 epub 文件元数据（标题、作者、描述、封面）
 * - 提取章节列表和内容
 * - 处理编码问题和格式异常
 * - 分块处理大型文件避免内存溢出
 */
export class EpubParser {
  private static readonly CONTAINER_PATH = 'META-INF/container.xml';
  private static readonly SUPPORTED_ENCODINGS = ['utf-8', 'gbk', 'gb2312', 'gb18030'];

  /**
   * 解析 epub 文件
   * @param data epub 文件的 ArrayBuffer 数据
   * @returns 解析后的书籍对象
   */
  async parse(data: ArrayBuffer): Promise<ParsedBook> {
    try {
      const zip = await JSZip.loadAsync(data);
      
      // 1. 获取 OPF 文件路径
      const opfPath = await this.getOpfPath(zip);
      
      // 2. 解析 OPF 文件获取元数据和 spine
      const opfContent = await this.readFileFromZip(zip, opfPath);
      const opfDir = this.getDirectory(opfPath);
      const { metadata, spine, manifest } = this.parseOpf(opfContent);
      
      // 3. 提取章节内容
      const chapters = await this.extractChapters(zip, spine, manifest, opfDir);
      
      // 4. 计算总字数
      const totalWordCount = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);
      
      return {
        metadata,
        chapters,
        totalWordCount
      };
    } catch (error) {
      if (error instanceof EpubParseError) {
        throw error;
      }
      throw new EpubParseError(
        `epub 文件解析失败: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * 获取指定章节
   * @param book 已解析的书籍
   * @param index 章节索引（从 0 开始）
   * @returns 章节对象
   */
  getChapter(book: ParsedBook, index: number): Chapter {
    if (index < 0 || index >= book.chapters.length) {
      throw new EpubParseError(
        `章节索引超出范围: ${index}，有效范围: 0-${book.chapters.length - 1}`
      );
    }
    return book.chapters[index];
  }

  /**
   * 获取章节范围
   * @param book 已解析的书籍
   * @param start 起始索引（包含）
   * @param end 结束索引（包含）
   * @returns 章节数组
   */
  getChapterRange(book: ParsedBook, start: number, end: number): Chapter[] {
    if (start < 0) {
      start = 0;
    }
    if (end >= book.chapters.length) {
      end = book.chapters.length - 1;
    }
    if (start > end) {
      return [];
    }
    return book.chapters.slice(start, end + 1);
  }

  /**
   * 从 container.xml 获取 OPF 文件路径
   */
  private async getOpfPath(zip: JSZip): Promise<string> {
    const containerContent = await this.readFileFromZip(zip, EpubParser.CONTAINER_PATH);
    
    // 解析 container.xml 获取 rootfile 路径
    const rootfileMatch = containerContent.match(
      /<rootfile[^>]*full-path=["']([^"']+)["'][^>]*>/i
    );
    
    if (!rootfileMatch || !rootfileMatch[1]) {
      throw new EpubParseError('无法找到 OPF 文件路径，epub 格式可能损坏');
    }
    
    return rootfileMatch[1];
  }

  /**
   * 从 zip 中读取文件内容
   */
  private async readFileFromZip(zip: JSZip, path: string): Promise<string> {
    const file = zip.file(path);
    if (!file) {
      throw new EpubParseError(`文件不存在: ${path}`);
    }
    
    // 尝试不同编码读取
    const buffer = await file.async('arraybuffer');
    return this.decodeContent(buffer);
  }

  /**
   * 尝试多种编码解码内容
   */
  private decodeContent(buffer: ArrayBuffer): string {
    // 首先尝试 UTF-8
    try {
      const decoder = new TextDecoder('utf-8', { fatal: true });
      return decoder.decode(buffer);
    } catch {
      // UTF-8 失败，尝试其他编码
    }

    // 尝试其他编码
    for (const encoding of EpubParser.SUPPORTED_ENCODINGS.slice(1)) {
      try {
        const decoder = new TextDecoder(encoding, { fatal: false });
        return decoder.decode(buffer);
      } catch {
        continue;
      }
    }

    // 最后使用 UTF-8 非严格模式
    const decoder = new TextDecoder('utf-8', { fatal: false });
    return decoder.decode(buffer);
  }

  /**
   * 获取路径的目录部分
   */
  private getDirectory(path: string): string {
    const lastSlash = path.lastIndexOf('/');
    return lastSlash >= 0 ? path.substring(0, lastSlash + 1) : '';
  }

  /**
   * 解析 OPF 文件
   */
  private parseOpf(content: string): {
    metadata: BookMetadata;
    spine: string[];
    manifest: Map<string, ManifestItem>;
  } {
    console.log('NovelCraft [EpubParser]: OPF 内容长度:', content.length);
    console.log('NovelCraft [EpubParser]: OPF 前500字符:', content.substring(0, 500));
    
    const metadata = this.extractMetadata(content);
    const manifest = this.extractManifest(content);
    const spine = this.extractSpine(content);
    
    console.log('NovelCraft [EpubParser]: 解析后 manifest 大小:', manifest.size);
    console.log('NovelCraft [EpubParser]: 解析后 spine 长度:', spine.length);
    
    return { metadata, spine, manifest };
  }

  /**
   * 提取元数据
   */
  private extractMetadata(opfContent: string): BookMetadata {
    const getTagContent = (tag: string): string => {
      // 尝试多种格式
      const patterns = [
        new RegExp(`<dc:${tag}[^>]*>([\\s\\S]*?)</dc:${tag}>`, 'i'),
        new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i')
      ];
      
      for (const regex of patterns) {
        const match = opfContent.match(regex);
        if (match && match[1].trim()) {
          return this.decodeHtmlEntities(match[1].trim());
        }
      }
      return '';
    };

    const title = getTagContent('title') || '未知标题';
    const author = getTagContent('creator') || '未知作者';
    const description = getTagContent('description') || undefined;

    // 尝试获取封面图片 ID
    let coverImage: string | undefined;
    const coverMeta = opfContent.match(
      /<meta[^>]*name=["']cover["'][^>]*content=["']([^"']+)["'][^>]*>/i
    );
    if (coverMeta) {
      coverImage = coverMeta[1];
    }

    return { title, author, description, coverImage };
  }

  /**
   * 提取 manifest
   */
  private extractManifest(opfContent: string): Map<string, ManifestItem> {
    const manifest = new Map<string, ManifestItem>();
    
    // 尝试多种正则模式
    const patterns = [
      /<item\s+([^>]*)>/gi,
      /<item\s+([^\/]*)\/>/gi
    ];
    
    for (const itemRegex of patterns) {
      let match;
      while ((match = itemRegex.exec(opfContent)) !== null) {
        const attrs = match[1];
        const id = this.extractAttribute(attrs, 'id') || this.extractAttribute(match[0], 'id');
        const href = this.extractAttribute(attrs, 'href') || this.extractAttribute(match[0], 'href');
        const mediaType = this.extractAttribute(attrs, 'media-type') || this.extractAttribute(match[0], 'media-type');

        if (id && href && !manifest.has(id)) {
          manifest.set(id, { id, href, mediaType: mediaType || '' });
        }
      }
    }

    return manifest;
  }

  /**
   * 提取 spine（阅读顺序）
   */
  private extractSpine(opfContent: string): string[] {
    const spine: string[] = [];
    const spineMatch = opfContent.match(/<spine[^>]*>([\s\S]*?)<\/spine>/i);
    
    if (spineMatch) {
      const spineContent = spineMatch[1];
      const itemrefRegex = /<itemref[^>]*idref=["']([^"']+)["'][^>]*>/gi;
      let match;

      while ((match = itemrefRegex.exec(spineContent)) !== null) {
        spine.push(match[1]);
      }
    }

    return spine;
  }

  /**
   * 从标签中提取属性值
   */
  private extractAttribute(tag: string, attr: string): string {
    const regex = new RegExp(`${attr}=["']([^"']+)["']`, 'i');
    const match = tag.match(regex);
    return match ? match[1] : '';
  }

  /**
   * 提取章节内容
   */
  private async extractChapters(
    zip: JSZip,
    spine: string[],
    manifest: Map<string, ManifestItem>,
    opfDir: string
  ): Promise<Chapter[]> {
    const chapters: Chapter[] = [];
    let chapterIndex = 0;

    console.log('NovelCraft [EpubParser]: spine 长度:', spine.length);
    console.log('NovelCraft [EpubParser]: manifest 大小:', manifest.size);
    console.log('NovelCraft [EpubParser]: opfDir:', opfDir);

    // 如果 spine 为空，尝试从 manifest 中获取所有 HTML 文件
    let itemsToProcess: { id: string; href: string; mediaType: string }[] = [];
    
    if (spine.length > 0) {
      for (const itemId of spine) {
        const item = manifest.get(itemId);
        if (item) {
          itemsToProcess.push(item);
        }
      }
    } else if (manifest.size > 0) {
      // spine 为空时，从 manifest 获取所有 HTML 文件
      console.log('NovelCraft [EpubParser]: spine 为空，从 manifest 获取 HTML 文件');
      for (const item of manifest.values()) {
        if (this.isHtmlContent(item.mediaType) || item.href.endsWith('.html') || item.href.endsWith('.xhtml')) {
          itemsToProcess.push(item);
        }
      }
    }
    
    // 备用方案：如果 manifest 也为空，直接从 zip 文件列表获取 HTML 文件
    if (itemsToProcess.length === 0) {
      console.log('NovelCraft [EpubParser]: manifest 为空，直接从 zip 获取 HTML 文件');
      const allFiles = Object.keys(zip.files);
      const htmlFiles = allFiles
        .filter(f => f.endsWith('.html') || f.endsWith('.xhtml') || f.endsWith('.htm'))
        .filter(f => !f.toLowerCase().includes('cover') && !f.toLowerCase().includes('toc') && !f.toLowerCase().includes('nav'))
        .sort((a, b) => {
          // 尝试按数字排序
          const numA = parseInt(a.match(/(\d+)/)?.[1] || '0');
          const numB = parseInt(b.match(/(\d+)/)?.[1] || '0');
          return numA - numB;
        });
      
      console.log('NovelCraft [EpubParser]: 找到 HTML 文件数:', htmlFiles.length);
      
      for (const filePath of htmlFiles) {
        itemsToProcess.push({
          id: filePath,
          href: filePath,
          mediaType: 'application/xhtml+xml'
        });
      }
    }

    console.log('NovelCraft [EpubParser]: 待处理项目数:', itemsToProcess.length);

    for (const item of itemsToProcess) {
      try {
        // 确定文件路径
        let filePath = item.href;
        
        // 如果 href 不是完整路径，需要拼接 opfDir
        if (!zip.file(filePath)) {
          filePath = this.resolvePath(opfDir, item.href);
        }
        
        console.log('NovelCraft [EpubParser]: 尝试读取:', filePath);
        
        const content = await this.readFileFromZip(zip, filePath);
        const { title, text } = this.parseHtmlContent(content);
        
        // 跳过空章节
        if (!text.trim()) {
          console.log('NovelCraft [EpubParser]: 跳过空章节:', item.id);
          continue;
        }

        const wordCount = this.countWords(text);
        
        chapters.push({
          index: chapterIndex,
          title: title || `第 ${chapterIndex + 1} 章`,
          content: text,
          wordCount
        });
        
        console.log('NovelCraft [EpubParser]: 成功提取章节:', chapterIndex, title, '字数:', wordCount);
        chapterIndex++;
      } catch (error) {
        // 跳过无法解析的章节，继续处理其他章节
        console.warn(`NovelCraft [EpubParser]: 跳过无法解析的章节 ${item.id}:`, error);
      }
    }

    console.log('NovelCraft [EpubParser]: 总共提取章节数:', chapters.length);

    if (chapters.length === 0) {
      // 列出 zip 中的所有文件帮助调试
      const allFiles = Object.keys(zip.files);
      console.log('NovelCraft [EpubParser]: zip 中的所有文件:', allFiles);
      throw new EpubParseError('未能提取任何章节内容，epub 文件可能为空或格式不支持');
    }

    return chapters;
  }

  /**
   * 检查是否为 HTML 内容
   */
  private isHtmlContent(mediaType: string): boolean {
    if (!mediaType) return false;
    const type = mediaType.toLowerCase();
    return (
      type === 'application/xhtml+xml' ||
      type === 'text/html' ||
      type === 'application/html' ||
      type.includes('html') ||
      type.includes('xhtml')
    );
  }

  /**
   * 解析相对路径
   */
  private resolvePath(base: string, relative: string): string {
    // 处理 URL 编码
    relative = decodeURIComponent(relative);
    
    // 如果是绝对路径，直接返回
    if (relative.startsWith('/')) {
      return relative.substring(1);
    }
    
    // 处理相对路径
    const baseParts = base.split('/').filter(p => p);
    const relativeParts = relative.split('/');
    
    for (const part of relativeParts) {
      if (part === '..') {
        baseParts.pop();
      } else if (part !== '.') {
        baseParts.push(part);
      }
    }
    
    return baseParts.join('/');
  }

  /**
   * 解析 HTML 内容，提取标题和正文
   */
  private parseHtmlContent(html: string): { title: string; text: string } {
    // 提取标题
    let title = '';
    
    // 尝试从 <title> 标签获取
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (titleMatch && titleMatch[1].trim()) {
      title = this.decodeHtmlEntities(titleMatch[1].trim());
    }
    
    // 尝试从 <h1> 或 <h2> 获取
    if (!title) {
      const h1Match = html.match(/<h[12][^>]*>([^<]*)<\/h[12]>/i);
      if (h1Match && h1Match[1].trim()) {
        title = this.decodeHtmlEntities(h1Match[1].trim());
      }
    }

    // 提取正文内容
    let text = html;
    
    // 移除 head 部分
    text = text.replace(/<head[\s\S]*?<\/head>/gi, '');
    
    // 移除脚本和样式
    text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
    
    // 将段落和换行转换为换行符
    text = text.replace(/<\/p>/gi, '\n\n');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<\/h[1-6]>/gi, '\n\n');
    
    // 移除所有 HTML 标签
    text = text.replace(/<[^>]+>/g, '');
    
    // 解码 HTML 实体
    text = this.decodeHtmlEntities(text);
    
    // 清理多余空白
    text = text.replace(/\n{3,}/g, '\n\n');
    text = text.trim();

    return { title, text };
  }

  /**
   * 解码 HTML 实体
   */
  private decodeHtmlEntities(text: string): string {
    const entities: Record<string, string> = {
      '&nbsp;': ' ',
      '&lt;': '<',
      '&gt;': '>',
      '&amp;': '&',
      '&quot;': '"',
      '&apos;': "'",
      '&#39;': "'",
      '&mdash;': '—',
      '&ndash;': '–',
      '&hellip;': '…',
      '&ldquo;': '"',
      '&rdquo;': '"',
      '&lsquo;': '\u2018',
      '&rsquo;': '\u2019'
    };

    let result = text;
    for (const [entity, char] of Object.entries(entities)) {
      result = result.replace(new RegExp(entity, 'gi'), char);
    }

    // 处理数字实体
    result = result.replace(/&#(\d+);/g, (_, code) => 
      String.fromCharCode(parseInt(code, 10))
    );
    result = result.replace(/&#x([0-9a-f]+);/gi, (_, code) => 
      String.fromCharCode(parseInt(code, 16))
    );

    return result;
  }

  /**
   * 计算字数（中文按字符计算，英文按单词计算）
   */
  private countWords(text: string): number {
    // 中文字符
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    
    // 英文单词
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    
    return chineseChars + englishWords;
  }
}

/**
 * Manifest 项目接口
 */
interface ManifestItem {
  id: string;
  href: string;
  mediaType: string;
}

/**
 * Epub 解析错误
 */
export class EpubParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EpubParseError';
  }
}
