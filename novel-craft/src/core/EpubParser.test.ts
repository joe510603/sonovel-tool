import { EpubParser, EpubParseError } from './EpubParser';
import JSZip from 'jszip';

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

    it('should throw EpubParseError for invalid epub data', async () => {
      const invalidData = new ArrayBuffer(10);

      await expect(parser.parse(invalidData)).rejects.toThrow(EpubParseError);
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

      expect(() => parser.getChapter(book, -1)).toThrow(EpubParseError);
      expect(() => parser.getChapter(book, 5)).toThrow(EpubParseError);
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
  });
});
