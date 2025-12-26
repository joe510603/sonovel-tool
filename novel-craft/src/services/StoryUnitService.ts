/**
 * 故事单元服务
 * 提供故事单元的 CRUD 操作和业务逻辑
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { App, TFile, TFolder } from 'obsidian';
import { databaseService } from './DatabaseService';
import { StoryUnitRecord, BookRecord } from '../types/database';

/**
 * 章节信息
 */
export interface ChapterInfo {
  /** 章节索引 (1-based) */
  index: number;
  /** 章节标题 */
  title: string;
  /** 章节文件路径 */
  filePath: string;
  /** 字数 */
  wordCount?: number;
}

/**
 * 故事单元创建配置
 */
export interface StoryUnitCreateConfig {
  /** 书籍ID */
  bookId: string;
  /** 故事单元标题 */
  title: string;
  /** 起始章节 (1-based) */
  chapterStart: number;
  /** 结束章节 (1-based) */
  chapterEnd: number;
  /** 轨道ID */
  trackId: string;
  /** 是否为过去事件 */
  isPastEvent?: boolean;
  /** 关联人物ID列表 */
  characterIds?: string[];
  /** AI分析结果ID */
  aiAnalysisId?: string;
  /** 段落级精细标记 - 起始段落位置 (1-based) */
  paragraphStart?: number;
  /** 段落级精细标记 - 结束段落位置 (1-based) */
  paragraphEnd?: number;
  /** 段落级精细标记 - 文本锚点 */
  textAnchor?: string;
}

/**
 * 故事单元更新配置
 */
export interface StoryUnitUpdateConfig {
  /** 故事单元标题 */
  title?: string;
  /** 起始章节 */
  chapterStart?: number;
  /** 结束章节 */
  chapterEnd?: number;
  /** 轨道ID */
  trackId?: string;
  /** 是否为过去事件 */
  isPastEvent?: boolean;
  /** 关联人物ID列表 */
  characterIds?: string[];
  /** 时间位置起始点 */
  timePositionStart?: number;
  /** 时间位置时长 */
  timePositionDuration?: number;
  /** 段落级精细标记 - 起始段落位置 */
  paragraphStart?: number;
  /** 段落级精细标记 - 结束段落位置 */
  paragraphEnd?: number;
  /** 段落级精细标记 - 文本锚点 */
  textAnchor?: string;
  /** 用户备注 */
  notes?: string;
}

/**
 * 故事单元服务类
 */
export class StoryUnitService {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * 创建故事单元
   */
  async createStoryUnit(config: StoryUnitCreateConfig): Promise<string> {
    const {
      bookId,
      title,
      chapterStart,
      chapterEnd,
      trackId,
      isPastEvent = false,
      characterIds = [],
      aiAnalysisId,
      paragraphStart,
      paragraphEnd,
      textAnchor
    } = config;

    // 验证章节范围
    if (chapterStart > chapterEnd) {
      throw new Error('起始章节不能大于结束章节');
    }

    // 计算时间位置（基于章节）
    const timePositionStart = chapterStart;
    const timePositionDuration = chapterEnd - chapterStart + 1;

    // 创建数据库记录
    const id = await databaseService.storyUnits.create({
      book_id: bookId,
      title,
      chapter_start: chapterStart,
      chapter_end: chapterEnd,
      track_id: trackId,
      ai_analysis_id: aiAnalysisId,
      time_position_start: timePositionStart,
      time_position_duration: timePositionDuration,
      is_past_event: isPastEvent,
      character_ids: JSON.stringify(characterIds),
      paragraph_start: paragraphStart,
      paragraph_end: paragraphEnd,
      text_anchor: textAnchor
    });

    return id;
  }

  /**
   * 获取故事单元
   */
  async getStoryUnit(id: string): Promise<StoryUnitRecord | null> {
    return await databaseService.storyUnits.getById(id);
  }

  /**
   * 获取书籍的所有故事单元
   */
  async getStoryUnitsByBook(bookId: string): Promise<StoryUnitRecord[]> {
    return await databaseService.storyUnits.query({ book_id: bookId });
  }

  /**
   * 获取轨道的所有故事单元
   */
  async getStoryUnitsByTrack(trackId: string): Promise<StoryUnitRecord[]> {
    return await databaseService.storyUnits.query({ track_id: trackId });
  }

  /**
   * 更新故事单元
   */
  async updateStoryUnit(id: string, updates: StoryUnitUpdateConfig): Promise<boolean> {
    const updateData: Partial<StoryUnitRecord> = {};

    if (updates.title !== undefined) {
      updateData.title = updates.title;
    }
    if (updates.chapterStart !== undefined) {
      updateData.chapter_start = updates.chapterStart;
    }
    if (updates.chapterEnd !== undefined) {
      updateData.chapter_end = updates.chapterEnd;
    }
    if (updates.trackId !== undefined) {
      updateData.track_id = updates.trackId;
    }
    if (updates.isPastEvent !== undefined) {
      updateData.is_past_event = updates.isPastEvent;
    }
    if (updates.characterIds !== undefined) {
      updateData.character_ids = JSON.stringify(updates.characterIds);
    }
    if (updates.timePositionStart !== undefined) {
      updateData.time_position_start = updates.timePositionStart;
    }
    if (updates.timePositionDuration !== undefined) {
      updateData.time_position_duration = updates.timePositionDuration;
    }
    if (updates.paragraphStart !== undefined) {
      updateData.paragraph_start = updates.paragraphStart;
    }
    if (updates.paragraphEnd !== undefined) {
      updateData.paragraph_end = updates.paragraphEnd;
    }
    if (updates.textAnchor !== undefined) {
      updateData.text_anchor = updates.textAnchor;
    }
    if (updates.notes !== undefined) {
      updateData.notes = updates.notes;
    }

    return await databaseService.storyUnits.update(id, updateData);
  }

  /**
   * 删除故事单元
   */
  async deleteStoryUnit(id: string): Promise<boolean> {
    // 同时删除相关的关联关系
    await databaseService.relations.deleteWhere({ source_unit_id: id });
    await databaseService.relations.deleteWhere({ target_unit_id: id });
    
    return await databaseService.storyUnits.delete(id);
  }

  /**
   * 获取书籍的章节列表
   */
  async getBookChapters(bookId: string): Promise<ChapterInfo[]> {
    const book = await databaseService.books.getById(bookId);
    if (!book) {
      console.log('NovelCraft [StoryUnitService] getBookChapters: book not found', bookId);
      return [];
    }

    console.log('NovelCraft [StoryUnitService] getBookChapters:', {
      bookId,
      bookTitle: book.title,
      filePath: book.file_path
    });

    const chapters: ChapterInfo[] = [];
    const bookFolder = this.app.vault.getAbstractFileByPath(book.file_path);
    
    console.log('NovelCraft [StoryUnitService] bookFolder:', {
      path: book.file_path,
      found: !!bookFolder,
      isFolder: bookFolder instanceof TFolder
    });

    if (!(bookFolder instanceof TFolder)) {
      // 尝试查找匹配的文件夹
      const allFolders = this.app.vault.getAllLoadedFiles()
        .filter((f): f is TFolder => f instanceof TFolder);
      
      // 查找包含书名的文件夹
      const matchingFolder = allFolders.find(f => 
        f.path.includes('books') && f.name === book.title
      );
      
      console.log('NovelCraft [StoryUnitService] trying to find matching folder:', {
        bookTitle: book.title,
        matchingFolder: matchingFolder?.path
      });
      
      if (!matchingFolder) {
        return [];
      }
      
      // 使用找到的文件夹
      return this.getChaptersFromFolder(matchingFolder);
    }

    return this.getChaptersFromFolder(bookFolder);
  }

  /**
   * 从文件夹获取章节列表
   */
  private async getChaptersFromFolder(bookFolder: TFolder): Promise<ChapterInfo[]> {
    const chapters: ChapterInfo[] = [];

    // 遍历书籍文件夹中的 MD 文件
    const files = bookFolder.children
      .filter((f): f is TFile => f instanceof TFile && f.extension === 'md')
      .filter(f => !f.name.startsWith('_') && !f.name.startsWith('00-')) // 排除元数据文件和管理文件
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const content = await this.app.vault.read(file);
      const wordCount = content.length;
      
      // 从文件名或内容提取标题
      const title = this.extractChapterTitle(file.name, content);
      
      chapters.push({
        index: i + 1,
        title,
        filePath: file.path,
        wordCount
      });
    }

    console.log('NovelCraft [StoryUnitService] chapters found:', chapters.length);
    return chapters;
  }

  /**
   * 提取章节内容
   */
  async extractChapterContent(bookId: string, chapterStart: number, chapterEnd: number): Promise<string> {
    const chapters = await this.getBookChapters(bookId);
    const selectedChapters = chapters.filter(
      ch => ch.index >= chapterStart && ch.index <= chapterEnd
    );

    const contents: string[] = [];
    for (const chapter of selectedChapters) {
      const file = this.app.vault.getAbstractFileByPath(chapter.filePath);
      if (file instanceof TFile) {
        const content = await this.app.vault.read(file);
        contents.push(`## ${chapter.title}\n\n${content}`);
      }
    }

    return contents.join('\n\n---\n\n');
  }

  /**
   * 从文件名或内容提取章节标题
   */
  private extractChapterTitle(filename: string, content: string): string {
    // 尝试从文件名提取
    const nameWithoutExt = filename.replace(/\.md$/, '');
    
    // 如果文件名看起来像章节标题，直接使用
    if (/第.+章|Chapter|第\d+节/.test(nameWithoutExt)) {
      return nameWithoutExt;
    }

    // 尝试从内容的第一个标题提取
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      return headingMatch[1].trim();
    }

    return nameWithoutExt;
  }

  /**
   * 移动故事单元到新轨道
   */
  async moveToTrack(unitId: string, newTrackId: string): Promise<boolean> {
    return await this.updateStoryUnit(unitId, { trackId: newTrackId });
  }

  /**
   * 更新故事单元时间位置
   */
  async updateTimePosition(
    unitId: string, 
    timePositionStart: number, 
    timePositionDuration?: number
  ): Promise<boolean> {
    const updates: StoryUnitUpdateConfig = { timePositionStart };
    if (timePositionDuration !== undefined) {
      updates.timePositionDuration = timePositionDuration;
    }
    return await this.updateStoryUnit(unitId, updates);
  }

  /**
   * 关联人物到故事单元
   */
  async addCharacters(unitId: string, characterIds: string[]): Promise<boolean> {
    const unit = await this.getStoryUnit(unitId);
    if (!unit) return false;

    const existingIds: string[] = JSON.parse(unit.character_ids || '[]');
    const newIds = [...new Set([...existingIds, ...characterIds])];
    
    return await this.updateStoryUnit(unitId, { characterIds: newIds });
  }

  /**
   * 从故事单元移除人物
   */
  async removeCharacters(unitId: string, characterIds: string[]): Promise<boolean> {
    const unit = await this.getStoryUnit(unitId);
    if (!unit) return false;

    const existingIds: string[] = JSON.parse(unit.character_ids || '[]');
    const newIds = existingIds.filter(id => !characterIds.includes(id));
    
    return await this.updateStoryUnit(unitId, { characterIds: newIds });
  }
}
