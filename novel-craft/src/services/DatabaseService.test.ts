/**
 * 数据库服务单元测试
 * 测试数据库CRUD操作和数据完整性
 */

import { TimelineDatabaseService } from './DatabaseService';
import { BookRecord, AIAnalysisRecord, StoryUnitRecord } from '../types/database';
import { DatabaseError } from '../types/errors';

describe('TimelineDatabaseService', () => {
  let dbService: TimelineDatabaseService;

  beforeEach(async () => {
    // 每个测试前创建新的数据库实例
    dbService = new TimelineDatabaseService();
    await dbService.initialize();
    
    // 清空所有数据
    await dbService.clearAll();
  });

  afterEach(async () => {
    // 测试后关闭数据库连接
    dbService.close();
  });

  describe('数据库初始化', () => {
    it('应该成功初始化数据库', async () => {
      const newDbService = new TimelineDatabaseService();
      const result = await newDbService.initialize();
      
      expect(result).toBe(true);
      
      newDbService.close();
    });

    it('应该能够获取数据库连接', async () => {
      const db = await dbService.getDatabase();
      expect(db).toBeDefined();
      expect(db.name).toBe('TimelinePluginDB');
    });
  });

  describe('书籍数据CRUD操作', () => {
    const mockBookData: Omit<BookRecord, 'id' | 'create_time' | 'update_time'> = {
      title: '测试小说',
      author: '测试作者',
      publish_info: '测试出版社',
      import_time: Date.now(),
      file_path: '/test/path/book.epub',
      cover_image: '/test/cover.jpg',
      description: '这是一本测试小说',
      total_word_count: 100000,
      chapter_count: 50
    };

    it('应该能够创建书籍记录', async () => {
      const bookId = await dbService.books.create(mockBookData);
      
      expect(bookId).toBeDefined();
      expect(typeof bookId).toBe('string');
      expect(bookId).toMatch(/^books_\d+_[a-z0-9]+$/);
    });

    it('应该能够根据ID获取书籍记录', async () => {
      const bookId = await dbService.books.create(mockBookData);
      const book = await dbService.books.getById(bookId);
      
      expect(book).toBeDefined();
      expect(book!.id).toBe(bookId);
      expect(book!.title).toBe(mockBookData.title);
      expect(book!.author).toBe(mockBookData.author);
      expect(book!.create_time).toBeDefined();
      expect(book!.update_time).toBeDefined();
    });

    it('应该能够更新书籍记录', async () => {
      const bookId = await dbService.books.create(mockBookData);
      const originalBook = await dbService.books.getById(bookId);
      
      // 等待一毫秒确保更新时间不同
      await new Promise(resolve => setTimeout(resolve, 1));
      
      const updateResult = await dbService.books.update(bookId, {
        title: '更新后的标题',
        description: '更新后的描述'
      });
      
      expect(updateResult).toBe(true);
      
      const updatedBook = await dbService.books.getById(bookId);
      expect(updatedBook!.title).toBe('更新后的标题');
      expect(updatedBook!.description).toBe('更新后的描述');
      expect(updatedBook!.author).toBe(mockBookData.author); // 未更新的字段保持不变
      expect(updatedBook!.update_time).toBeGreaterThan(originalBook!.update_time);
    });

    it('应该能够删除书籍记录', async () => {
      const bookId = await dbService.books.create(mockBookData);
      
      const deleteResult = await dbService.books.delete(bookId);
      expect(deleteResult).toBe(true);
      
      const deletedBook = await dbService.books.getById(bookId);
      expect(deletedBook).toBeNull();
    });

    it('应该能够查询书籍记录', async () => {
      // 创建多个书籍记录
      const book1Id = await dbService.books.create({
        ...mockBookData,
        title: '小说1',
        author: '作者A'
      });
      
      const book2Id = await dbService.books.create({
        ...mockBookData,
        title: '小说2',
        author: '作者A'
      });
      
      const book3Id = await dbService.books.create({
        ...mockBookData,
        title: '小说3',
        author: '作者B'
      });

      // 按作者查询
      const booksByAuthorA = await dbService.books.query({ author: '作者A' });
      expect(booksByAuthorA).toHaveLength(2);
      expect(booksByAuthorA.map(b => b.id).sort()).toEqual([book1Id, book2Id].sort());

      // 按标题查询
      const booksByTitle = await dbService.books.query({ title: '小说1' });
      expect(booksByTitle).toHaveLength(1);
      expect(booksByTitle[0].id).toBe(book1Id);
    });

    it('应该能够获取所有书籍记录', async () => {
      // 创建多个书籍记录
      await dbService.books.create({ ...mockBookData, title: '小说1' });
      await dbService.books.create({ ...mockBookData, title: '小说2' });
      await dbService.books.create({ ...mockBookData, title: '小说3' });

      const allBooks = await dbService.books.getAll();
      expect(allBooks).toHaveLength(3);
      expect(allBooks.map(b => b.title).sort()).toEqual(['小说1', '小说2', '小说3']);
    });
  });

  describe('AI分析数据CRUD操作', () => {
    let bookId: string;

    beforeEach(async () => {
      // 先创建一个书籍记录
      bookId = await dbService.books.create({
        title: '测试小说',
        author: '测试作者',
        import_time: Date.now(),
        file_path: '/test/path/book.epub',
        total_word_count: 100000,
        chapter_count: 50
      });
    });

    const mockAIAnalysisData: Omit<AIAnalysisRecord, 'id' | 'create_time' | 'update_time'> = {
      book_id: '', // 将在测试中设置
      template_type: '七步故事法',
      analysis_result: JSON.stringify({
        step1: '开端分析',
        step2: '发展分析',
        step3: '高潮分析'
      }),
      edit_status: JSON.stringify({
        step1: false,
        step2: true,
        step3: false
      }),
      status: 'completed'
    };

    it('应该能够创建AI分析记录', async () => {
      const analysisData = { ...mockAIAnalysisData, book_id: bookId };
      const analysisId = await dbService.aiAnalysis.create(analysisData);
      
      expect(analysisId).toBeDefined();
      expect(typeof analysisId).toBe('string');
      expect(analysisId).toMatch(/^ai_analysis_\d+_[a-z0-9]+$/);
    });

    it('应该能够根据书籍ID查询AI分析记录', async () => {
      const analysisData = { ...mockAIAnalysisData, book_id: bookId };
      const analysisId = await dbService.aiAnalysis.create(analysisData);
      
      const analyses = await dbService.aiAnalysis.query({ book_id: bookId });
      expect(analyses).toHaveLength(1);
      expect(analyses[0].id).toBe(analysisId);
      expect(analyses[0].template_type).toBe('七步故事法');
    });

    it('应该能够更新AI分析状态', async () => {
      const analysisData = { ...mockAIAnalysisData, book_id: bookId, status: 'pending' as const };
      const analysisId = await dbService.aiAnalysis.create(analysisData);
      
      const updateResult = await dbService.aiAnalysis.update(analysisId, {
        status: 'completed',
        analysis_result: JSON.stringify({ step1: '更新后的分析结果' })
      });
      
      expect(updateResult).toBe(true);
      
      const updatedAnalysis = await dbService.aiAnalysis.getById(analysisId);
      expect(updatedAnalysis!.status).toBe('completed');
      expect(JSON.parse(updatedAnalysis!.analysis_result)).toEqual({ step1: '更新后的分析结果' });
    });
  });

  describe('故事单元数据CRUD操作', () => {
    let bookId: string;
    let trackId: string;

    beforeEach(async () => {
      // 先创建书籍和轨道记录
      bookId = await dbService.books.create({
        title: '测试小说',
        author: '测试作者',
        import_time: Date.now(),
        file_path: '/test/path/book.epub',
        total_word_count: 100000,
        chapter_count: 50
      });

      trackId = await dbService.tracks.create({
        book_id: bookId,
        type: 'main',
        name: '主线',
        color: '#ff0000',
        order: 0
      });
    });

    const mockStoryUnitData: Omit<StoryUnitRecord, 'id' | 'create_time' | 'update_time'> = {
      book_id: '', // 将在测试中设置
      title: '第一个故事单元',
      chapter_start: 1,
      chapter_end: 3,
      track_id: '', // 将在测试中设置
      time_position_start: 1,
      time_position_duration: 3,
      is_past_event: false,
      character_ids: JSON.stringify(['char1', 'char2'])
    };

    it('应该能够创建故事单元记录', async () => {
      const unitData = { 
        ...mockStoryUnitData, 
        book_id: bookId, 
        track_id: trackId 
      };
      const unitId = await dbService.storyUnits.create(unitData);
      
      expect(unitId).toBeDefined();
      expect(typeof unitId).toBe('string');
      expect(unitId).toMatch(/^story_units_\d+_[a-z0-9]+$/);
    });

    it('应该能够根据书籍ID查询故事单元', async () => {
      const unitData = { 
        ...mockStoryUnitData, 
        book_id: bookId, 
        track_id: trackId 
      };
      const unitId = await dbService.storyUnits.create(unitData);
      
      const units = await dbService.storyUnits.query({ book_id: bookId });
      expect(units).toHaveLength(1);
      expect(units[0].id).toBe(unitId);
      expect(units[0].title).toBe('第一个故事单元');
      expect(units[0].chapter_start).toBe(1);
      expect(units[0].chapter_end).toBe(3);
    });

    it('应该能够根据轨道ID查询故事单元', async () => {
      const unitData = { 
        ...mockStoryUnitData, 
        book_id: bookId, 
        track_id: trackId 
      };
      await dbService.storyUnits.create(unitData);
      
      const units = await dbService.storyUnits.query({ track_id: trackId });
      expect(units).toHaveLength(1);
      expect(units[0].track_id).toBe(trackId);
    });
  });

  describe('数据库统计和管理', () => {
    it('应该能够获取数据库统计信息', async () => {
      // 创建一些测试数据
      const bookId = await dbService.books.create({
        title: '测试小说',
        author: '测试作者',
        import_time: Date.now(),
        file_path: '/test/path/book.epub',
        total_word_count: 100000,
        chapter_count: 50
      });

      await dbService.characters.create({
        book_id: bookId,
        name: '主角',
        role: 'protagonist',
        appearances: JSON.stringify([]),
        important_events: JSON.stringify([]),
        screen_time_weight: 1.0
      });

      const stats = await dbService.getStats();
      
      expect(stats.bookCount).toBe(1);
      expect(stats.characterCount).toBe(1);
      expect(stats.storyUnitCount).toBe(0);
      expect(stats.relationCount).toBe(0);
      expect(stats.estimatedSize).toBeGreaterThan(0);
      expect(stats.lastUpdated).toBeDefined();
    });

    it('应该能够清空所有数据', async () => {
      // 创建一些测试数据
      await dbService.books.create({
        title: '测试小说',
        author: '测试作者',
        import_time: Date.now(),
        file_path: '/test/path/book.epub',
        total_word_count: 100000,
        chapter_count: 50
      });

      // 验证数据存在
      let stats = await dbService.getStats();
      expect(stats.bookCount).toBe(1);

      // 清空数据
      const result = await dbService.clearAll();
      expect(result).toBe(true);

      // 验证数据已清空
      stats = await dbService.getStats();
      expect(stats.bookCount).toBe(0);
    });

    it('应该能够导出和导入数据', async () => {
      // 创建测试数据
      const bookId = await dbService.books.create({
        title: '测试小说',
        author: '测试作者',
        import_time: Date.now(),
        file_path: '/test/path/book.epub',
        total_word_count: 100000,
        chapter_count: 50
      });

      // 导出数据
      const exportedData = await dbService.exportData();
      expect(exportedData).toBeDefined();
      
      const parsedData = JSON.parse(exportedData);
      expect(parsedData.books).toHaveLength(1);
      expect(parsedData.books[0].title).toBe('测试小说');
      expect(parsedData.version).toBe(1);
      expect(parsedData.exportTime).toBeDefined();

      // 清空数据库
      await dbService.clearAll();
      let stats = await dbService.getStats();
      expect(stats.bookCount).toBe(0);

      // 导入数据
      const importResult = await dbService.importData(exportedData);
      expect(importResult).toBe(true);

      // 验证数据已恢复
      stats = await dbService.getStats();
      expect(stats.bookCount).toBe(1);
      
      const books = await dbService.books.getAll();
      expect(books[0].title).toBe('测试小说');
    });
  });

  describe('便捷方法', () => {
    it('应该能够获取书籍的完整数据', async () => {
      // 创建书籍
      const bookId = await dbService.books.create({
        title: '测试小说',
        author: '测试作者',
        import_time: Date.now(),
        file_path: '/test/path/book.epub',
        total_word_count: 100000,
        chapter_count: 50
      });

      // 创建相关数据
      await dbService.characters.create({
        book_id: bookId,
        name: '主角',
        role: 'protagonist',
        appearances: JSON.stringify([]),
        important_events: JSON.stringify([]),
        screen_time_weight: 1.0
      });

      await dbService.tracks.create({
        book_id: bookId,
        type: 'main',
        name: '主线',
        color: '#ff0000',
        order: 0
      });

      // 获取完整数据
      const fullData = await dbService.getBookWithAllData(bookId);
      
      expect(fullData.book).toBeDefined();
      expect(fullData.book!.title).toBe('测试小说');
      expect(fullData.characters).toHaveLength(1);
      expect(fullData.tracks).toHaveLength(1);
      expect(fullData.aiAnalysis).toHaveLength(0);
      expect(fullData.storyUnits).toHaveLength(0);
    });

    it('应该能够删除书籍及其所有相关数据', async () => {
      // 创建书籍和相关数据
      const bookId = await dbService.books.create({
        title: '测试小说',
        author: '测试作者',
        import_time: Date.now(),
        file_path: '/test/path/book.epub',
        total_word_count: 100000,
        chapter_count: 50
      });

      await dbService.characters.create({
        book_id: bookId,
        name: '主角',
        role: 'protagonist',
        appearances: JSON.stringify([]),
        important_events: JSON.stringify([]),
        screen_time_weight: 1.0
      });

      // 验证数据存在
      let stats = await dbService.getStats();
      expect(stats.bookCount).toBe(1);
      expect(stats.characterCount).toBe(1);

      // 删除书籍及所有相关数据
      const result = await dbService.deleteBookWithAllData(bookId);
      expect(result).toBe(true);

      // 验证所有数据已删除
      stats = await dbService.getStats();
      expect(stats.bookCount).toBe(0);
      expect(stats.characterCount).toBe(0);
    });
  });

  describe('错误处理', () => {
    it('应该在获取不存在的记录时返回null', async () => {
      const book = await dbService.books.getById('non-existent-id');
      expect(book).toBeNull();
    });

    it('应该在更新不存在的记录时返回false', async () => {
      const result = await dbService.books.update('non-existent-id', { title: '新标题' });
      expect(result).toBe(false);
    });

    it('应该在导入无效数据时抛出错误', async () => {
      await expect(dbService.importData('invalid json')).rejects.toThrow(DatabaseError);
      await expect(dbService.importData('{}')).rejects.toThrow(DatabaseError);
    });

    it('应该在创建记录时验证必需字段', async () => {
      // 测试缺少必需字段的情况
      await expect(dbService.books.create({
        title: '', // 空标题
        author: '作者',
        import_time: Date.now(),
        file_path: '/test/path',
        total_word_count: 1000,
        chapter_count: 10
      })).rejects.toThrow(DatabaseError);

      await expect(dbService.books.create({
        title: '标题',
        author: '', // 空作者
        import_time: Date.now(),
        file_path: '/test/path',
        total_word_count: 1000,
        chapter_count: 10
      })).rejects.toThrow(DatabaseError);
    });

    it('应该在数据库操作失败时正确处理错误', async () => {
      // 关闭数据库连接后尝试操作
      dbService.close();
      
      await expect(dbService.books.create({
        title: '测试',
        author: '作者',
        import_time: Date.now(),
        file_path: '/test/path',
        total_word_count: 1000,
        chapter_count: 10
      })).rejects.toThrow(DatabaseError);
    });

    it('应该在查询参数无效时抛出错误', async () => {
      // 测试无效的查询参数
      await expect(dbService.books.query({
        // @ts-ignore - 故意传入无效字段用于测试
        invalidField: 'value'
      })).rejects.toThrow(DatabaseError);
    });

    it('应该在数据类型不匹配时抛出错误', async () => {
      await expect(dbService.books.create({
        title: '测试',
        author: '作者',
        import_time: Date.now(),
        file_path: '/test/path',
        total_word_count: -1, // 负数字数
        chapter_count: 10
      })).rejects.toThrow(DatabaseError);

      await expect(dbService.books.create({
        title: '测试',
        author: '作者',
        import_time: Date.now(),
        file_path: '/test/path',
        total_word_count: 1000,
        chapter_count: 0 // 零章节数
      })).rejects.toThrow(DatabaseError);
    });
  });

  describe('数据完整性验证', () => {
    it('应该验证外键约束', async () => {
      // 尝试创建引用不存在书籍的AI分析记录
      await expect(dbService.aiAnalysis.create({
        book_id: 'non-existent-book-id',
        template_type: '七步故事法',
        analysis_result: '{}',
        edit_status: '{}',
        status: 'pending'
      })).rejects.toThrow(DatabaseError);
    });

    it('应该验证JSON字段格式', async () => {
      const bookId = await dbService.books.create({
        title: '测试小说',
        author: '测试作者',
        import_time: Date.now(),
        file_path: '/test/path/book.epub',
        total_word_count: 100000,
        chapter_count: 50
      });

      // 测试无效的JSON格式
      await expect(dbService.aiAnalysis.create({
        book_id: bookId,
        template_type: '七步故事法',
        analysis_result: 'invalid json', // 无效JSON
        edit_status: '{}',
        status: 'pending'
      })).rejects.toThrow(DatabaseError);
    });

    it('应该验证枚举值', async () => {
      const bookId = await dbService.books.create({
        title: '测试小说',
        author: '测试作者',
        import_time: Date.now(),
        file_path: '/test/path/book.epub',
        total_word_count: 100000,
        chapter_count: 50
      });

      // 测试无效的状态值
      await expect(dbService.aiAnalysis.create({
        book_id: bookId,
        template_type: '七步故事法',
        analysis_result: '{}',
        edit_status: '{}',
        status: 'invalid_status' as any // 无效状态
      })).rejects.toThrow(DatabaseError);
    });

    it('应该验证数值范围', async () => {
      const bookId = await dbService.books.create({
        title: '测试小说',
        author: '测试作者',
        import_time: Date.now(),
        file_path: '/test/path/book.epub',
        total_word_count: 100000,
        chapter_count: 50
      });

      // 测试无效的章节范围
      const trackId = await dbService.tracks.create({
        book_id: bookId,
        type: 'main',
        name: '主线',
        color: '#ff0000',
        order: 0
      });

      await expect(dbService.storyUnits.create({
        book_id: bookId,
        title: '测试单元',
        chapter_start: 5, // 开始章节大于结束章节
        chapter_end: 3,
        track_id: trackId,
        time_position_start: 1,
        time_position_duration: 3,
        is_past_event: false,
        character_ids: '[]'
      })).rejects.toThrow(DatabaseError);
    });
  });

  describe('并发操作处理', () => {
    it('应该正确处理并发创建操作', async () => {
      const promises = Array.from({ length: 10 }, (_, i) => 
        dbService.books.create({
          title: `并发测试书籍${i}`,
          author: '测试作者',
          import_time: Date.now(),
          file_path: `/test/path/book${i}.epub`,
          total_word_count: 100000,
          chapter_count: 50
        })
      );

      const bookIds = await Promise.all(promises);
      
      expect(bookIds).toHaveLength(10);
      expect(new Set(bookIds).size).toBe(10); // 所有ID应该是唯一的

      const books = await dbService.books.getAll();
      expect(books).toHaveLength(10);
    });

    it('应该正确处理并发更新操作', async () => {
      const bookId = await dbService.books.create({
        title: '测试书籍',
        author: '测试作者',
        import_time: Date.now(),
        file_path: '/test/path/book.epub',
        total_word_count: 100000,
        chapter_count: 50
      });

      // 并发更新同一记录
      const updatePromises = Array.from({ length: 5 }, (_, i) => 
        dbService.books.update(bookId, {
          description: `并发更新描述${i}`
        })
      );

      const results = await Promise.all(updatePromises);
      
      // 所有更新都应该成功
      expect(results.every(r => r === true)).toBe(true);

      const updatedBook = await dbService.books.getById(bookId);
      expect(updatedBook!.description).toMatch(/^并发更新描述\d$/);
    });
  });
});