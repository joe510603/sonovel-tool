import { EpubParser } from './EpubParser';
import { ImportError } from '../types/errors';
import JSZip from 'jszip';
import * as fc from 'fast-check';

describe('EpubParser', () => {
  let parser: EpubParser;

  beforeEach(() => {
    parser = new EpubParser();
  });

  /**
   * Helper to create a minimal valid epub structure
   */
  async function createMockEpub(options: {
    title?: string;
    author?: string;
    chapters?: Array<{ title: string; content: string }>;
    description?: string;
  }): Promise<ArrayBuffer> {
    const zip = new JSZip();
    const {
      title = 'Test Book',
      author = 'Test Author',
      chapters = [{ title: 'Chapter 1', content: 'This is chapter 1 content.' }],
      description
    } = options;

    // Add mimetype
    zip.file('mimetype', 'application/epub+zip');

    // Add container.xml
    zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

    // Build manifest and spine items
    const manifestItems = chapters.map((_, i) => 
      `<item id="chapter${i}" href="chapter${i}.xhtml" media-type="application/xhtml+xml"/>`
    ).join('\n    ');

    const spineItems = chapters.map((_, i) => 
      `<itemref idref="chapter${i}"/>`
    ).join('\n    ');

    // Add content.opf
    zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:creator>${author}</dc:creator>
    ${description ? `<dc:description>${description}</dc:description>` : ''}
  </metadata>
  <manifest>
    ${manifestItems}
  </manifest>
  <spine>
    ${spineItems}
  </spine>
</package>`);

    // Add chapter files
    chapters.forEach((chapter, i) => {
      zip.file(`OEBPS/chapter${i}.xhtml`, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <title>${chapter.title}</title>
</head>
<body>
  <h1>${chapter.title}</h1>
  <p>${chapter.content}</p>
</body>
</html>`);
    });

    return await zip.generateAsync({ type: 'arraybuffer' });
  }

  describe('parse()', () => {
    it('should parse a valid epub file and extract metadata', async () => {
      const epubData = await createMockEpub({
        title: '将夜',
        author: '猫腻',
        description: '一个关于修行的故事'
      });

      const result = await parser.parse(epubData);

      expect(result.metadata.title).toBe('将夜');
      expect(result.metadata.author).toBe('猫腻');
      expect(result.metadata.description).toBe('一个关于修行的故事');
    });

    it('should extract chapters with correct structure', async () => {
      const epubData = await createMockEpub({
        chapters: [
          { title: '第一章 开始', content: '故事从这里开始。' },
          { title: '第二章 发展', content: '故事继续发展。' }
        ]
      });

      const result = await parser.parse(epubData);

      expect(result.chapters).toHaveLength(2);
      expect(result.chapters[0].title).toBe('第一章 开始');
      expect(result.chapters[0].content).toContain('故事从这里开始');
      expect(result.chapters[0].index).toBe(0);
      expect(result.chapters[1].index).toBe(1);
    });

    it('should calculate word count correctly for Chinese text', async () => {
      const epubData = await createMockEpub({
        chapters: [
          { title: '测试', content: '这是一段中文测试内容。' } // 10 Chinese chars
        ]
      });

      const result = await parser.parse(epubData);

      // Should count Chinese characters
      expect(result.chapters[0].wordCount).toBeGreaterThan(0);
      expect(result.totalWordCount).toBeGreaterThan(0);
    });

    it('should calculate word count correctly for mixed content', async () => {
      const epubData = await createMockEpub({
        chapters: [
          { title: 'Test', content: 'Hello world 你好世界' } // 2 English words + 4 Chinese chars + "Test" title (1 word)
        ]
      });

      const result = await parser.parse(epubData);

      // Title "Test" (1 word) + "Hello world" (2 words) + "你好世界" (4 chars) = 7
      expect(result.chapters[0].wordCount).toBe(7);
    });

    it('should throw ImportError for invalid epub data', async () => {
      const invalidData = new ArrayBuffer(10);

      await expect(parser.parse(invalidData)).rejects.toThrow(ImportError);
    });

    it('should handle HTML entities in content', async () => {
      const epubData = await createMockEpub({
        chapters: [
          { title: 'Test', content: 'Less than &lt; greater than &gt; ampersand &amp;' }
        ]
      });

      const result = await parser.parse(epubData);

      expect(result.chapters[0].content).toContain('<');
      expect(result.chapters[0].content).toContain('>');
      expect(result.chapters[0].content).toContain('&');
    });
  });

  describe('getChapter()', () => {
    it('should return the correct chapter by index', async () => {
      const epubData = await createMockEpub({
        chapters: [
          { title: 'Chapter 1', content: 'Content 1' },
          { title: 'Chapter 2', content: 'Content 2' },
          { title: 'Chapter 3', content: 'Content 3' }
        ]
      });

      const book = await parser.parse(epubData);
      const chapter = parser.getChapter(book, 1);

      expect(chapter.title).toBe('Chapter 2');
      expect(chapter.index).toBe(1);
    });

    it('should throw error for invalid index', async () => {
      const epubData = await createMockEpub({
        chapters: [{ title: 'Chapter 1', content: 'Content 1' }]
      });

      const book = await parser.parse(epubData);

      expect(() => parser.getChapter(book, -1)).toThrow(ImportError);
      expect(() => parser.getChapter(book, 5)).toThrow(ImportError);
    });
  });

  describe('getChapterRange()', () => {
    it('should return chapters within the specified range', async () => {
      const epubData = await createMockEpub({
        chapters: [
          { title: 'Chapter 1', content: 'Content 1' },
          { title: 'Chapter 2', content: 'Content 2' },
          { title: 'Chapter 3', content: 'Content 3' },
          { title: 'Chapter 4', content: 'Content 4' }
        ]
      });

      const book = await parser.parse(epubData);
      const chapters = parser.getChapterRange(book, 1, 2);

      expect(chapters).toHaveLength(2);
      expect(chapters[0].title).toBe('Chapter 2');
      expect(chapters[1].title).toBe('Chapter 3');
    });

    it('should handle out-of-bounds range gracefully', async () => {
      const epubData = await createMockEpub({
        chapters: [
          { title: 'Chapter 1', content: 'Content 1' },
          { title: 'Chapter 2', content: 'Content 2' }
        ]
      });

      const book = await parser.parse(epubData);
      
      // Start before 0
      const chapters1 = parser.getChapterRange(book, -5, 0);
      expect(chapters1).toHaveLength(1);
      expect(chapters1[0].title).toBe('Chapter 1');

      // End beyond length
      const chapters2 = parser.getChapterRange(book, 0, 10);
      expect(chapters2).toHaveLength(2);
    });

    it('should return empty array when start > end', async () => {
      const epubData = await createMockEpub({
        chapters: [
          { title: 'Chapter 1', content: 'Content 1' },
          { title: 'Chapter 2', content: 'Content 2' }
        ]
      });

      const book = await parser.parse(epubData);
      const chapters = parser.getChapterRange(book, 5, 2);

      expect(chapters).toHaveLength(0);
    });
  });

  describe('edge cases', () => {
    it('should handle epub with default metadata when missing', async () => {
      const zip = new JSZip();
      
      zip.file('mimetype', 'application/epub+zip');
      zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
      
      zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`);
      
      zip.file('ch1.xhtml', `<html><body><p>Content</p></body></html>`);

      const epubData = await zip.generateAsync({ type: 'arraybuffer' });
      const result = await parser.parse(epubData);

      expect(result.metadata.title).toBe('未知标题');
      expect(result.metadata.author).toBe('未知作者');
    });

    it('should handle chapters without explicit titles', async () => {
      const zip = new JSZip();
      
      zip.file('mimetype', 'application/epub+zip');
      zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
      
      zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test</dc:title>
    <dc:creator>Author</dc:creator>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`);
      
      // Chapter without title tag or h1
      zip.file('ch1.xhtml', `<html><body><p>Just some content without a title.</p></body></html>`);

      const epubData = await zip.generateAsync({ type: 'arraybuffer' });
      const result = await parser.parse(epubData);

      // Should use default title format
      expect(result.chapters[0].title).toBe('第 1 章');
    });

    it('should handle corrupted EPUB structure', async () => {
      const zip = new JSZip();
      
      // Missing mimetype file
      zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
      
      zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test</dc:title>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
  </spine>
</package>`);
      
      zip.file('ch1.xhtml', `<html><body><p>Content</p></body></html>`);

      const epubData = await zip.generateAsync({ type: 'arraybuffer' });
      
      // Should still parse successfully despite missing mimetype
      const result = await parser.parse(epubData);
      expect(result.chapters).toHaveLength(1);
    });

    it('should handle malformed XML in content.opf', async () => {
      const zip = new JSZip();
      
      zip.file('mimetype', 'application/epub+zip');
      zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
      
      // Malformed XML - unclosed tag
      zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test</dc:title>
    <dc:creator>Author
  </metadata>
</package>`);

      const epubData = await zip.generateAsync({ type: 'arraybuffer' });
      
      await expect(parser.parse(epubData)).rejects.toThrow(ImportError);
    });

    it('should handle missing chapter files referenced in spine', async () => {
      const zip = new JSZip();
      
      zip.file('mimetype', 'application/epub+zip');
      zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);
      
      zip.file('content.opf', `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>Test</dc:title>
    <dc:creator>Author</dc:creator>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="ch2.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>`);
      
      // Only include ch1.xhtml, ch2.xhtml is missing
      zip.file('ch1.xhtml', `<html><body><h1>Chapter 1</h1><p>Content 1</p></body></html>`);

      const epubData = await zip.generateAsync({ type: 'arraybuffer' });
      
      // Should handle missing files gracefully
      const result = await parser.parse(epubData);
      expect(result.chapters).toHaveLength(1); // Only the existing chapter
      expect(result.chapters[0].title).toBe('Chapter 1');
    });

    it('should handle very large chapter content', async () => {
      const largeContent = 'A'.repeat(100000); // 100KB of content
      
      const epubData = await createMockEpub({
        chapters: [
          { title: 'Large Chapter', content: largeContent }
        ]
      });

      const result = await parser.parse(epubData);
      
      expect(result.chapters).toHaveLength(1);
      expect(result.chapters[0].content).toContain(largeContent);
      expect(result.chapters[0].wordCount).toBeGreaterThan(0);
    });

    it('should handle empty chapter content', async () => {
      const epubData = await createMockEpub({
        chapters: [
          { title: 'Empty Chapter', content: '' },
          { title: 'Whitespace Chapter', content: '   \n\n   ' }
        ]
      });

      const result = await parser.parse(epubData);
      
      expect(result.chapters).toHaveLength(2);
      expect(result.chapters[0].content.trim()).toBe('');
      expect(result.chapters[0].wordCount).toBe(0);
      expect(result.chapters[1].wordCount).toBe(0);
    });

    it('should handle special Unicode characters', async () => {
      const unicodeContent = '这是中文内容 🌟 Ñoël café résumé';
      
      const epubData = await createMockEpub({
        title: 'Unicode 测试 📚',
        author: 'Tëst Authör',
        chapters: [
          { title: 'Unicode Chapter 📖', content: unicodeContent }
        ]
      });

      const result = await parser.parse(epubData);
      
      expect(result.metadata.title).toBe('Unicode 测试 📚');
      expect(result.metadata.author).toBe('Tëst Authör');
      expect(result.chapters[0].title).toBe('Unicode Chapter 📖');
      expect(result.chapters[0].content).toContain(unicodeContent);
    });
  });

  describe('error handling unit tests', () => {
    it('should throw ImportError for completely invalid data', async () => {
      const invalidData = new ArrayBuffer(0); // Empty buffer
      
      await expect(parser.parse(invalidData)).rejects.toThrow(ImportError);
    });

    it('should throw ImportError for non-ZIP data', async () => {
      const textData = new TextEncoder().encode('This is not a ZIP file');
      
      await expect(parser.parse(textData.buffer)).rejects.toThrow(ImportError);
    });

    it('should throw ImportError for ZIP without EPUB structure', async () => {
      const zip = new JSZip();
      zip.file('random.txt', 'This is not an EPUB');
      
      const zipData = await zip.generateAsync({ type: 'arraybuffer' });
      
      await expect(parser.parse(zipData)).rejects.toThrow(ImportError);
    });

    it('should handle getChapter with boundary conditions', async () => {
      const epubData = await createMockEpub({
        chapters: [
          { title: 'Chapter 1', content: 'Content 1' },
          { title: 'Chapter 2', content: 'Content 2' }
        ]
      });

      const book = await parser.parse(epubData);

      // Test negative index
      expect(() => parser.getChapter(book, -1)).toThrow(ImportError);
      
      // Test index equal to length
      expect(() => parser.getChapter(book, 2)).toThrow(ImportError);
      
      // Test very large index
      expect(() => parser.getChapter(book, 1000)).toThrow(ImportError);
    });

    it('should handle getChapterRange with invalid ranges', async () => {
      const epubData = await createMockEpub({
        chapters: [
          { title: 'Chapter 1', content: 'Content 1' },
          { title: 'Chapter 2', content: 'Content 2' },
          { title: 'Chapter 3', content: 'Content 3' }
        ]
      });

      const book = await parser.parse(epubData);

      // Test start > end
      const emptyRange = parser.getChapterRange(book, 2, 1);
      expect(emptyRange).toHaveLength(0);

      // Test negative start
      const negativeStart = parser.getChapterRange(book, -5, 1);
      expect(negativeStart).toHaveLength(2); // Should clamp to [0, 1]
      expect(negativeStart[0].index).toBe(0);

      // Test end beyond bounds
      const beyondEnd = parser.getChapterRange(book, 1, 10);
      expect(beyondEnd).toHaveLength(2); // Should clamp to [1, 2]
      expect(beyondEnd[0].index).toBe(1);
      expect(beyondEnd[1].index).toBe(2);
    });

    it('should handle word counting edge cases', async () => {
      const epubData = await createMockEpub({
        chapters: [
          { title: 'Mixed Content', content: 'English 中文 123 !@# αβγ' },
          { title: 'Numbers Only', content: '123 456 789' },
          { title: 'Punctuation Only', content: '!@#$%^&*()' },
          { title: 'Whitespace', content: '   \n\t\r   ' }
        ]
      });

      const result = await parser.parse(epubData);

      // Mixed content: "English" (1) + "中文" (2) = 3
      expect(result.chapters[0].wordCount).toBe(3);
      
      // Numbers should not be counted as words
      expect(result.chapters[1].wordCount).toBe(0);
      
      // Punctuation should not be counted
      expect(result.chapters[2].wordCount).toBe(0);
      
      // Whitespace should result in 0 words
      expect(result.chapters[3].wordCount).toBe(0);
    });
  });

  describe('属性测试 (Property-Based Tests)', () => {
    /**
     * **功能: book-analysis-enhancement, 属性 11: EPUB转换结构保持**
     * **验证需求: 7.2**
     * 
     * 对于任何EPUB文件转换，转换后的MD文件应保持原书的章节结构和标题层级
     */
    test('属性11: EPUB转换应保持章节结构和标题层级', async () => {
      await fc.assert(fc.asyncProperty(
        // 生成随机的章节结构，确保内容是有意义的文本
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 50 })
            .filter((s: string) => s.trim().length > 0)
            .filter((s: string) => /^[a-zA-Z0-9\u4e00-\u9fa5\s]+$/.test(s)), // 只允许字母数字中文和空格
          author: fc.string({ minLength: 1, maxLength: 30 })
            .filter((s: string) => s.trim().length > 0)
            .filter((s: string) => /^[a-zA-Z0-9\u4e00-\u9fa5\s]+$/.test(s)),
          chapters: fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 100 })
                .filter((s: string) => s.trim().length > 0)
                .filter((s: string) => /^[a-zA-Z0-9\u4e00-\u9fa5\s]+$/.test(s)),
              content: fc.lorem({ maxCount: 20 }) // 使用lorem生成有意义的文本
                .filter((s: string) => s.trim().length > 10)
            }),
            { minLength: 1, maxLength: 5 } // 减少章节数量以提高测试效率
          )
        }),
        async (bookData: any) => {
          // 创建EPUB文件
          const epubData = await createMockEpub(bookData);
          
          // 解析EPUB
          const parsedBook = await parser.parse(epubData);
          
          // 验证核心结构保持性质
          
          // 1. 章节数量保持一致
          expect(parsedBook.chapters.length).toBe(bookData.chapters.length);
          
          // 2. 章节顺序保持一致
          for (let i = 0; i < bookData.chapters.length; i++) {
            const originalChapter = bookData.chapters[i];
            const parsedChapter = parsedBook.chapters[i];
            
            // 验证章节索引正确（结构保持）
            expect(parsedChapter.index).toBe(i);
            
            // 验证章节标题保持（可能有格式化差异，但核心内容应保持）
            // HTML解析会清理空白字符，所以我们比较清理后的标题
            const originalTitleTrimmed = originalChapter.title.trim();
            const parsedTitleTrimmed = parsedChapter.title.trim();
            expect(parsedTitleTrimmed).toContain(originalTitleTrimmed);
            
            // 验证章节内容非空（如果原始内容非空）
            if (originalChapter.content.trim().length > 0) {
              expect(parsedChapter.content.trim().length).toBeGreaterThan(0);
            }
            
            // 验证字数统计合理（解析后的字数应该与原始内容相关）
            expect(parsedChapter.wordCount).toBeGreaterThan(0);
          }
          
          // 3. 元数据保持（HTML解析会清理空白字符）
          expect(parsedBook.metadata.title.trim()).toBe(bookData.title.trim());
          expect(parsedBook.metadata.author.trim()).toBe(bookData.author.trim());
          
          // 4. 总字数统计合理
          expect(parsedBook.totalWordCount).toBeGreaterThan(0);
          expect(parsedBook.totalWordCount).toBe(
            parsedBook.chapters.reduce((sum: number, ch: any) => sum + ch.wordCount, 0)
          );
        }
      ), { numRuns: 100 });
    });
  });
});
