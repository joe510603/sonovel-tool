/**
 * 数据库服务实现
 * 基于Dexie.js封装IndexedDB操作，提供类型安全的数据库访问
 */

import Dexie, { Table } from 'dexie';
import {
  DatabaseService,
  DatabaseCRUD,
  DatabaseStats,
  TableName,
  BookRecord,
  AIAnalysisRecord,
  StoryUnitRecord,
  RelationRecord,
  CharacterRecord,
  CharacterRelationRecord,
  TrackRecord,
  TimelineConfigRecord,
  QueryOptions,
  TransactionOperation,
  DatabaseMigration
} from '../types/database';
import { DatabaseError } from '../types/errors';

/**
 * 时间线插件数据库类
 * 继承Dexie，定义所有数据表结构
 */
class TimelineDatabase extends Dexie {
  // 数据表定义
  books!: Table<BookRecord>;
  aiAnalysis!: Table<AIAnalysisRecord>;
  storyUnits!: Table<StoryUnitRecord>;
  relations!: Table<RelationRecord>;
  characters!: Table<CharacterRecord>;
  characterRelations!: Table<CharacterRelationRecord>;
  tracks!: Table<TrackRecord>;
  timelineConfigs!: Table<TimelineConfigRecord>;

  constructor() {
    super('TimelinePluginDB');
    
    // 定义数据库版本和表结构
    this.version(1).stores({
      books: 'id, title, author, import_time, file_path, create_time, update_time',
      aiAnalysis: 'id, book_id, template_type, status, create_time, update_time',
      storyUnits: 'id, book_id, title, track_id, ai_analysis_id, chapter_start, chapter_end, create_time, update_time',
      relations: 'id, source_unit_id, target_unit_id, relation_type, create_time',
      characters: 'id, book_id, name, role, create_time, update_time',
      characterRelations: 'id, book_id, character_a_id, character_b_id, relation_type, create_time, update_time',
      tracks: 'id, book_id, type, order, create_time, update_time',
      timelineConfigs: 'id, book_id, create_time, update_time'
    });

    // 数据库升级钩子
    this.version(1).upgrade(tx => {
      console.log('NovelCraft [DatabaseService]: 初始化数据库版本 1');
    });
  }
}

/**
 * 通用CRUD操作实现
 */
class BaseCRUD<T extends { id: string; create_time: number; update_time: number }> implements DatabaseCRUD<T> {
  constructor(
    private table: Table<T>,
    private tableName: string
  ) {}

  /**
   * 创建记录
   */
  async create(data: Omit<T, 'id' | 'create_time' | 'update_time'>): Promise<string> {
    try {
      const now = Date.now();
      const id = this.generateId();
      
      const record = {
        ...data,
        id,
        create_time: now,
        update_time: now
      } as T;

      await this.table.add(record);
      return id;
    } catch (error) {
      throw new DatabaseError(
        `创建${this.tableName}记录失败`,
        'create',
        this.tableName,
        { data },
        error as Error
      );
    }
  }

  /**
   * 根据ID获取记录
   */
  async getById(id: string): Promise<T | null> {
    try {
      const record = await this.table.get(id);
      return record || null;
    } catch (error) {
      throw new DatabaseError(
        `获取${this.tableName}记录失败`,
        'getById',
        this.tableName,
        { id },
        error as Error
      );
    }
  }

  /**
   * 获取所有记录
   */
  async getAll(): Promise<T[]> {
    try {
      return await this.table.toArray();
    } catch (error) {
      throw new DatabaseError(
        `获取所有${this.tableName}记录失败`,
        'getAll',
        this.tableName,
        {},
        error as Error
      );
    }
  }

  /**
   * 根据条件查询记录
   */
  async query(condition: Partial<T>): Promise<T[]> {
    try {
      let collection = this.table.toCollection();
      
      // 应用过滤条件
      Object.entries(condition).forEach(([key, value]) => {
        if (value !== undefined) {
          collection = collection.filter(record => (record as any)[key] === value);
        }
      });

      return await collection.toArray();
    } catch (error) {
      throw new DatabaseError(
        `查询${this.tableName}记录失败`,
        'query',
        this.tableName,
        { condition },
        error as Error
      );
    }
  }

  /**
   * 更新记录
   */
  async update(id: string, updates: Partial<T>): Promise<boolean> {
    try {
      const updateData = {
        ...updates,
        update_time: Date.now()
      };

      const count = await this.table.update(id, updateData as any);
      return count > 0;
    } catch (error) {
      throw new DatabaseError(
        `更新${this.tableName}记录失败`,
        'update',
        this.tableName,
        { id, updates },
        error as Error
      );
    }
  }

  /**
   * 删除记录
   */
  async delete(id: string): Promise<boolean> {
    try {
      await this.table.delete(id);
      return true;
    } catch (error) {
      throw new DatabaseError(
        `删除${this.tableName}记录失败`,
        'delete',
        this.tableName,
        { id },
        error as Error
      );
    }
  }

  /**
   * 批量删除记录
   */
  async deleteWhere(condition: Partial<T>): Promise<number> {
    try {
      let collection = this.table.toCollection();
      
      // 应用过滤条件
      Object.entries(condition).forEach(([key, value]) => {
        if (value !== undefined) {
          collection = collection.filter(record => (record as any)[key] === value);
        }
      });

      return await collection.delete();
    } catch (error) {
      throw new DatabaseError(
        `批量删除${this.tableName}记录失败`,
        'deleteWhere',
        this.tableName,
        { condition },
        error as Error
      );
    }
  }

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `${this.tableName}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * 数据库服务实现类
 */
export class TimelineDatabaseService implements DatabaseService {
  private db: TimelineDatabase;
  private isInitialized = false;

  // CRUD操作实例
  public books: DatabaseCRUD<BookRecord>;
  public aiAnalysis: DatabaseCRUD<AIAnalysisRecord>;
  public storyUnits: DatabaseCRUD<StoryUnitRecord>;
  public relations: DatabaseCRUD<RelationRecord>;
  public characters: DatabaseCRUD<CharacterRecord>;
  public characterRelations: DatabaseCRUD<CharacterRelationRecord>;
  public tracks: DatabaseCRUD<TrackRecord>;
  public timelineConfigs: DatabaseCRUD<TimelineConfigRecord>;

  constructor() {
    this.db = new TimelineDatabase();
    
    // 初始化CRUD操作实例
    this.books = new BaseCRUD(this.db.books, TableName.BOOKS);
    this.aiAnalysis = new BaseCRUD(this.db.aiAnalysis, TableName.AI_ANALYSIS);
    this.storyUnits = new BaseCRUD(this.db.storyUnits, TableName.STORY_UNITS);
    this.relations = new BaseCRUD(this.db.relations, TableName.RELATIONS);
    this.characters = new BaseCRUD(this.db.characters, TableName.CHARACTERS);
    this.characterRelations = new BaseCRUD(this.db.characterRelations, TableName.CHARACTER_RELATIONS);
    this.tracks = new BaseCRUD(this.db.tracks, TableName.TRACKS);
    this.timelineConfigs = new BaseCRUD(this.db.timelineConfigs, TableName.TIMELINE_CONFIGS);
  }

  /**
   * 初始化数据库
   */
  async initialize(): Promise<boolean> {
    try {
      await this.db.open();
      this.isInitialized = true;
      console.log('NovelCraft [DatabaseService]: 数据库初始化成功');
      return true;
    } catch (error) {
      console.error('NovelCraft [DatabaseService]: 数据库初始化失败', error);
      throw new DatabaseError(
        '数据库初始化失败',
        'initialize',
        undefined,
        {},
        error as Error
      );
    }
  }

  /**
   * 获取数据库连接
   */
  async getDatabase(): Promise<IDBDatabase> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.db.backendDB();
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    if (this.isInitialized) {
      this.db.close();
      this.isInitialized = false;
      console.log('NovelCraft [DatabaseService]: 数据库连接已关闭');
    }
  }

  /**
   * 清空所有数据
   */
  async clearAll(): Promise<boolean> {
    try {
      await this.db.transaction('rw', this.db.tables, async () => {
        await Promise.all(this.db.tables.map(table => table.clear()));
      });
      console.log('NovelCraft [DatabaseService]: 所有数据已清空');
      return true;
    } catch (error) {
      throw new DatabaseError(
        '清空数据库失败',
        'clearAll',
        undefined,
        {},
        error as Error
      );
    }
  }

  /**
   * 获取数据库统计信息
   */
  async getStats(): Promise<DatabaseStats> {
    try {
      const [
        bookCount,
        storyUnitCount,
        characterCount,
        relationCount
      ] = await Promise.all([
        this.db.books.count(),
        this.db.storyUnits.count(),
        this.db.characters.count(),
        this.db.relations.count()
      ]);

      // 估算数据库大小（简单估算）
      const estimatedSize = (bookCount + storyUnitCount + characterCount + relationCount) * 1024; // 每条记录约1KB

      return {
        bookCount,
        storyUnitCount,
        characterCount,
        relationCount,
        estimatedSize,
        lastUpdated: Date.now()
      };
    } catch (error) {
      throw new DatabaseError(
        '获取数据库统计信息失败',
        'getStats',
        undefined,
        {},
        error as Error
      );
    }
  }

  /**
   * 导出数据库数据
   */
  async exportData(): Promise<string> {
    try {
      const data = {
        books: await this.db.books.toArray(),
        aiAnalysis: await this.db.aiAnalysis.toArray(),
        storyUnits: await this.db.storyUnits.toArray(),
        relations: await this.db.relations.toArray(),
        characters: await this.db.characters.toArray(),
        characterRelations: await this.db.characterRelations.toArray(),
        tracks: await this.db.tracks.toArray(),
        timelineConfigs: await this.db.timelineConfigs.toArray(),
        exportTime: Date.now(),
        version: 1
      };

      return JSON.stringify(data, null, 2);
    } catch (error) {
      throw new DatabaseError(
        '导出数据库数据失败',
        'exportData',
        undefined,
        {},
        error as Error
      );
    }
  }

  /**
   * 导入数据库数据
   */
  async importData(jsonData: string): Promise<boolean> {
    try {
      const data = JSON.parse(jsonData);
      
      // 验证数据格式
      if (!data.version || !data.exportTime) {
        throw new Error('无效的数据格式');
      }

      await this.db.transaction('rw', this.db.tables, async () => {
        // 清空现有数据
        await Promise.all(this.db.tables.map(table => table.clear()));
        
        // 导入新数据
        if (data.books?.length) await this.db.books.bulkAdd(data.books);
        if (data.aiAnalysis?.length) await this.db.aiAnalysis.bulkAdd(data.aiAnalysis);
        if (data.storyUnits?.length) await this.db.storyUnits.bulkAdd(data.storyUnits);
        if (data.relations?.length) await this.db.relations.bulkAdd(data.relations);
        if (data.characters?.length) await this.db.characters.bulkAdd(data.characters);
        if (data.characterRelations?.length) await this.db.characterRelations.bulkAdd(data.characterRelations);
        if (data.tracks?.length) await this.db.tracks.bulkAdd(data.tracks);
        if (data.timelineConfigs?.length) await this.db.timelineConfigs.bulkAdd(data.timelineConfigs);
      });

      console.log('NovelCraft [DatabaseService]: 数据导入成功');
      return true;
    } catch (error) {
      throw new DatabaseError(
        '导入数据库数据失败',
        'importData',
        undefined,
        { dataLength: jsonData.length },
        error as Error
      );
    }
  }

  /**
   * 执行事务操作
   */
  async executeTransaction<T>(operation: TransactionOperation<T>): Promise<T> {
    try {
      return await this.db.transaction('rw', this.db.tables, async (tx) => {
        return await operation.execute(tx as any);
      });
    } catch (error) {
      throw new DatabaseError(
        '执行事务操作失败',
        'executeTransaction',
        undefined,
        {},
        error as Error
      );
    }
  }

  /**
   * 执行数据库迁移
   */
  async migrate(migrations: DatabaseMigration[]): Promise<void> {
    try {
      for (const migration of migrations) {
        console.log(`NovelCraft [DatabaseService]: 执行迁移 v${migration.version}: ${migration.description}`);
        
        await this.db.transaction('rw', this.db.tables, async (tx) => {
          await migration.migrate(this.db.backendDB(), tx as any);
        });
      }
      
      console.log('NovelCraft [DatabaseService]: 所有迁移执行完成');
    } catch (error) {
      throw new DatabaseError(
        '执行数据库迁移失败',
        'migrate',
        undefined,
        { migrationsCount: migrations.length },
        error as Error
      );
    }
  }

  /**
   * 获取书籍相关的所有数据
   * 便捷方法：一次性获取书籍及其相关的所有数据
   */
  async getBookWithAllData(bookId: string): Promise<{
    book: BookRecord | null;
    aiAnalysis: AIAnalysisRecord[];
    storyUnits: StoryUnitRecord[];
    characters: CharacterRecord[];
    characterRelations: CharacterRelationRecord[];
    tracks: TrackRecord[];
    timelineConfig: TimelineConfigRecord | null;
  }> {
    try {
      const [
        book,
        aiAnalysis,
        storyUnits,
        characters,
        characterRelations,
        tracks,
        timelineConfigs
      ] = await Promise.all([
        this.books.getById(bookId),
        this.aiAnalysis.query({ book_id: bookId }),
        this.storyUnits.query({ book_id: bookId }),
        this.characters.query({ book_id: bookId }),
        this.characterRelations.query({ book_id: bookId }),
        this.tracks.query({ book_id: bookId }),
        this.timelineConfigs.query({ book_id: bookId })
      ]);

      return {
        book,
        aiAnalysis,
        storyUnits,
        characters,
        characterRelations,
        tracks,
        timelineConfig: timelineConfigs[0] || null
      };
    } catch (error) {
      throw new DatabaseError(
        '获取书籍完整数据失败',
        'getBookWithAllData',
        undefined,
        { bookId },
        error as Error
      );
    }
  }

  /**
   * 删除书籍及其所有相关数据
   * 便捷方法：级联删除书籍的所有相关数据
   */
  async deleteBookWithAllData(bookId: string): Promise<boolean> {
    try {
      await this.db.transaction('rw', this.db.tables, async () => {
        // 删除所有相关数据
        await Promise.all([
          this.aiAnalysis.deleteWhere({ book_id: bookId }),
          this.storyUnits.deleteWhere({ book_id: bookId }),
          this.characters.deleteWhere({ book_id: bookId }),
          this.characterRelations.deleteWhere({ book_id: bookId }),
          this.tracks.deleteWhere({ book_id: bookId }),
          this.timelineConfigs.deleteWhere({ book_id: bookId })
        ]);
        
        // 最后删除书籍记录
        await this.books.delete(bookId);
      });

      console.log(`NovelCraft [DatabaseService]: 书籍 ${bookId} 及其所有相关数据已删除`);
      return true;
    } catch (error) {
      throw new DatabaseError(
        '删除书籍完整数据失败',
        'deleteBookWithAllData',
        undefined,
        { bookId },
        error as Error
      );
    }
  }
}

// 导出单例实例
export const databaseService = new TimelineDatabaseService();