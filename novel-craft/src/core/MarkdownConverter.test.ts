import { MarkdownConverter } from './MarkdownConverter';
import { Chapter, BookMetadata } from '../types';
import { ConversionOptions } from '../types/import';

describe('MarkdownConverter', () => {
  let converter: MarkdownConverter;
  let sampleChapter: Chapter;
  let sampleBookInfo: BookMetadata;

  beforeEach(() => {
    converter = new MarkdownConverter();
    
    sampleChapter = {
      index: 0,
      title: '测试章节',
      content: '这是一个测试章节的内容。\n\n包含多个段落。\n\n还有更多内容。',
      wordCount: 20
    };

    sampleBookInfo = {
      title: '测试书籍',
      author: '测试作者',
      description: '这是一本测试书籍的描述',
      coverImage: 'cover.jpg'
    };
  });

  describe('章节转换', () => {
    test('应该能够转换基本章节', () => {
      const result = converter.convertChapter(sampleChapter);
      
      expect(result).toContain('# 第1章 测试章节');
      expect(result).toContain('这是一个测试章节的内容。');
      expect(result).toContain('包含多个段落。');
      expect(result).toContain('还有更多内容。');
      expect(result).toContain('---'); // 分隔线
    });

    test('应该支持自定义转换选项', () => {
      const options: ConversionOptions = {
        preserveHtml: false,
        addChapterNumbers: false,
        titleLevel: 2,
        addSeparators: false
      };

      const result = converter.convertChapter(sampleChapter, options);
      
      expect(result).toContain('## 测试章节'); // 标题级别为2，不包含章节编号
      expect(result).not.toContain('第1章'); // 不添加章节编号
      expect(result).not.toContain('---'); // 不添加分隔线
    });

    test('应该能够移除HTML标签', () => {
      const chapterWithHtml: Chapter = {
        index: 0,
        title: '包含HTML的章节',
        content: '这是<strong>粗体</strong>文本和<em>斜体</em>文本。\n\n还有<a href="#">链接</a>。',
        wordCount: 15
      };

      const result = converter.convertChapter(chapterWithHtml);
      
      expect(result).not.toContain('<strong>');
      expect(result).not.toContain('</strong>');
      expect(result).not.toContain('<em>');
      expect(result).not.toContain('</em>');
      expect(result).not.toContain('<a href="#">');
      expect(result).not.toContain('</a>');
      expect(result).toContain('粗体');
      expect(result).toContain('斜体');
      expect(result).toContain('链接');
    });
  });

  describe('目录生成', () => {
    test('应该能够生成基本目录', () => {
      const chapters: Chapter[] = [
        { index: 0, title: '第一章', content: '内容1', wordCount: 100 },
        { index: 1, title: '第二章', content: '内容2', wordCount: 150 },
        { index: 2, title: '第三章', content: '内容3', wordCount: 200 }
      ];

      const toc = converter.generateToc(chapters, sampleBookInfo);
      
      expect(toc).toContain('# 测试书籍');
      expect(toc).toContain('**作者**: 测试作者');
      expect(toc).toContain('**简介**: 这是一本测试书籍的描述');
      expect(toc).toContain('**总章节数**: 3');
      expect(toc).toContain('**总字数**: 450');
      expect(toc).toContain('## 目录');
      expect(toc).toContain('- [第1章 第一章](./001-第一章.md) (100字)');
      expect(toc).toContain('- [第2章 第二章](./002-第二章.md) (150字)');
      expect(toc).toContain('- [第3章 第三章](./003-第三章.md) (200字)');
    });

    test('应该处理没有描述的书籍', () => {
      const bookInfoWithoutDesc: BookMetadata = {
        title: '无描述书籍',
        author: '作者',
        description: undefined,
        coverImage: undefined
      };

      const chapters: Chapter[] = [
        { index: 0, title: '章节', content: '内容', wordCount: 50 }
      ];

      const toc = converter.generateToc(chapters, bookInfoWithoutDesc);
      
      expect(toc).toContain('# 无描述书籍');
      expect(toc).toContain('**作者**: 作者');
      expect(toc).not.toContain('**简介**:');
    });
  });

  describe('元数据生成', () => {
    test('应该能够生成JSON格式的元数据', () => {
      const metadata = converter.generateMetadata(sampleBookInfo);
      const parsed = JSON.parse(metadata);
      
      expect(parsed.title).toBe('测试书籍');
      expect(parsed.author).toBe('测试作者');
      expect(parsed.description).toBe('这是一本测试书籍的描述');
      expect(parsed.coverImage).toBe('cover.jpg');
      expect(parsed.version).toBe('1.0.0');
      expect(parsed.importTime).toBeDefined();
    });

    test('应该处理缺少可选字段的元数据', () => {
      const minimalBookInfo: BookMetadata = {
        title: '最小书籍',
        author: '作者',
        description: undefined,
        coverImage: undefined
      };

      const metadata = converter.generateMetadata(minimalBookInfo);
      const parsed = JSON.parse(metadata);
      
      expect(parsed.title).toBe('最小书籍');
      expect(parsed.author).toBe('作者');
      expect(parsed.description).toBeUndefined();
      expect(parsed.coverImage).toBeUndefined();
    });
  });

  describe('批量转换', () => {
    test('应该能够批量转换所有章节', () => {
      const chapters: Chapter[] = [
        { index: 0, title: '第一章', content: '第一章内容', wordCount: 50 },
        { index: 1, title: '第二章', content: '第二章内容', wordCount: 60 }
      ];

      const results = converter.convertAllChapters(chapters, sampleBookInfo);
      
      expect(results.size).toBe(4); // 2个章节 + README.md + book.json
      expect(results.has('001-第一章.md')).toBe(true);
      expect(results.has('002-第二章.md')).toBe(true);
      expect(results.has('README.md')).toBe(true);
      expect(results.has('book.json')).toBe(true);

      const chapter1Content = results.get('001-第一章.md');
      expect(chapter1Content).toContain('# 第1章 第一章');
      expect(chapter1Content).toContain('第一章内容');
    });
  });

  describe('文件名生成', () => {
    test('应该生成标准化的章节文件名', () => {
      const chapter: Chapter = {
        index: 4,
        title: '特殊字符<>:"/\\|?*章节',
        content: '内容',
        wordCount: 10
      };

      const fileName = converter.generateChapterFileName(chapter);
      
      expect(fileName).toBe('005-特殊字符章节.md');
      expect(fileName).not.toContain('<');
      expect(fileName).not.toContain('>');
      expect(fileName).not.toContain(':');
      expect(fileName).not.toContain('"');
      expect(fileName).not.toContain('/');
      expect(fileName).not.toContain('\\');
      expect(fileName).not.toContain('|');
      expect(fileName).not.toContain('?');
      expect(fileName).not.toContain('*');
    });

    test('应该处理长标题', () => {
      const longTitle = 'A'.repeat(100);
      const chapter: Chapter = {
        index: 0,
        title: longTitle,
        content: '内容',
        wordCount: 10
      };

      const fileName = converter.generateChapterFileName(chapter);
      
      expect(fileName.length).toBeLessThanOrEqual(57); // 001- + 50字符 + .md
      expect(fileName).toMatch(/^001-A+\.md$/);
    });

    test('应该处理空格和特殊字符', () => {
      const chapter: Chapter = {
        index: 0,
        title: '第 一 章   测试',
        content: '内容',
        wordCount: 10
      };

      const fileName = converter.generateChapterFileName(chapter);
      
      expect(fileName).toBe('001-第-一-章-测试.md');
    });
  });

  describe('转换结果验证', () => {
    test('应该验证有效的转换结果', () => {
      const validResults = new Map<string, string>([
        ['README.md', '# 书籍标题\n内容'],
        ['book.json', '{"title": "书籍"}'],
        ['001-章节.md', '# 第1章 章节\n内容']
      ]);

      const isValid = converter.validateConversionResults(validResults);
      expect(isValid).toBe(true);
    });

    test('应该拒绝缺少必需文件的结果', () => {
      const invalidResults = new Map<string, string>([
        ['001-章节.md', '# 第1章 章节\n内容']
        // 缺少 README.md 和 book.json
      ]);

      const isValid = converter.validateConversionResults(invalidResults);
      expect(isValid).toBe(false);
    });

    test('应该拒绝包含空文件的结果', () => {
      const invalidResults = new Map<string, string>([
        ['README.md', ''],
        ['book.json', '{"title": "书籍"}'],
        ['001-章节.md', '# 第1章 章节\n内容']
      ]);

      const isValid = converter.validateConversionResults(invalidResults);
      expect(isValid).toBe(false);
    });

    test('应该拒绝没有章节文件的结果', () => {
      const invalidResults = new Map<string, string>([
        ['README.md', '# 书籍标题\n内容'],
        ['book.json', '{"title": "书籍"}']
        // 没有章节文件
      ]);

      const isValid = converter.validateConversionResults(invalidResults);
      expect(isValid).toBe(false);
    });
  });

  describe('转换统计', () => {
    test('应该生成正确的转换统计信息', () => {
      const chapters: Chapter[] = [
        { index: 0, title: '第一章', content: '内容1', wordCount: 100 },
        { index: 1, title: '第二章', content: '内容2', wordCount: 150 }
      ];

      const results = new Map<string, string>([
        ['README.md', '目录内容'],
        ['book.json', '{"title": "书籍"}'],
        ['001-第一章.md', '第一章内容'],
        ['002-第二章.md', '第二章内容']
      ]);

      const startTime = Date.now() - 1000; // 1秒前开始
      const stats = converter.generateConversionStats(chapters, results, startTime);

      expect(stats.conversionTime).toBeGreaterThan(0);
      expect(stats.conversionTime).toBeLessThan(2000); // 应该小于2秒
      expect(stats.chaptersGenerated).toBe(2);
      expect(stats.totalFileSize).toBeGreaterThan(0);
    });
  });
});