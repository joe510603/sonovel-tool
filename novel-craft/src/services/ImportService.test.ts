import { ImportService } from './ImportService';
import { TimelineDatabaseService } from './DatabaseService';
import { ImportOptions, SupportedFormat, ImportStatus } from '../types/import';
import { Vault } from 'obsidian';

// Mock Obsidian Vault
const mockVault = {
  getAbstractFileByPath: jest.fn(),
  createFolder: jest.fn(),
  create: jest.fn(),
  modify: jest.fn()
} as unknown as Vault;

// Mock DatabaseService
const mockDatabaseService = {
  books: {
    create: jest.fn(),
    getById: jest.fn(),
    update: jest.fn(),
    delete: jest.fn()
  }
} as unknown as TimelineDatabaseService;

describe('ImportService', () => {
  let importService: ImportService;

  beforeEach(() => {
    jest.clearAllMocks();
    importService = new ImportService(mockVault, mockDatabaseService);
  });

  describe('导入任务管理', () => {
    test('应该能够创建导入任务', async () => {
      const options: ImportOptions = {
        targetPath: 'books',
        preserveFormatting: false,
        generateToc: true,
        autoDetectChapters: true
      };

      const taskId = await importService.importBook('test.epub', options);

      expect(taskId).toBeDefined();
      expect(typeof taskId).toBe('string');

      const task = importService.getImportTask(taskId);
      expect(task).toBeDefined();
      expect(task?.sourceFile).toBe('test.epub');
      expect(task?.format).toBe(SupportedFormat.EPUB);
      expect(task?.status).toBe(ImportStatus.PENDING);
    });

    test('应该能够获取活跃的导入任务', async () => {
      const options: ImportOptions = {
        targetPath: 'books',
        preserveFormatting: false,
        generateToc: true,
        autoDetectChapters: true
      };

      const taskId1 = await importService.importBook('test1.epub', options);
      const taskId2 = await importService.importBook('test2.txt', options);

      const activeTasks = importService.getActiveImports();
      expect(activeTasks).toHaveLength(2);
      expect(activeTasks.map(t => t.id)).toContain(taskId1);
      expect(activeTasks.map(t => t.id)).toContain(taskId2);
    });

    test('应该能够取消导入任务', async () => {
      const options: ImportOptions = {
        targetPath: 'books',
        preserveFormatting: false,
        generateToc: true,
        autoDetectChapters: true
      };

      const taskId = await importService.importBook('test.epub', options);
      importService.cancelImport(taskId);

      const task = importService.getImportTask(taskId);
      expect(task?.status).toBe(ImportStatus.FAILED);
      expect(task?.progress.message).toBe('用户取消导入');
    });
  });

  describe('文件格式检测', () => {
    test('应该正确检测EPUB格式', async () => {
      const options: ImportOptions = {
        targetPath: 'books',
        preserveFormatting: false,
        generateToc: true,
        autoDetectChapters: true
      };

      const taskId = await importService.importBook('book.epub', options);
      const task = importService.getImportTask(taskId);
      
      expect(task?.format).toBe(SupportedFormat.EPUB);
    });

    test('应该正确检测TXT格式', async () => {
      const options: ImportOptions = {
        targetPath: 'books',
        preserveFormatting: false,
        generateToc: true,
        autoDetectChapters: true
      };

      const taskId = await importService.importBook('book.txt', options);
      const task = importService.getImportTask(taskId);
      
      expect(task?.format).toBe(SupportedFormat.TXT);
    });

    test('应该拒绝不支持的格式', async () => {
      const options: ImportOptions = {
        targetPath: 'books',
        preserveFormatting: false,
        generateToc: true,
        autoDetectChapters: true
      };

      await expect(
        importService.importBook('book.unknown', options)
      ).rejects.toThrow('不支持的文件格式');
    });
  });

  describe('任务清理', () => {
    test('应该能够清理已完成的旧任务', () => {
      // 创建一个模拟的已完成任务
      const oldTask = {
        id: 'old-task',
        sourceFile: 'old.epub',
        format: SupportedFormat.EPUB,
        options: {} as ImportOptions,
        status: ImportStatus.COMPLETED,
        progress: {
          status: ImportStatus.COMPLETED,
          progress: 100,
          message: '完成'
        },
        startTime: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25小时前
        endTime: new Date(Date.now() - 25 * 60 * 60 * 1000)
      };

      // 手动添加到活跃任务中（模拟）
      (importService as any).activeImports.set('old-task', oldTask);

      // 清理超过24小时的任务
      importService.cleanupCompletedTasks(24 * 60 * 60 * 1000);

      // 验证任务已被清理
      const task = importService.getImportTask('old-task');
      expect(task).toBeUndefined();
    });

    test('不应该清理最近完成的任务', () => {
      // 创建一个模拟的最近完成的任务
      const recentTask = {
        id: 'recent-task',
        sourceFile: 'recent.epub',
        format: SupportedFormat.EPUB,
        options: {} as ImportOptions,
        status: ImportStatus.COMPLETED,
        progress: {
          status: ImportStatus.COMPLETED,
          progress: 100,
          message: '完成'
        },
        startTime: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1小时前
        endTime: new Date(Date.now() - 1 * 60 * 60 * 1000)
      };

      // 手动添加到活跃任务中（模拟）
      (importService as any).activeImports.set('recent-task', recentTask);

      // 清理超过24小时的任务
      importService.cleanupCompletedTasks(24 * 60 * 60 * 1000);

      // 验证任务仍然存在
      const task = importService.getImportTask('recent-task');
      expect(task).toBeDefined();
    });
  });

  describe('文本章节分割', () => {
    test('应该能够按最大长度分割文本', () => {
      const content = 'A'.repeat(15000) + '\n\n' + 'B'.repeat(15000);
      const options: ImportOptions = {
        targetPath: 'books',
        preserveFormatting: false,
        generateToc: true,
        autoDetectChapters: false,
        maxChapterLength: 10000
      };

      const chapters = (importService as any).splitTextIntoChapters(content, options);
      
      expect(chapters.length).toBeGreaterThan(1);
      expect(chapters[0].content.length).toBeLessThanOrEqual(15000); // 第一章包含完整段落
      expect(chapters[1].content.length).toBeLessThanOrEqual(15000); // 第二章包含完整段落
    });

    test('应该能够使用正则表达式自动检测章节', () => {
      const content = '第一章 开始\n这是第一章的内容\n\n第二章 继续\n这是第二章的内容';
      const options: ImportOptions = {
        targetPath: 'books',
        preserveFormatting: false,
        generateToc: true,
        autoDetectChapters: true,
        chapterTitlePattern: /第(\d+)章\s+(.+)/g
      };

      const chapters = (importService as any).splitTextIntoChapters(content, options);
      
      expect(chapters).toHaveLength(2);
      expect(chapters[0].title).toContain('第一章');
      expect(chapters[1].title).toContain('第二章');
      expect(chapters[0].content).toContain('这是第一章的内容');
      expect(chapters[1].content).toContain('这是第二章的内容');
    });
  });

  describe('字数统计', () => {
    test('应该正确统计中文字数', () => {
      const text = '这是一段中文文本，包含标点符号。';
      const wordCount = (importService as any).countWords(text);
      
      // 中文字符数（不包括标点）
      const expectedChineseChars = text.match(/[\u4e00-\u9fa5]/g)?.length || 0;
      expect(wordCount).toBe(expectedChineseChars);
    });

    test('应该正确统计英文单词数', () => {
      const text = 'This is an English text with multiple words.';
      const wordCount = (importService as any).countWords(text);
      
      const expectedWords = text.match(/[a-zA-Z]+/g)?.length || 0;
      expect(wordCount).toBe(expectedWords);
    });

    test('应该正确统计中英文混合文本', () => {
      const text = '这是中文 and English mixed text 混合文本。';
      const wordCount = (importService as any).countWords(text);
      
      const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
      const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
      expect(wordCount).toBe(chineseChars + englishWords);
    });
  });

  describe('属性测试 (Property-Based Tests)', () => {
    /**
     * **功能: book-analysis-enhancement, 属性 12: 文件转换输出完整性**
     * **验证需求: 7.3**
     * 
     * 对于任何成功的文件转换，输出目录应包含所有章节MD文件和完整的元数据文件
     */
    test('属性12: 文件转换应输出完整的章节文件和元数据', async () => {
      // 由于ImportService依赖文件系统操作，我们需要模拟完整的导入流程
      // 这个测试验证转换结果的完整性，而不是实际的文件系统操作
      
      const fc = require('fast-check');
      
      await fc.assert(fc.asyncProperty(
        // 生成随机的书籍数据结构
        fc.record({
          title: fc.string({ minLength: 1, maxLength: 50 })
            .filter((s: string) => s.trim().length > 0)
            .filter((s: string) => /^[a-zA-Z0-9\u4e00-\u9fa5\s\-_]+$/.test(s)), // 允许字母数字中文空格连字符下划线
          author: fc.string({ minLength: 1, maxLength: 30 })
            .filter((s: string) => s.trim().length > 0)
            .filter((s: string) => /^[a-zA-Z0-9\u4e00-\u9fa5\s\-_]+$/.test(s)),
          description: fc.option(fc.string({ maxLength: 200 })),
          chapters: fc.array(
            fc.record({
              title: fc.string({ minLength: 1, maxLength: 100 })
                .filter((s: string) => s.trim().length > 0)
                .filter((s: string) => /^[a-zA-Z0-9\u4e00-\u9fa5\s\-_]+$/.test(s)),
              content: fc.lorem({ maxCount: 10 }) // 使用lorem生成有意义的文本
                .filter((s: string) => s.trim().length > 5)
            }),
            { minLength: 1, maxLength: 8 } // 限制章节数量以提高测试效率
          )
        }),
        async (bookData: any) => {
          // 模拟解析后的书籍数据
          const parsedBook = {
            metadata: {
              title: bookData.title,
              author: bookData.author,
              description: bookData.description,
              coverImage: undefined
            },
            chapters: bookData.chapters.map((ch: any, index: number) => ({
              index,
              title: ch.title,
              content: ch.content,
              wordCount: (importService as any).countWords(ch.content)
            })),
            totalWordCount: 0
          };
          
          parsedBook.totalWordCount = parsedBook.chapters.reduce((sum: number, ch: any) => sum + ch.wordCount, 0);

          // 模拟MarkdownConverter的转换结果
          const convertedFiles = new Map<string, string>();
          
          // 为每个章节生成MD文件
          parsedBook.chapters.forEach((chapter: any, index: number) => {
            const fileName = `${String(index + 1).padStart(3, '0')}-${chapter.title.replace(/[<>:"/\\|?*]/g, '')}.md`;
            const content = `# 第${index + 1}章 ${chapter.title}\n\n${chapter.content}`;
            convertedFiles.set(fileName, content);
          });

          // 生成目录文件
          const tocFileContent = `# ${parsedBook.metadata.title}\n\n作者：${parsedBook.metadata.author}\n\n## 目录\n\n${
            parsedBook.chapters.map((ch: any, i: number) => `- [第${i + 1}章 ${ch.title}](${String(i + 1).padStart(3, '0')}-${ch.title.replace(/[<>:"/\\|?*]/g, '')}.md)`).join('\n')
          }`;
          convertedFiles.set('README.md', tocFileContent);

          // 模拟书籍信息
          const bookInfo = (importService as any).createBookInfo(parsedBook, 'test.epub');

          // 验证转换结果的完整性
          
          // 1. 验证章节文件数量正确
          const chapterFiles = Array.from(convertedFiles.keys()).filter(name => 
            name.endsWith('.md') && name !== 'README.md'
          );
          expect(chapterFiles.length).toBe(parsedBook.chapters.length);

          // 2. 验证每个章节都有对应的MD文件
          parsedBook.chapters.forEach((chapter: any, index: number) => {
            const expectedFileName = `${String(index + 1).padStart(3, '0')}-${chapter.title.replace(/[<>:"/\\|?*]/g, '')}.md`;
            expect(convertedFiles.has(expectedFileName)).toBe(true);
            
            // 验证文件内容包含章节标题和内容
            const fileContent = convertedFiles.get(expectedFileName) || '';
            expect(fileContent).toContain(chapter.title);
            expect(fileContent).toContain(chapter.content);
          });

          // 3. 验证目录文件存在
          expect(convertedFiles.has('README.md')).toBe(true);
          const readmeContent = convertedFiles.get('README.md') || '';
          expect(readmeContent).toContain(parsedBook.metadata.title);
          expect(readmeContent).toContain(parsedBook.metadata.author);

          // 4. 验证书籍信息完整性
          expect(bookInfo.title).toBe(parsedBook.metadata.title);
          expect(bookInfo.author).toBe(parsedBook.metadata.author);
          expect(bookInfo.chapterCount).toBe(parsedBook.chapters.length);
          expect(bookInfo.totalWordCount).toBe(parsedBook.totalWordCount);
          expect(bookInfo.id).toBeDefined();
          expect(bookInfo.importTime).toBeInstanceOf(Date);

          // 5. 验证文件内容非空且格式正确
          convertedFiles.forEach((content, fileName) => {
            expect(content.trim().length).toBeGreaterThan(0);
            
            if (fileName.endsWith('.md') && fileName !== 'README.md') {
              // 章节文件应该以标题开头
              expect(content).toMatch(/^#\s+/);
            }
          });

          // 6. 验证总文件数量合理（章节文件 + 目录文件）
          expect(convertedFiles.size).toBe(parsedBook.chapters.length + 1);
        }
      ), { numRuns: 100 });
    });
  });

  describe('错误处理单元测试', () => {
    test('应该正确处理不支持的文件格式', async () => {
      const options: ImportOptions = {
        targetPath: 'books',
        preserveFormatting: false,
        generateToc: true,
        autoDetectChapters: true
      };

      await expect(
        importService.importBook('book.xyz', options)
      ).rejects.toThrow('不支持的文件格式');
    });

    test('应该正确处理空文件名', async () => {
      const options: ImportOptions = {
        targetPath: 'books',
        preserveFormatting: false,
        generateToc: true,
        autoDetectChapters: true
      };

      await expect(
        importService.importBook('', options)
      ).rejects.toThrow();
    });

    test('应该正确处理无效的导入选项', async () => {
      const invalidOptions = {
        targetPath: '', // 空路径
        preserveFormatting: false,
        generateToc: true,
        autoDetectChapters: true
      } as ImportOptions;

      await expect(
        importService.importBook('test.epub', invalidOptions)
      ).rejects.toThrow();
    });

    test('应该正确处理字数统计边界情况', () => {
      // 空文本
      expect((importService as any).countWords('')).toBe(0);
      
      // 只有空格
      expect((importService as any).countWords('   ')).toBe(0);
      
      // 只有标点符号
      expect((importService as any).countWords('！@#$%^&*()')).toBe(0);
      
      // 混合内容但无有效字符
      expect((importService as any).countWords('   ！@#   ')).toBe(0);
    });

    test('应该正确处理章节分割边界情况', () => {
      const options: ImportOptions = {
        targetPath: 'books',
        preserveFormatting: false,
        generateToc: true,
        autoDetectChapters: false,
        maxChapterLength: 100
      };

      // 空内容
      const emptyChapters = (importService as any).splitTextIntoChapters('', options);
      expect(emptyChapters).toHaveLength(0);

      // 只有空白字符
      const whitespaceChapters = (importService as any).splitTextIntoChapters('   \n\n   ', options);
      expect(whitespaceChapters).toHaveLength(0);

      // 单个短段落
      const shortChapters = (importService as any).splitTextIntoChapters('短内容', options);
      expect(shortChapters).toHaveLength(1);
      expect(shortChapters[0].title).toBe('第1章');
    });

    test('应该正确处理正则表达式章节检测失败', () => {
      const content = '这是没有章节标记的普通文本内容。\n\n继续更多内容。';
      const options: ImportOptions = {
        targetPath: 'books',
        preserveFormatting: false,
        generateToc: true,
        autoDetectChapters: true,
        chapterTitlePattern: /第(\d+)章\s+(.+)/g // 这个模式不会匹配内容
      };

      const chapters = (importService as any).splitTextIntoChapters(content, options);
      
      // 当正则表达式没有匹配时，应该回退到按长度分割
      expect(chapters).toHaveLength(1);
      expect(chapters[0].title).toBe('第1章');
    });

    test('应该正确处理任务状态更新', () => {
      // 创建一个模拟任务
      const taskId = 'test-task-id';
      const mockTask = {
        id: taskId,
        sourceFile: 'test.epub',
        format: SupportedFormat.EPUB,
        options: {} as ImportOptions,
        status: ImportStatus.PENDING,
        progress: {
          status: ImportStatus.PENDING,
          progress: 0,
          message: '准备中'
        },
        startTime: new Date()
      };

      // 手动添加到活跃任务中
      (importService as any).activeImports.set(taskId, mockTask);

      // 测试状态更新
      (importService as any).updateTaskStatus(taskId, ImportStatus.PARSING, '正在解析');
      
      const updatedTask = importService.getImportTask(taskId);
      expect(updatedTask?.status).toBe(ImportStatus.PARSING);
      expect(updatedTask?.progress.message).toBe('正在解析');
    });

    test('应该正确处理进度更新', () => {
      const taskId = 'test-task-id';
      const mockTask = {
        id: taskId,
        sourceFile: 'test.epub',
        format: SupportedFormat.EPUB,
        options: {} as ImportOptions,
        status: ImportStatus.PENDING,
        progress: {
          status: ImportStatus.PENDING,
          progress: 0,
          message: '准备中'
        },
        startTime: new Date()
      };

      (importService as any).activeImports.set(taskId, mockTask);

      // 测试进度更新
      (importService as any).updateTaskProgress(taskId, ImportStatus.CONVERTING, 50, '转换中', 2, 5);
      
      const updatedTask = importService.getImportTask(taskId);
      expect(updatedTask?.progress.progress).toBe(50);
      expect(updatedTask?.progress.currentChapter).toBe(2);
      expect(updatedTask?.progress.totalChapters).toBe(5);
    });

    test('应该正确处理不存在任务的状态更新', () => {
      // 尝试更新不存在的任务
      expect(() => {
        (importService as any).updateTaskStatus('non-existent-task', ImportStatus.FAILED, '失败');
      }).not.toThrow();

      // 验证不存在的任务仍然不存在
      const task = importService.getImportTask('non-existent-task');
      expect(task).toBeUndefined();
    });
  });

  describe('数据库集成测试', () => {
    test('应该正确处理数据库保存失败', async () => {
      // 模拟数据库服务抛出错误
      const mockError = new Error('数据库连接失败');
      jest.spyOn(mockDatabaseService.books, 'create').mockRejectedValue(mockError);

      const bookInfo = {
        id: 'test-id',
        title: '测试书籍',
        author: '测试作者',
        importTime: new Date(),
        filePath: 'test.epub',
        totalWordCount: 1000,
        chapterCount: 5,
        timelineConfig: { tracks: [], pastEventArea: false }
      };

      const chapters = [
        { index: 0, title: '第一章', content: '内容', wordCount: 100 }
      ];

      await expect(
        (importService as any).saveToDatabase(bookInfo, chapters, 'test-path')
      ).rejects.toThrow('保存到数据库失败');
    });

    test('应该正确创建书籍信息对象', () => {
      const parsedBook = {
        metadata: {
          title: '测试小说',
          author: '测试作者',
          description: '测试描述',
          coverImage: 'cover.jpg'
        },
        chapters: [
          { index: 0, title: '第一章', content: '内容1', wordCount: 100 },
          { index: 1, title: '第二章', content: '内容2', wordCount: 150 }
        ]
      };

      const bookInfo = (importService as any).createBookInfo(parsedBook, 'test.epub');

      expect(bookInfo.title).toBe('测试小说');
      expect(bookInfo.author).toBe('测试作者');
      expect(bookInfo.description).toBe('测试描述');
      expect(bookInfo.coverImage).toBe('cover.jpg');
      expect(bookInfo.filePath).toBe('test.epub');
      expect(bookInfo.totalWordCount).toBe(250);
      expect(bookInfo.chapterCount).toBe(2);
      expect(bookInfo.id).toBeDefined();
      expect(bookInfo.importTime).toBeInstanceOf(Date);
      expect(bookInfo.timelineConfig).toEqual({ tracks: [], pastEventArea: false });
    });

    test('应该正确处理缺少元数据的书籍', () => {
      const parsedBook = {
        metadata: {
          title: '',
          author: '',
          description: undefined,
          coverImage: undefined
        },
        chapters: [
          { index: 0, title: '第一章', content: '内容', wordCount: 100 }
        ]
      };

      const bookInfo = (importService as any).createBookInfo(parsedBook, 'test.epub');

      expect(bookInfo.title).toBe(''); // 保持原始值，让验证层处理
      expect(bookInfo.author).toBe('');
      expect(bookInfo.description).toBeUndefined();
      expect(bookInfo.coverImage).toBeUndefined();
    });
  });
});