import { FileOrganizer } from './FileOrganizer';
import { BookInfo } from '../types/import';
import { Chapter } from '../types';
import { TFile, TFolder, Vault } from 'obsidian';

// Mock Obsidian types
const mockTFile = {
  path: 'test.md',
  stat: { size: 1000 }
} as TFile;

const mockTFolder = {
  path: 'test-folder',
  children: [],
  isRoot: false,
  vault: null,
  name: 'test-folder',
  parent: null
} as unknown as TFolder;

// Mock Vault
const mockVault = {
  getAbstractFileByPath: jest.fn(),
  createFolder: jest.fn(),
  create: jest.fn(),
  modify: jest.fn()
} as unknown as Vault;

describe('FileOrganizer', () => {
  let fileOrganizer: FileOrganizer;
  let sampleBookInfo: BookInfo;
  let sampleChapter: Chapter;

  beforeEach(() => {
    jest.clearAllMocks();
    fileOrganizer = new FileOrganizer(mockVault);
    
    sampleBookInfo = {
      id: 'book-1',
      title: '测试书籍',
      author: '测试作者',
      description: '测试描述',
      publishInfo: undefined,
      importTime: new Date(),
      filePath: 'test.epub',
      coverImage: undefined,
      totalWordCount: 50000,
      chapterCount: 10,
      timelineConfig: {
        tracks: [],
        pastEventArea: false
      }
    };

    sampleChapter = {
      index: 0,
      title: '第一章',
      content: '这是第一章的内容',
      wordCount: 100
    };
  });

  describe('目录创建', () => {
    test('应该能够创建书籍目录', async () => {
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

      const bookPath = await fileOrganizer.createBookDirectory(sampleBookInfo, 'books');
      
      expect(bookPath).toBe('books/《测试书籍》- 测试作者');
      expect(mockVault.createFolder).toHaveBeenCalled();
    });

    test('应该处理目录已存在的情况', async () => {
      (mockVault.getAbstractFileByPath as jest.Mock)
        .mockReturnValueOnce(mockTFolder) // 第一次检查返回已存在的文件夹
        .mockReturnValueOnce(null); // 第二次检查唯一名称时返回null

      const bookPath = await fileOrganizer.createBookDirectory(sampleBookInfo, 'books');
      
      expect(bookPath).toBe('books/《测试书籍》- 测试作者 (1)');
      expect(mockVault.createFolder).toHaveBeenCalled();
    });

    test('应该清理书名中的非法字符', async () => {
      const bookInfoWithSpecialChars: BookInfo = {
        ...sampleBookInfo,
        title: '测试<>:"/\\|?*书籍',
        author: '测试<>:"/\\|?*作者'
      };

      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

      const bookPath = await fileOrganizer.createBookDirectory(bookInfoWithSpecialChars, 'books');
      
      expect(bookPath).toBe('books/《测试书籍》- 测试作者');
      
      // 检查目录名部分（不包括路径分隔符）
      const dirName = bookPath.split('/').pop() || '';
      expect(dirName).not.toContain('<');
      expect(dirName).not.toContain('>');
      expect(dirName).not.toContain(':');
      expect(dirName).not.toContain('"');
      expect(dirName).not.toContain('\\');
      expect(dirName).not.toContain('|');
      expect(dirName).not.toContain('?');
      expect(dirName).not.toContain('*');
    });
  });

  describe('章节文件保存', () => {
    test('应该能够保存章节文件', async () => {
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

      const filePath = await fileOrganizer.saveChapterFile(
        sampleChapter, 
        'books/test-book', 
        '# 第1章 第一章\n\n这是第一章的内容'
      );
      
      expect(filePath).toBe('books/test-book/001-第一章.md');
      expect(mockVault.create).toHaveBeenCalledWith(
        'books/test-book/001-第一章.md',
        '# 第1章 第一章\n\n这是第一章的内容'
      );
    });

    test('应该处理文件已存在的情况', async () => {
      (mockVault.getAbstractFileByPath as jest.Mock)
        .mockReturnValueOnce(mockTFile) // 第一次检查返回已存在的文件
        .mockReturnValueOnce(null); // 第二次检查唯一名称时返回null

      const filePath = await fileOrganizer.saveChapterFile(
        sampleChapter, 
        'books/test-book', 
        '# 第1章 第一章\n\n这是第一章的内容'
      );
      
      expect(filePath).toBe('books/test-book/001-第一章 (1).md');
      expect(mockVault.create).toHaveBeenCalledWith(
        'books/test-book/001-第一章 (1).md',
        '# 第1章 第一章\n\n这是第一章的内容'
      );
    });

    test('应该生成正确的章节文件名', async () => {
      const chapterWithSpecialTitle: Chapter = {
        index: 9,
        title: '特殊<>:"/\\|?*章节',
        content: '内容',
        wordCount: 50
      };

      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

      const filePath = await fileOrganizer.saveChapterFile(
        chapterWithSpecialTitle, 
        'books/test-book', 
        '内容'
      );
      
      expect(filePath).toBe('books/test-book/010-特殊章节.md');
    });
  });

  describe('元数据文件保存', () => {
    test('应该能够保存元数据文件', async () => {
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

      const filePath = await fileOrganizer.saveMetadataFile(sampleBookInfo, 'books/test-book');
      
      expect(filePath).toBe('books/test-book/book.json');
      expect(mockVault.create).toHaveBeenCalled();
      
      const createCall = (mockVault.create as jest.Mock).mock.calls[0];
      expect(createCall[0]).toBe('books/test-book/book.json');
      
      const metadataContent = JSON.parse(createCall[1]);
      expect(metadataContent.id).toBe('book-1');
      expect(metadataContent.title).toBe('测试书籍');
      expect(metadataContent.author).toBe('测试作者');
      expect(metadataContent.version).toBe('1.0.0');
    });

    test('应该覆盖已存在的元数据文件', async () => {
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(mockTFile);

      const filePath = await fileOrganizer.saveMetadataFile(sampleBookInfo, 'books/test-book');
      
      expect(filePath).toBe('books/test-book/book.json');
      expect(mockVault.modify).toHaveBeenCalled();
      expect(mockVault.create).not.toHaveBeenCalled();
    });
  });

  describe('目录文件保存', () => {
    test('应该能够保存目录文件', async () => {
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

      const tocContent = '# 测试书籍\n\n## 目录\n\n- 第一章';
      const filePath = await fileOrganizer.saveTocFile('books/test-book', tocContent);
      
      expect(filePath).toBe('books/test-book/README.md');
      expect(mockVault.create).toHaveBeenCalledWith(
        'books/test-book/README.md',
        tocContent
      );
    });

    test('应该覆盖已存在的目录文件', async () => {
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(mockTFile);

      const tocContent = '# 测试书籍\n\n## 目录\n\n- 第一章';
      const filePath = await fileOrganizer.saveTocFile('books/test-book', tocContent);
      
      expect(filePath).toBe('books/test-book/README.md');
      expect(mockVault.modify).toHaveBeenCalledWith(mockTFile, tocContent);
      expect(mockVault.create).not.toHaveBeenCalled();
    });
  });

  describe('批量文件保存', () => {
    test('应该能够批量保存文件', async () => {
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);

      const files = new Map<string, string>([
        ['README.md', '# 目录'],
        ['book.json', '{"title": "书籍"}'],
        ['001-第一章.md', '# 第一章内容']
      ]);

      const savedFiles = await fileOrganizer.saveFiles('books/test-book', files);
      
      expect(savedFiles).toHaveLength(3);
      expect(savedFiles).toContain('books/test-book/README.md');
      expect(savedFiles).toContain('books/test-book/book.json');
      expect(savedFiles).toContain('books/test-book/001-第一章.md');
      expect(mockVault.create).toHaveBeenCalledTimes(3);
    });

    test('应该处理部分文件保存失败的情况', async () => {
      (mockVault.getAbstractFileByPath as jest.Mock).mockReturnValue(null);
      (mockVault.create as jest.Mock)
        .mockResolvedValueOnce(undefined) // 第一个文件成功
        .mockRejectedValueOnce(new Error('保存失败')) // 第二个文件失败
        .mockResolvedValueOnce(undefined); // 第三个文件成功

      const files = new Map<string, string>([
        ['file1.md', '内容1'],
        ['file2.md', '内容2'],
        ['file3.md', '内容3']
      ]);

      const savedFiles = await fileOrganizer.saveFiles('books/test-book', files);
      
      // 应该保存成功的文件，跳过失败的文件
      expect(savedFiles).toHaveLength(2);
      expect(savedFiles).toContain('books/test-book/file1.md');
      expect(savedFiles).toContain('books/test-book/file3.md');
      expect(savedFiles).not.toContain('books/test-book/file2.md');
    });
  });

  describe('路径处理', () => {
    test('应该正确规范化路径', () => {
      const normalizedPath = (fileOrganizer as any).normalizePath('//books\\\\test//');
      expect(normalizedPath).toBe('books/test');
    });

    test('应该正确连接路径', () => {
      const joinedPath = (fileOrganizer as any).joinPath('books/fiction', 'test-book');
      expect(joinedPath).toBe('books/fiction/test-book');
    });

    test('应该处理空路径', () => {
      const joinedPath1 = (fileOrganizer as any).joinPath('', 'test-book');
      expect(joinedPath1).toBe('test-book');

      const joinedPath2 = (fileOrganizer as any).joinPath('books', '');
      expect(joinedPath2).toBe('books');
    });

    test('应该验证路径有效性', () => {
      expect(fileOrganizer.isValidPath('valid/path')).toBe(true);
      expect(fileOrganizer.isValidPath('invalid<path')).toBe(false);
      expect(fileOrganizer.isValidPath('invalid>path')).toBe(false);
      expect(fileOrganizer.isValidPath('invalid:path')).toBe(false);
      expect(fileOrganizer.isValidPath('invalid"path')).toBe(false);
      expect(fileOrganizer.isValidPath('invalid|path')).toBe(false);
      expect(fileOrganizer.isValidPath('invalid?path')).toBe(false);
      expect(fileOrganizer.isValidPath('invalid*path')).toBe(false);
      expect(fileOrganizer.isValidPath('')).toBe(false);
    });
  });

  describe('文件名清理', () => {
    test('应该清理文件名中的非法字符', () => {
      const cleanName = (fileOrganizer as any).sanitizeFileName('测试<>:"/\\|?*文件名');
      expect(cleanName).toBe('测试文件名');
    });

    test('应该规范化空格', () => {
      const cleanName = (fileOrganizer as any).sanitizeFileName('测试   文件   名');
      expect(cleanName).toBe('测试 文件 名');
    });

    test('应该限制文件名长度', () => {
      const longName = 'A'.repeat(100);
      const cleanName = (fileOrganizer as any).sanitizeFileName(longName);
      expect(cleanName.length).toBeLessThanOrEqual(50);
    });

    test('应该处理空文件名', () => {
      const cleanName = (fileOrganizer as any).sanitizeFileName('   ');
      expect(cleanName).toBe('');
    });
  });
});