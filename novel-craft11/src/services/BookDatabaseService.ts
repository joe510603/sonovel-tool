/**
 * BookDatabaseService - 书籍数据库服务
 * 
 * 管理每本书的结构化数据库（5张表）：
 * - 书籍表 (_book_meta.md)
 * - 章节表 (各章节 MD 文件的 Frontmatter)
 * - 人物表 (_characters.md)
 * - 故事单元表 (_story_units.md)
 * - 事件表 (_events.md)
 * 
 * Requirements: 1.1, 1.2, 1.6
 */

import { App, TFile, TFolder, normalizePath } from 'obsidian';
import {
  BookMeta,
  ChapterFrontmatter,
  Character,
  StoryUnit,
  StoryEvent,
  CharacterRelationship,
  DATABASE_FILES,
  DATABASE_VERSION,
  createDefaultBookMeta,
  createDefaultChapterFrontmatter,
} from '../types/database';
import {
  parseFrontmatter,
  generateFrontmatter,
  updateFrontmatter,
  setChapterFrontmatter,
  parseChapterFrontmatter,
} from '../utils/FrontmatterUtils';

/**
 * 生成唯一的 book_id
 * 格式: {书名}_{时间戳}
 * 
 * @param title - 书名
 * @returns 唯一的 book_id
 */
export function generateBookId(title: string): string {
  const sanitizedTitle = title
    .replace(/[\/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
  const timestamp = Date.now();
  return `${sanitizedTitle}_${timestamp}`;
}

/**
 * BookDatabaseService - 书籍数据库服务
 */
export class BookDatabaseService {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  // ============ 数据库初始化 ============

  /**
   * 初始化书籍数据库
   * 创建数据库文件夹和初始文件
   * 
   * @param bookPath - 书籍文件夹路径
   * @param metadata - 书籍元数据
   * @returns 生成的 book_id
   * 
   * Requirements: 1.1
   */
  async initializeDatabase(
    bookPath: string,
    metadata: { title: string; author?: string; description?: string }
  ): Promise<string> {
    const normalizedPath = normalizePath(bookPath);
    
    // 确保书籍文件夹存在
    await this.ensureFolder(normalizedPath);
    
    // 生成唯一 book_id
    const bookId = generateBookId(metadata.title);
    
    // 创建默认书籍元数据
    const bookMeta = createDefaultBookMeta(metadata.title, metadata.author || '');
    bookMeta.bookId = bookId;
    if (metadata.description) {
      bookMeta.description = metadata.description;
    }
    
    // 创建数据库文件
    await Promise.all([
      this.createBookMetaFile(normalizedPath, bookMeta),
      this.createCharactersFile(normalizedPath, bookId),
      this.createStoryUnitsFile(normalizedPath, bookId),
      this.createEventsFile(normalizedPath, bookId),
      this.ensureFolder(`${normalizedPath}/${DATABASE_FILES.CANVAS_FOLDER}`),
    ]);
    
    return bookId;
  }

  /**
   * 创建书籍元数据文件
   */
  private async createBookMetaFile(bookPath: string, bookMeta: BookMeta): Promise<void> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.BOOK_META}`);
    
    // 转换为 snake_case 格式（Dataview 兼容）
    const frontmatterData = this.bookMetaToFrontmatter(bookMeta);
    const frontmatter = generateFrontmatter(frontmatterData);
    
    const content = `${frontmatter}

# ${bookMeta.title}

> 书籍数据库元数据文件，请勿手动编辑 Frontmatter 部分。

## 简介

${bookMeta.description || '_暂无简介_'}

## AI 分析概要

${bookMeta.aiSynopsis || '_暂无 AI 分析_'}
`;
    
    await this.writeFile(filePath, content);
  }

  /**
   * 创建人物表文件
   */
  private async createCharactersFile(bookPath: string, bookId: string): Promise<void> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.CHARACTERS}`);
    
    const frontmatter = generateFrontmatter({
      type: 'character-database',
      book_id: bookId,
      version: DATABASE_VERSION,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    
    const content = `${frontmatter}

# 人物表

> 此文件存储书籍的人物数据，支持 Dataview 查询。

## 人物列表

_暂无人物数据_
`;
    
    await this.writeFile(filePath, content);
  }

  /**
   * 创建故事单元表文件
   */
  private async createStoryUnitsFile(bookPath: string, bookId: string): Promise<void> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.STORY_UNITS}`);
    
    const frontmatter = generateFrontmatter({
      type: 'story-unit-database',
      book_id: bookId,
      version: DATABASE_VERSION,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    
    const content = `${frontmatter}

# 故事单元表

> 此文件存储书籍的故事单元数据，支持 Dataview 查询。

## 故事单元列表

_暂无故事单元数据_
`;
    
    await this.writeFile(filePath, content);
  }

  /**
   * 创建事件表文件
   */
  private async createEventsFile(bookPath: string, bookId: string): Promise<void> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.EVENTS}`);
    
    const frontmatter = generateFrontmatter({
      type: 'event-database',
      book_id: bookId,
      version: DATABASE_VERSION,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    
    const content = `${frontmatter}

# 事件表

> 此文件存储书籍的事件数据，用于时间轴甘特图展示。

## 事件列表

_暂无事件数据_
`;
    
    await this.writeFile(filePath, content);
  }

  // ============ 书籍表操作 ============

  /**
   * 获取书籍元数据
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns 书籍元数据，如果不存在返回 null
   * 
   * Requirements: 1.1
   */
  async getBookMeta(bookPath: string): Promise<BookMeta | null> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.BOOK_META}`);
    
    try {
      const content = await this.readFile(filePath);
      if (!content) {
        return null;
      }
      
      const parsed = parseFrontmatter(content);
      if (!parsed.hasFrontmatter) {
        return null;
      }
      
      return this.frontmatterToBookMeta(parsed.data as Record<string, unknown>);
    } catch {
      return null;
    }
  }

  /**
   * 更新书籍元数据
   * 
   * @param bookPath - 书籍文件夹路径
   * @param updates - 要更新的字段
   * 
   * Requirements: 1.6
   */
  async updateBookMeta(bookPath: string, updates: Partial<BookMeta>): Promise<void> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.BOOK_META}`);
    
    const content = await this.readFile(filePath);
    if (!content) {
      throw new Error(`书籍元数据文件不存在: ${filePath}`);
    }
    
    // 转换更新数据为 snake_case
    const updateData: Record<string, unknown> = {};
    
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.author !== undefined) updateData.author = updates.author;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.coverImage !== undefined) updateData.cover_image = updates.coverImage;
    if (updates.totalChapters !== undefined) updateData.total_chapters = updates.totalChapters;
    if (updates.totalWords !== undefined) updateData.total_words = updates.totalWords;
    if (updates.aiSynopsis !== undefined) updateData.ai_synopsis = updates.aiSynopsis;
    if (updates.aiWritingTechniques !== undefined) updateData.ai_writing_techniques = updates.aiWritingTechniques;
    if (updates.aiTakeaways !== undefined) updateData.ai_takeaways = updates.aiTakeaways;
    if (updates.readingStatus !== undefined) updateData.reading_status = updates.readingStatus;
    if (updates.currentChapter !== undefined) updateData.current_chapter = updates.currentChapter;
    if (updates.lastReadAt !== undefined) updateData.last_read_at = updates.lastReadAt;
    if (updates.customFields !== undefined) updateData.custom_fields = updates.customFields;
    
    // 始终更新 updated_at
    updateData.updated_at = new Date().toISOString();
    
    const newContent = updateFrontmatter(content, updateData);
    await this.writeFile(filePath, newContent);
  }

  // ============ 章节表操作 ============

  /**
   * 获取所有章节的 Frontmatter
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns 章节 Frontmatter 列表
   */
  async getChapters(bookPath: string): Promise<ChapterFrontmatter[]> {
    const normalizedPath = normalizePath(bookPath);
    const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
    
    if (!(folder instanceof TFolder)) {
      return [];
    }
    
    const chapters: ChapterFrontmatter[] = [];
    
    for (const file of folder.children) {
      if (!(file instanceof TFile) || file.extension !== 'md') {
        continue;
      }
      
      // 跳过数据库文件和管理文件
      if (file.name.startsWith('_') || file.name.includes('-管理')) {
        continue;
      }
      
      // 检查是否是章节文件（格式: 01-章节标题.md）
      const match = file.name.match(/^(\d+)-(.+)\.md$/);
      if (!match) {
        continue;
      }
      
      try {
        const content = await this.app.vault.read(file);
        const frontmatter = parseChapterFrontmatter(content);
        
        if (frontmatter) {
          chapters.push(frontmatter);
        } else {
          // 如果没有 Frontmatter，创建默认的
          const chapterNum = parseInt(match[1], 10);
          const title = match[2];
          chapters.push({
            bookId: '',
            chapterId: `chapter_${chapterNum}`,
            chapterNum,
            title,
            wordCount: content.length,
            readStatus: 'unread',
          });
        }
      } catch {
        // 忽略读取错误
      }
    }
    
    // 按章节序号排序
    chapters.sort((a, b) => a.chapterNum - b.chapterNum);
    
    return chapters;
  }

  /**
   * 更新章节 Frontmatter
   * 
   * @param chapterPath - 章节文件路径
   * @param frontmatter - 章节 Frontmatter 数据
   */
  async updateChapterFrontmatter(
    chapterPath: string,
    frontmatter: ChapterFrontmatter
  ): Promise<void> {
    const normalizedPath = normalizePath(chapterPath);
    const file = this.app.vault.getAbstractFileByPath(normalizedPath);
    
    if (!(file instanceof TFile)) {
      throw new Error(`章节文件不存在: ${normalizedPath}`);
    }
    
    const content = await this.app.vault.read(file);
    const newContent = setChapterFrontmatter(content, frontmatter);
    await this.app.vault.modify(file, newContent);
  }

  /**
   * 为书籍的所有章节添加 Frontmatter
   * 
   * @param bookPath - 书籍文件夹路径
   * @param bookId - 书籍 ID
   * @returns 处理的章节数量
   * 
   * Requirements: 12.3
   */
  async injectChapterFrontmatters(bookPath: string, bookId: string): Promise<number> {
    const normalizedPath = normalizePath(bookPath);
    const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
    
    if (!(folder instanceof TFolder)) {
      return 0;
    }
    
    let processedCount = 0;
    
    for (const file of folder.children) {
      if (!(file instanceof TFile) || file.extension !== 'md') {
        continue;
      }
      
      // 跳过数据库文件和管理文件
      if (file.name.startsWith('_') || file.name.includes('-管理')) {
        continue;
      }
      
      // 检查是否是章节文件
      const match = file.name.match(/^(\d+)-(.+)\.md$/);
      if (!match) {
        continue;
      }
      
      const chapterNum = parseInt(match[1], 10);
      const title = match[2];
      
      try {
        const content = await this.app.vault.read(file);
        
        // 检查是否已有 Frontmatter
        const existingFrontmatter = parseChapterFrontmatter(content);
        if (existingFrontmatter && existingFrontmatter.bookId === bookId) {
          // 已有正确的 Frontmatter，跳过
          continue;
        }
        
        // 创建新的 Frontmatter
        const chapterId = `${bookId}_chapter_${chapterNum}`;
        const frontmatter = createDefaultChapterFrontmatter(
          bookId,
          chapterId,
          chapterNum,
          title
        );
        
        // 计算字数（简单统计）
        const parsed = parseFrontmatter(content);
        frontmatter.wordCount = parsed.content.replace(/\s/g, '').length;
        
        // 更新文件
        const newContent = setChapterFrontmatter(content, frontmatter);
        await this.app.vault.modify(file, newContent);
        
        processedCount++;
      } catch {
        // 忽略单个文件的错误，继续处理其他文件
      }
    }
    
    return processedCount;
  }

  // ============ 辅助方法 ============

  /**
   * 扫描并获取所有章节文件
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns 章节文件列表（按序号排序）
   * 
   * Requirements: 2.1
   */
  async scanChapterFiles(bookPath: string): Promise<TFile[]> {
    const normalizedPath = normalizePath(bookPath);
    const folder = this.app.vault.getAbstractFileByPath(normalizedPath);
    
    if (!(folder instanceof TFolder)) {
      return [];
    }
    
    const chapterFiles: TFile[] = [];
    
    for (const file of folder.children) {
      if (!(file instanceof TFile) || file.extension !== 'md') {
        continue;
      }
      
      // 跳过数据库文件和管理文件
      if (file.name.startsWith('_') || file.name.includes('-管理')) {
        continue;
      }
      
      // 检查是否是章节文件（格式: 01-章节标题.md）
      const match = file.name.match(/^(\d+)-(.+)\.md$/);
      if (match) {
        chapterFiles.push(file);
      }
    }
    
    // 按章节序号排序
    chapterFiles.sort((a, b) => {
      const numA = parseInt(a.name.match(/^(\d+)/)?.[1] || '0', 10);
      const numB = parseInt(b.name.match(/^(\d+)/)?.[1] || '0', 10);
      return numA - numB;
    });
    
    return chapterFiles;
  }

  /**
   * 获取章节内容（合并多个章节）
   * 
   * @param bookPath - 书籍文件夹路径
   * @param startChapter - 起始章节号
   * @param endChapter - 结束章节号
   * @returns 合并后的章节内容
   * 
   * Requirements: 2.1
   */
  async getChapterContent(
    bookPath: string,
    startChapter: number,
    endChapter: number
  ): Promise<string> {
    // 直接扫描章节文件，不依赖 getChapters（避免数据库未初始化的问题）
    const chapterFiles = await this.scanChapterFiles(bookPath);
    const contents: string[] = [];
    
    for (const file of chapterFiles) {
      // 从文件名提取章节号
      const match = file.name.match(/^(\d+)-(.+)\.md$/);
      if (!match) continue;
      
      const chapterNum = parseInt(match[1], 10);
      const chapterTitle = match[2];
      
      // 检查是否在指定范围内
      if (chapterNum >= startChapter && chapterNum <= endChapter) {
        try {
          const content = await this.app.vault.read(file);
          const parsed = parseFrontmatter(content);
          contents.push(`## 第${chapterNum}章 ${chapterTitle}\n\n${parsed.content}`);
        } catch (error) {
          console.warn(`读取章节文件失败: ${file.path}`, error);
        }
      }
    }
    
    return contents.join('\n\n---\n\n');
  }

  // ============ 人物表操作 ============

  /**
   * 获取所有人物
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns 人物列表
   * 
   * Requirements: 5.1, 5.4
   */
  async getCharacters(bookPath: string): Promise<Character[]> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.CHARACTERS}`);
    
    try {
      const content = await this.readFile(filePath);
      if (!content) {
        return [];
      }
      
      return this.parseCharactersFromContent(content);
    } catch {
      return [];
    }
  }

  /**
   * 添加人物
   * 
   * @param bookPath - 书籍文件夹路径
   * @param character - 人物数据
   * @returns 生成的人物 ID
   * 
   * Requirements: 5.1
   */
  async addCharacter(bookPath: string, character: Omit<Character, 'characterId' | 'createdAt' | 'updatedAt'>): Promise<string> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.CHARACTERS}`);
    const content = await this.readFile(filePath);
    
    if (!content) {
      throw new Error(`人物表文件不存在: ${filePath}`);
    }
    
    // 生成唯一 ID
    const characterId = `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const fullCharacter: Character = {
      ...character,
      characterId,
      createdAt: now,
      updatedAt: now,
    };
    
    // 获取现有人物
    const characters = await this.getCharacters(bookPath);
    characters.push(fullCharacter);
    
    // 重新生成文件内容
    const newContent = this.generateCharactersContent(content, characters);
    await this.writeFile(filePath, newContent);
    
    return characterId;
  }

  /**
   * 更新人物
   * 
   * @param bookPath - 书籍文件夹路径
   * @param characterId - 人物 ID
   * @param updates - 要更新的字段
   * 
   * Requirements: 5.1
   */
  async updateCharacter(
    bookPath: string,
    characterId: string,
    updates: Partial<Omit<Character, 'characterId' | 'bookId' | 'createdAt'>>
  ): Promise<void> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.CHARACTERS}`);
    const content = await this.readFile(filePath);
    
    if (!content) {
      throw new Error(`人物表文件不存在: ${filePath}`);
    }
    
    const characters = await this.getCharacters(bookPath);
    const index = characters.findIndex(c => c.characterId === characterId);
    
    if (index === -1) {
      throw new Error(`人物不存在: ${characterId}`);
    }
    
    // 更新人物数据
    characters[index] = {
      ...characters[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    // 重新生成文件内容
    const newContent = this.generateCharactersContent(content, characters);
    await this.writeFile(filePath, newContent);
  }

  /**
   * 删除人物
   * 
   * @param bookPath - 书籍文件夹路径
   * @param characterId - 人物 ID
   */
  async deleteCharacter(bookPath: string, characterId: string): Promise<void> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.CHARACTERS}`);
    const content = await this.readFile(filePath);
    
    if (!content) {
      throw new Error(`人物表文件不存在: ${filePath}`);
    }
    
    const characters = await this.getCharacters(bookPath);
    const filteredCharacters = characters.filter(c => c.characterId !== characterId);
    
    if (filteredCharacters.length === characters.length) {
      throw new Error(`人物不存在: ${characterId}`);
    }
    
    // 重新生成文件内容
    const newContent = this.generateCharactersContent(content, filteredCharacters);
    await this.writeFile(filePath, newContent);
  }

  /**
   * 根据人物 ID 获取人物出现的所有故事单元
   * 
   * @param bookPath - 书籍文件夹路径
   * @param characterId - 人物 ID
   * @returns 故事单元列表
   * 
   * Requirements: 5.4
   */
  async getCharacterStoryUnits(bookPath: string, characterId: string): Promise<StoryUnit[]> {
    const storyUnits = await this.getStoryUnits(bookPath);
    return storyUnits.filter(unit => unit.relatedCharacters.includes(characterId));
  }

  // ============ 故事单元表操作 ============

  /**
   * 获取所有故事单元
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns 故事单元列表
   * 
   * Requirements: 2.1, 3.4
   */
  async getStoryUnits(bookPath: string): Promise<StoryUnit[]> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.STORY_UNITS}`);
    
    try {
      const content = await this.readFile(filePath);
      if (!content) {
        return [];
      }
      
      return this.parseStoryUnitsFromContent(content);
    } catch {
      return [];
    }
  }

  /**
   * 添加故事单元
   * 
   * @param bookPath - 书籍文件夹路径
   * @param storyUnit - 故事单元数据
   * @returns 生成的故事单元 ID
   * 
   * Requirements: 2.1, 3.4
   */
  async addStoryUnit(
    bookPath: string,
    storyUnit: Omit<StoryUnit, 'unitId' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.STORY_UNITS}`);
    const content = await this.readFile(filePath);
    
    if (!content) {
      throw new Error(`故事单元表文件不存在: ${filePath}`);
    }
    
    // 生成唯一 ID
    const unitId = `unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const fullStoryUnit: StoryUnit = {
      ...storyUnit,
      unitId,
      createdAt: now,
      updatedAt: now,
    };
    
    // 如果内容较大，存储到单独文件
    if (fullStoryUnit.textContent && fullStoryUnit.textContent.length > 5000) {
      const textFilePath = await this.saveStoryUnitText(bookPath, unitId, fullStoryUnit.textContent);
      fullStoryUnit.textFilePath = textFilePath;
      fullStoryUnit.textContent = fullStoryUnit.textContent.substring(0, 200) + '...'; // 保留摘要
    }
    
    // 获取现有故事单元
    const storyUnits = await this.getStoryUnits(bookPath);
    storyUnits.push(fullStoryUnit);
    
    // 重新生成文件内容
    const newContent = this.generateStoryUnitsContent(content, storyUnits);
    await this.writeFile(filePath, newContent);
    
    return unitId;
  }

  /**
   * 更新故事单元
   * 
   * @param bookPath - 书籍文件夹路径
   * @param unitId - 故事单元 ID
   * @param updates - 要更新的字段
   * 
   * Requirements: 2.1, 3.4
   */
  async updateStoryUnit(
    bookPath: string,
    unitId: string,
    updates: Partial<Omit<StoryUnit, 'unitId' | 'bookId' | 'createdAt'>>
  ): Promise<void> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.STORY_UNITS}`);
    const content = await this.readFile(filePath);
    
    if (!content) {
      throw new Error(`故事单元表文件不存在: ${filePath}`);
    }
    
    const storyUnits = await this.getStoryUnits(bookPath);
    const index = storyUnits.findIndex(u => u.unitId === unitId);
    
    if (index === -1) {
      throw new Error(`故事单元不存在: ${unitId}`);
    }
    
    // 更新故事单元数据
    storyUnits[index] = {
      ...storyUnits[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    // 如果更新了大内容，处理分离存储
    if (updates.textContent && updates.textContent.length > 5000) {
      const textFilePath = await this.saveStoryUnitText(bookPath, unitId, updates.textContent);
      storyUnits[index].textFilePath = textFilePath;
      storyUnits[index].textContent = updates.textContent.substring(0, 200) + '...';
    }
    
    // 重新生成文件内容
    const newContent = this.generateStoryUnitsContent(content, storyUnits);
    await this.writeFile(filePath, newContent);
  }

  /**
   * 删除故事单元
   * 
   * @param bookPath - 书籍文件夹路径
   * @param unitId - 故事单元 ID
   */
  async deleteStoryUnit(bookPath: string, unitId: string): Promise<void> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.STORY_UNITS}`);
    const content = await this.readFile(filePath);
    
    if (!content) {
      throw new Error(`故事单元表文件不存在: ${filePath}`);
    }
    
    const storyUnits = await this.getStoryUnits(bookPath);
    const unitToDelete = storyUnits.find(u => u.unitId === unitId);
    const filteredUnits = storyUnits.filter(u => u.unitId !== unitId);
    
    if (filteredUnits.length === storyUnits.length) {
      throw new Error(`故事单元不存在: ${unitId}`);
    }
    
    // 删除关联的文本文件
    if (unitToDelete?.textFilePath) {
      try {
        const textFile = this.app.vault.getAbstractFileByPath(unitToDelete.textFilePath);
        if (textFile instanceof TFile) {
          await this.app.vault.delete(textFile);
        }
      } catch {
        // 忽略删除错误
      }
    }
    
    // 重新生成文件内容
    const newContent = this.generateStoryUnitsContent(content, filteredUnits);
    await this.writeFile(filePath, newContent);
  }

  /**
   * 获取故事单元的完整文本内容
   * 
   * @param bookPath - 书籍文件夹路径
   * @param unitId - 故事单元 ID
   * @returns 完整文本内容
   * 
   * Requirements: 3.4
   */
  async getStoryUnitFullText(bookPath: string, unitId: string): Promise<string | null> {
    const storyUnits = await this.getStoryUnits(bookPath);
    const unit = storyUnits.find(u => u.unitId === unitId);
    
    if (!unit) {
      return null;
    }
    
    // 如果有单独的文本文件，读取它
    if (unit.textFilePath) {
      const content = await this.readFile(unit.textFilePath);
      return content;
    }
    
    return unit.textContent || null;
  }

  // ============ 事件表操作 ============

  /**
   * 获取所有事件
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns 事件列表
   * 
   * Requirements: 6.6
   */
  async getEvents(bookPath: string): Promise<StoryEvent[]> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.EVENTS}`);
    
    try {
      const content = await this.readFile(filePath);
      if (!content) {
        return [];
      }
      
      return this.parseEventsFromContent(content);
    } catch {
      return [];
    }
  }

  /**
   * 添加事件
   * 
   * @param bookPath - 书籍文件夹路径
   * @param event - 事件数据
   * @returns 生成的事件 ID
   * 
   * Requirements: 6.6
   */
  async addEvent(
    bookPath: string,
    event: Omit<StoryEvent, 'eventId' | 'createdAt' | 'updatedAt'>
  ): Promise<string> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.EVENTS}`);
    const content = await this.readFile(filePath);
    
    if (!content) {
      throw new Error(`事件表文件不存在: ${filePath}`);
    }
    
    // 生成唯一 ID
    const eventId = `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    const fullEvent: StoryEvent = {
      ...event,
      eventId,
      createdAt: now,
      updatedAt: now,
    };
    
    // 获取现有事件
    const events = await this.getEvents(bookPath);
    events.push(fullEvent);
    
    // 重新生成文件内容
    const newContent = this.generateEventsContent(content, events);
    await this.writeFile(filePath, newContent);
    
    return eventId;
  }

  /**
   * 更新事件
   * 
   * @param bookPath - 书籍文件夹路径
   * @param eventId - 事件 ID
   * @param updates - 要更新的字段
   * 
   * Requirements: 6.6
   */
  async updateEvent(
    bookPath: string,
    eventId: string,
    updates: Partial<Omit<StoryEvent, 'eventId' | 'bookId' | 'createdAt'>>
  ): Promise<void> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.EVENTS}`);
    const content = await this.readFile(filePath);
    
    if (!content) {
      throw new Error(`事件表文件不存在: ${filePath}`);
    }
    
    const events = await this.getEvents(bookPath);
    const index = events.findIndex(e => e.eventId === eventId);
    
    if (index === -1) {
      throw new Error(`事件不存在: ${eventId}`);
    }
    
    // 更新事件数据
    events[index] = {
      ...events[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    
    // 重新生成文件内容
    const newContent = this.generateEventsContent(content, events);
    await this.writeFile(filePath, newContent);
  }

  /**
   * 删除事件
   * 
   * @param bookPath - 书籍文件夹路径
   * @param eventId - 事件 ID
   */
  async deleteEvent(bookPath: string, eventId: string): Promise<void> {
    const filePath = normalizePath(`${bookPath}/${DATABASE_FILES.EVENTS}`);
    const content = await this.readFile(filePath);
    
    if (!content) {
      throw new Error(`事件表文件不存在: ${filePath}`);
    }
    
    const events = await this.getEvents(bookPath);
    const filteredEvents = events.filter(e => e.eventId !== eventId);
    
    if (filteredEvents.length === events.length) {
      throw new Error(`事件不存在: ${eventId}`);
    }
    
    // 重新生成文件内容
    const newContent = this.generateEventsContent(content, filteredEvents);
    await this.writeFile(filePath, newContent);
  }

  /**
   * 更新事件位置（用于拖拽操作）
   * 
   * @param bookPath - 书籍文件夹路径
   * @param eventId - 事件 ID
   * @param position - 新位置
   * 
   * Requirements: 6.6
   */
  async updateEventPosition(
    bookPath: string,
    eventId: string,
    position: { pseudoTimeOrder?: number; durationSpan?: number; layer?: number }
  ): Promise<void> {
    await this.updateEvent(bookPath, eventId, position);
  }

  // ============ 数据导出功能 ============

  /**
   * 导出数据库为 JSON 格式
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns JSON 字符串
   * 
   * Requirements: 1.1.5
   */
  async exportToJson(bookPath: string): Promise<string> {
    const bookMeta = await this.getBookMeta(bookPath);
    const characters = await this.getCharacters(bookPath);
    const storyUnits = await this.getStoryUnits(bookPath);
    const events = await this.getEvents(bookPath);
    const chapters = await this.getChapters(bookPath);

    const exportData = {
      version: DATABASE_VERSION,
      exportedAt: new Date().toISOString(),
      bookMeta: bookMeta ? this.bookMetaToExportFormat(bookMeta) : null,
      chapters: chapters.map(c => this.chapterToExportFormat(c)),
      characters: characters.map(c => this.characterToExportFormat(c)),
      storyUnits: storyUnits.map(u => this.storyUnitToExportFormat(u)),
      events: events.map(e => this.eventToExportFormat(e)),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * 导出数据库为 CSV 格式
   * 
   * @param bookPath - 书籍文件夹路径
   * @param tableType - 要导出的表类型
   * @returns CSV 字符串
   * 
   * Requirements: 1.1.5
   */
  async exportToCsv(
    bookPath: string,
    tableType: 'characters' | 'story_units' | 'events' | 'chapters'
  ): Promise<string> {
    switch (tableType) {
      case 'characters':
        return this.exportCharactersToCsv(bookPath);
      case 'story_units':
        return this.exportStoryUnitsToCsv(bookPath);
      case 'events':
        return this.exportEventsToCsv(bookPath);
      case 'chapters':
        return this.exportChaptersToCsv(bookPath);
      default:
        throw new Error(`不支持的表类型: ${tableType}`);
    }
  }

  /**
   * 导出人物表为 CSV
   */
  private async exportCharactersToCsv(bookPath: string): Promise<string> {
    const characters = await this.getCharacters(bookPath);
    
    const headers = [
      'character_id',
      'book_id',
      'name',
      'aliases',
      'role',
      'tags',
      'ai_description',
      'ai_motivation',
      'ai_growth_arc',
      'first_appearance_chapter',
      'appearance_chapters',
      'source',
      'created_at',
      'updated_at',
    ];

    const rows = characters.map(c => [
      this.escapeCsvField(c.characterId),
      this.escapeCsvField(c.bookId),
      this.escapeCsvField(c.name),
      this.escapeCsvField(c.aliases?.join('; ') || ''),
      this.escapeCsvField(c.role),
      this.escapeCsvField(c.tags?.join('; ') || ''),
      this.escapeCsvField(c.aiDescription || ''),
      this.escapeCsvField(c.aiMotivation || ''),
      this.escapeCsvField(c.aiGrowthArc || ''),
      String(c.firstAppearanceChapter),
      this.escapeCsvField(c.appearanceChapters.join('; ')),
      this.escapeCsvField(c.source),
      this.escapeCsvField(c.createdAt),
      this.escapeCsvField(c.updatedAt),
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  /**
   * 导出故事单元表为 CSV
   */
  private async exportStoryUnitsToCsv(bookPath: string): Promise<string> {
    const storyUnits = await this.getStoryUnits(bookPath);
    
    const headers = [
      'unit_id',
      'book_id',
      'name',
      'chapter_start',
      'chapter_end',
      'line_type',
      'custom_line_type',
      'categories',
      'related_characters',
      'analysis_template',
      'source',
      'created_at',
      'updated_at',
    ];

    const rows = storyUnits.map(u => [
      this.escapeCsvField(u.unitId),
      this.escapeCsvField(u.bookId),
      this.escapeCsvField(u.name),
      String(u.chapterRange.start),
      String(u.chapterRange.end),
      this.escapeCsvField(u.lineType),
      this.escapeCsvField(u.customLineType || ''),
      this.escapeCsvField(u.categories?.join('; ') || ''),
      this.escapeCsvField(u.relatedCharacters.join('; ')),
      this.escapeCsvField(u.analysisTemplate),
      this.escapeCsvField(u.source),
      this.escapeCsvField(u.createdAt),
      this.escapeCsvField(u.updatedAt),
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  /**
   * 导出事件表为 CSV
   */
  private async exportEventsToCsv(bookPath: string): Promise<string> {
    const events = await this.getEvents(bookPath);
    
    const headers = [
      'event_id',
      'book_id',
      'story_unit_id',
      'name',
      'description',
      'pseudo_time_order',
      'duration_span',
      'layer',
      'color',
      'chapter_start',
      'chapter_end',
      'created_at',
      'updated_at',
    ];

    const rows = events.map(e => [
      this.escapeCsvField(e.eventId),
      this.escapeCsvField(e.bookId),
      this.escapeCsvField(e.storyUnitId || ''),
      this.escapeCsvField(e.name),
      this.escapeCsvField(e.description || ''),
      String(e.pseudoTimeOrder),
      String(e.durationSpan),
      String(e.layer),
      this.escapeCsvField(e.color),
      String(e.chapterRange.start),
      String(e.chapterRange.end),
      this.escapeCsvField(e.createdAt),
      this.escapeCsvField(e.updatedAt),
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  /**
   * 导出章节表为 CSV
   */
  private async exportChaptersToCsv(bookPath: string): Promise<string> {
    const chapters = await this.getChapters(bookPath);
    
    const headers = [
      'chapter_id',
      'book_id',
      'chapter_num',
      'title',
      'word_count',
      'ai_summary',
      'ai_key_events',
      'read_status',
      'read_at',
    ];

    const rows = chapters.map(c => [
      this.escapeCsvField(c.chapterId),
      this.escapeCsvField(c.bookId),
      String(c.chapterNum),
      this.escapeCsvField(c.title),
      String(c.wordCount),
      this.escapeCsvField(c.aiSummary || ''),
      this.escapeCsvField(c.aiKeyEvents?.join('; ') || ''),
      this.escapeCsvField(c.readStatus),
      this.escapeCsvField(c.readAt || ''),
    ]);

    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }

  /**
   * CSV 字段转义
   */
  private escapeCsvField(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /**
   * 转换 BookMeta 为导出格式
   */
  private bookMetaToExportFormat(meta: BookMeta): Record<string, unknown> {
    return {
      book_id: meta.bookId,
      title: meta.title,
      author: meta.author,
      description: meta.description,
      cover_image: meta.coverImage,
      total_chapters: meta.totalChapters,
      total_words: meta.totalWords,
      ai_synopsis: meta.aiSynopsis,
      ai_writing_techniques: meta.aiWritingTechniques,
      ai_takeaways: meta.aiTakeaways,
      reading_status: meta.readingStatus,
      current_chapter: meta.currentChapter,
      last_read_at: meta.lastReadAt,
      converted_at: meta.convertedAt,
      created_at: meta.createdAt,
      updated_at: meta.updatedAt,
      custom_fields: meta.customFields,
    };
  }

  /**
   * 转换 ChapterFrontmatter 为导出格式
   */
  private chapterToExportFormat(chapter: ChapterFrontmatter): Record<string, unknown> {
    return {
      chapter_id: chapter.chapterId,
      book_id: chapter.bookId,
      chapter_num: chapter.chapterNum,
      title: chapter.title,
      word_count: chapter.wordCount,
      ai_summary: chapter.aiSummary,
      ai_key_events: chapter.aiKeyEvents,
      read_status: chapter.readStatus,
      read_at: chapter.readAt,
    };
  }

  /**
   * 转换 Character 为导出格式
   */
  private characterToExportFormat(char: Character): Record<string, unknown> {
    return {
      character_id: char.characterId,
      book_id: char.bookId,
      name: char.name,
      aliases: char.aliases,
      role: char.role,
      tags: char.tags,
      ai_description: char.aiDescription,
      ai_motivation: char.aiMotivation,
      ai_growth_arc: char.aiGrowthArc,
      relationships: char.relationships.map(r => ({
        target_character_id: r.targetCharacterId,
        target_name: r.targetName,
        relationship_type: r.relationshipType,
        custom_type: r.customType,
        description: r.description,
        changes: r.changes,
      })),
      first_appearance_chapter: char.firstAppearanceChapter,
      appearance_chapters: char.appearanceChapters,
      source: char.source,
      created_at: char.createdAt,
      updated_at: char.updatedAt,
    };
  }

  /**
   * 转换 StoryUnit 为导出格式
   */
  private storyUnitToExportFormat(unit: StoryUnit): Record<string, unknown> {
    return {
      unit_id: unit.unitId,
      book_id: unit.bookId,
      name: unit.name,
      chapter_range: unit.chapterRange,
      precise_range: unit.preciseRange,
      line_type: unit.lineType,
      custom_line_type: unit.customLineType,
      categories: unit.categories,
      related_characters: unit.relatedCharacters,
      text_content: unit.textContent,
      text_file_path: unit.textFilePath,
      analysis_template: unit.analysisTemplate,
      ai_analysis: unit.aiAnalysis,
      source: unit.source,
      created_at: unit.createdAt,
      updated_at: unit.updatedAt,
    };
  }

  /**
   * 转换 StoryEvent 为导出格式
   */
  private eventToExportFormat(event: StoryEvent): Record<string, unknown> {
    return {
      event_id: event.eventId,
      book_id: event.bookId,
      story_unit_id: event.storyUnitId,
      name: event.name,
      description: event.description,
      pseudo_time_order: event.pseudoTimeOrder,
      duration_span: event.durationSpan,
      layer: event.layer,
      color: event.color,
      chapter_range: event.chapterRange,
      created_at: event.createdAt,
      updated_at: event.updatedAt,
    };
  }

  // ============ 数据导入功能 ============

  /**
   * 从 JSON 导入数据
   * 
   * @param bookPath - 书籍文件夹路径
   * @param jsonContent - JSON 内容
   * @param options - 导入选项
   * @returns 导入结果
   * 
   * Requirements: 1.1.6
   */
  async importFromJson(
    bookPath: string,
    jsonContent: string,
    options: { conflictStrategy: 'skip' | 'overwrite' | 'merge'; autoCreateFields: boolean } = {
      conflictStrategy: 'skip',
      autoCreateFields: true,
    }
  ): Promise<{ success: boolean; importedCount: number; skippedCount: number; errors: string[] }> {
    const result = {
      success: true,
      importedCount: 0,
      skippedCount: 0,
      errors: [] as string[],
    };

    try {
      const data = JSON.parse(jsonContent);

      // 确保数据库已初始化
      const isInitialized = await this.isDatabaseInitialized(bookPath);
      if (!isInitialized && data.bookMeta) {
        await this.initializeDatabase(bookPath, {
          title: data.bookMeta.title || 'Imported Book',
          author: data.bookMeta.author,
          description: data.bookMeta.description,
        });
      }

      const bookId = await this.getBookId(bookPath);
      if (!bookId) {
        result.success = false;
        result.errors.push('无法获取书籍 ID');
        return result;
      }

      // 导入书籍元数据
      if (data.bookMeta) {
        await this.importBookMeta(bookPath, data.bookMeta, options, result);
      }

      // 导入人物
      if (data.characters && Array.isArray(data.characters)) {
        await this.importCharacters(bookPath, bookId, data.characters, options, result);
      }

      // 导入故事单元
      if (data.storyUnits && Array.isArray(data.storyUnits)) {
        await this.importStoryUnits(bookPath, bookId, data.storyUnits, options, result);
      }

      // 导入事件
      if (data.events && Array.isArray(data.events)) {
        await this.importEvents(bookPath, bookId, data.events, options, result);
      }

    } catch (error) {
      result.success = false;
      result.errors.push(
        error instanceof Error ? error.message : '导入过程中发生未知错误'
      );
    }

    return result;
  }

  /**
   * 从 CSV 导入数据
   * 
   * @param bookPath - 书籍文件夹路径
   * @param csvContent - CSV 内容
   * @param tableType - 表类型
   * @param options - 导入选项
   * @returns 导入结果
   * 
   * Requirements: 1.1.6
   */
  async importFromCsv(
    bookPath: string,
    csvContent: string,
    tableType: 'characters' | 'story_units' | 'events',
    options: { conflictStrategy: 'skip' | 'overwrite' | 'merge'; autoCreateFields: boolean } = {
      conflictStrategy: 'skip',
      autoCreateFields: true,
    }
  ): Promise<{ success: boolean; importedCount: number; skippedCount: number; errors: string[] }> {
    const result = {
      success: true,
      importedCount: 0,
      skippedCount: 0,
      errors: [] as string[],
    };

    try {
      const rows = this.parseCsv(csvContent);
      if (rows.length < 2) {
        result.errors.push('CSV 文件为空或格式不正确');
        return result;
      }

      const headers = rows[0];
      const dataRows = rows.slice(1);

      const bookId = await this.getBookId(bookPath);
      if (!bookId) {
        result.success = false;
        result.errors.push('无法获取书籍 ID');
        return result;
      }

      // 将 CSV 行转换为对象
      const records = dataRows.map(row => {
        const record: Record<string, string> = {};
        headers.forEach((header, index) => {
          record[header] = row[index] || '';
        });
        return record;
      });

      switch (tableType) {
        case 'characters':
          await this.importCharactersFromCsv(bookPath, bookId, records, options, result);
          break;
        case 'story_units':
          await this.importStoryUnitsFromCsv(bookPath, bookId, records, options, result);
          break;
        case 'events':
          await this.importEventsFromCsv(bookPath, bookId, records, options, result);
          break;
      }

    } catch (error) {
      result.success = false;
      result.errors.push(
        error instanceof Error ? error.message : '导入过程中发生未知错误'
      );
    }

    return result;
  }

  /**
   * 解析 CSV 内容
   */
  private parseCsv(content: string): string[][] {
    const rows: string[][] = [];
    const lines = content.split('\n');
    
    for (const line of lines) {
      if (!line.trim()) continue;
      
      const row: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          row.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      row.push(current);
      rows.push(row);
    }
    
    return rows;
  }

  /**
   * 导入书籍元数据
   */
  private async importBookMeta(
    bookPath: string,
    data: Record<string, unknown>,
    options: { conflictStrategy: 'skip' | 'overwrite' | 'merge' },
    result: { importedCount: number; skippedCount: number; errors: string[] }
  ): Promise<void> {
    const existing = await this.getBookMeta(bookPath);
    
    if (existing && options.conflictStrategy === 'skip') {
      result.skippedCount++;
      return;
    }

    const updates: Partial<BookMeta> = {};
    
    if (data.ai_synopsis || data.aiSynopsis) {
      updates.aiSynopsis = String(data.ai_synopsis || data.aiSynopsis);
    }
    if (data.ai_writing_techniques || data.aiWritingTechniques) {
      const techniques = data.ai_writing_techniques || data.aiWritingTechniques;
      updates.aiWritingTechniques = Array.isArray(techniques) ? techniques.map(String) : [];
    }
    if (data.ai_takeaways || data.aiTakeaways) {
      const takeaways = data.ai_takeaways || data.aiTakeaways;
      updates.aiTakeaways = Array.isArray(takeaways) ? takeaways.map(String) : [];
    }
    if (data.custom_fields || data.customFields) {
      updates.customFields = (data.custom_fields || data.customFields) as Record<string, unknown>;
    }

    await this.updateBookMeta(bookPath, updates);
    result.importedCount++;
  }

  /**
   * 导入人物数据
   */
  private async importCharacters(
    bookPath: string,
    bookId: string,
    characters: Record<string, unknown>[],
    options: { conflictStrategy: 'skip' | 'overwrite' | 'merge' },
    result: { importedCount: number; skippedCount: number; errors: string[] }
  ): Promise<void> {
    const existingCharacters = await this.getCharacters(bookPath);
    const existingNameMap = new Map(existingCharacters.map(c => [c.name, c]));

    for (const charData of characters) {
      try {
        const name = String(charData.name || '');
        if (!name) {
          result.errors.push('人物名称为空，跳过');
          result.skippedCount++;
          continue;
        }

        const existing = existingNameMap.get(name);

        if (existing) {
          if (options.conflictStrategy === 'skip') {
            result.skippedCount++;
            continue;
          }

          // 更新现有人物
          await this.updateCharacter(bookPath, existing.characterId, {
            aiDescription: charData.ai_description || charData.aiDescription 
              ? String(charData.ai_description || charData.aiDescription) 
              : existing.aiDescription,
            aiMotivation: charData.ai_motivation || charData.aiMotivation
              ? String(charData.ai_motivation || charData.aiMotivation)
              : existing.aiMotivation,
            aiGrowthArc: charData.ai_growth_arc || charData.aiGrowthArc
              ? String(charData.ai_growth_arc || charData.aiGrowthArc)
              : existing.aiGrowthArc,
            role: (charData.role as Character['role']) || existing.role,
            tags: Array.isArray(charData.tags) ? charData.tags.map(String) : existing.tags,
          });
        } else {
          // 添加新人物
          await this.addCharacter(bookPath, {
            bookId,
            name,
            role: (charData.role as Character['role']) || 'supporting',
            aliases: Array.isArray(charData.aliases) ? charData.aliases.map(String) : undefined,
            tags: Array.isArray(charData.tags) ? charData.tags.map(String) : undefined,
            aiDescription: charData.ai_description || charData.aiDescription
              ? String(charData.ai_description || charData.aiDescription)
              : undefined,
            aiMotivation: charData.ai_motivation || charData.aiMotivation
              ? String(charData.ai_motivation || charData.aiMotivation)
              : undefined,
            aiGrowthArc: charData.ai_growth_arc || charData.aiGrowthArc
              ? String(charData.ai_growth_arc || charData.aiGrowthArc)
              : undefined,
            relationships: this.parseImportedRelationships(charData.relationships),
            firstAppearanceChapter: Number(charData.first_appearance_chapter || charData.firstAppearanceChapter) || 0,
            appearanceChapters: Array.isArray(charData.appearance_chapters) 
              ? (charData.appearance_chapters as unknown[]).map(Number)
              : Array.isArray(charData.appearanceChapters)
                ? (charData.appearanceChapters as unknown[]).map(Number)
                : [],
            source: (charData.source as Character['source']) || 'manual',
          });
        }
        result.importedCount++;
      } catch (error) {
        result.errors.push(`导入人物失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }
  }

  /**
   * 导入故事单元数据
   */
  private async importStoryUnits(
    bookPath: string,
    bookId: string,
    storyUnits: Record<string, unknown>[],
    options: { conflictStrategy: 'skip' | 'overwrite' | 'merge' },
    result: { importedCount: number; skippedCount: number; errors: string[] }
  ): Promise<void> {
    const existingUnits = await this.getStoryUnits(bookPath);
    const existingNameMap = new Map(existingUnits.map(u => [u.name, u]));

    for (const unitData of storyUnits) {
      try {
        const name = String(unitData.name || '');
        if (!name) {
          result.errors.push('故事单元名称为空，跳过');
          result.skippedCount++;
          continue;
        }

        const existing = existingNameMap.get(name);
        const chapterRange = unitData.chapter_range || unitData.chapterRange;

        if (existing) {
          if (options.conflictStrategy === 'skip') {
            result.skippedCount++;
            continue;
          }

          await this.updateStoryUnit(bookPath, existing.unitId, {
            lineType: (unitData.line_type || unitData.lineType) as StoryUnit['lineType'] || existing.lineType,
            categories: Array.isArray(unitData.categories) ? unitData.categories.map(String) : existing.categories,
            relatedCharacters: Array.isArray(unitData.related_characters)
              ? (unitData.related_characters as unknown[]).map(String)
              : Array.isArray(unitData.relatedCharacters)
                ? (unitData.relatedCharacters as unknown[]).map(String)
                : existing.relatedCharacters,
          });
        } else {
          await this.addStoryUnit(bookPath, {
            bookId,
            name,
            chapterRange: chapterRange ? {
              start: Number((chapterRange as Record<string, unknown>).start) || 1,
              end: Number((chapterRange as Record<string, unknown>).end) || 1,
            } : { start: 1, end: 1 },
            lineType: (unitData.line_type || unitData.lineType) as StoryUnit['lineType'] || 'main',
            customLineType: unitData.custom_line_type || unitData.customLineType
              ? String(unitData.custom_line_type || unitData.customLineType)
              : undefined,
            categories: Array.isArray(unitData.categories) ? unitData.categories.map(String) : undefined,
            relatedCharacters: Array.isArray(unitData.related_characters)
              ? (unitData.related_characters as unknown[]).map(String)
              : Array.isArray(unitData.relatedCharacters)
                ? (unitData.relatedCharacters as unknown[]).map(String)
                : [],
            textContent: unitData.text_content || unitData.textContent
              ? String(unitData.text_content || unitData.textContent)
              : undefined,
            analysisTemplate: (unitData.analysis_template || unitData.analysisTemplate) as StoryUnit['analysisTemplate'] || 'seven-step',
            source: (unitData.source as StoryUnit['source']) || 'manual',
          });
        }
        result.importedCount++;
      } catch (error) {
        result.errors.push(`导入故事单元失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }
  }

  /**
   * 导入事件数据
   */
  private async importEvents(
    bookPath: string,
    bookId: string,
    events: Record<string, unknown>[],
    options: { conflictStrategy: 'skip' | 'overwrite' | 'merge' },
    result: { importedCount: number; skippedCount: number; errors: string[] }
  ): Promise<void> {
    const existingEvents = await this.getEvents(bookPath);
    const existingNameMap = new Map(existingEvents.map(e => [e.name, e]));

    for (const eventData of events) {
      try {
        const name = String(eventData.name || '');
        if (!name) {
          result.errors.push('事件名称为空，跳过');
          result.skippedCount++;
          continue;
        }

        const existing = existingNameMap.get(name);
        const chapterRange = eventData.chapter_range || eventData.chapterRange;

        if (existing) {
          if (options.conflictStrategy === 'skip') {
            result.skippedCount++;
            continue;
          }

          await this.updateEvent(bookPath, existing.eventId, {
            description: eventData.description ? String(eventData.description) : existing.description,
            pseudoTimeOrder: Number(eventData.pseudo_time_order || eventData.pseudoTimeOrder) || existing.pseudoTimeOrder,
            durationSpan: Number(eventData.duration_span || eventData.durationSpan) || existing.durationSpan,
            layer: Number(eventData.layer) || existing.layer,
            color: eventData.color ? String(eventData.color) : existing.color,
          });
        } else {
          await this.addEvent(bookPath, {
            bookId,
            name,
            storyUnitId: eventData.story_unit_id || eventData.storyUnitId
              ? String(eventData.story_unit_id || eventData.storyUnitId)
              : undefined,
            description: eventData.description ? String(eventData.description) : undefined,
            pseudoTimeOrder: Number(eventData.pseudo_time_order || eventData.pseudoTimeOrder) || 0,
            durationSpan: Number(eventData.duration_span || eventData.durationSpan) || 1,
            layer: Number(eventData.layer) || 0,
            color: eventData.color ? String(eventData.color) : '#4ECDC4',
            chapterRange: chapterRange ? {
              start: Number((chapterRange as Record<string, unknown>).start) || 1,
              end: Number((chapterRange as Record<string, unknown>).end) || 1,
            } : { start: 1, end: 1 },
          });
        }
        result.importedCount++;
      } catch (error) {
        result.errors.push(`导入事件失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }
  }

  /**
   * 从 CSV 导入人物
   */
  private async importCharactersFromCsv(
    bookPath: string,
    bookId: string,
    records: Record<string, string>[],
    options: { conflictStrategy: 'skip' | 'overwrite' | 'merge' },
    result: { importedCount: number; skippedCount: number; errors: string[] }
  ): Promise<void> {
    const characters = records.map(r => ({
      name: r.name,
      role: r.role,
      aliases: r.aliases ? r.aliases.split(';').map(s => s.trim()) : undefined,
      tags: r.tags ? r.tags.split(';').map(s => s.trim()) : undefined,
      ai_description: r.ai_description,
      ai_motivation: r.ai_motivation,
      ai_growth_arc: r.ai_growth_arc,
      first_appearance_chapter: r.first_appearance_chapter ? parseInt(r.first_appearance_chapter, 10) : 0,
      appearance_chapters: r.appearance_chapters 
        ? r.appearance_chapters.split(';').map(s => parseInt(s.trim(), 10))
        : [],
      source: r.source || 'manual',
    }));

    await this.importCharacters(bookPath, bookId, characters, options, result);
  }

  /**
   * 从 CSV 导入故事单元
   */
  private async importStoryUnitsFromCsv(
    bookPath: string,
    bookId: string,
    records: Record<string, string>[],
    options: { conflictStrategy: 'skip' | 'overwrite' | 'merge' },
    result: { importedCount: number; skippedCount: number; errors: string[] }
  ): Promise<void> {
    const storyUnits = records.map(r => ({
      name: r.name,
      chapter_range: {
        start: parseInt(r.chapter_start, 10) || 1,
        end: parseInt(r.chapter_end, 10) || 1,
      },
      line_type: r.line_type || 'main',
      custom_line_type: r.custom_line_type,
      categories: r.categories ? r.categories.split(';').map(s => s.trim()) : undefined,
      related_characters: r.related_characters 
        ? r.related_characters.split(';').map(s => s.trim())
        : [],
      analysis_template: r.analysis_template || 'seven-step',
      source: r.source || 'manual',
    }));

    await this.importStoryUnits(bookPath, bookId, storyUnits, options, result);
  }

  /**
   * 从 CSV 导入事件
   */
  private async importEventsFromCsv(
    bookPath: string,
    bookId: string,
    records: Record<string, string>[],
    options: { conflictStrategy: 'skip' | 'overwrite' | 'merge' },
    result: { importedCount: number; skippedCount: number; errors: string[] }
  ): Promise<void> {
    const events = records.map(r => ({
      name: r.name,
      story_unit_id: r.story_unit_id,
      description: r.description,
      pseudo_time_order: parseInt(r.pseudo_time_order, 10) || 0,
      duration_span: parseInt(r.duration_span, 10) || 1,
      layer: parseInt(r.layer, 10) || 0,
      color: r.color || '#4ECDC4',
      chapter_range: {
        start: parseInt(r.chapter_start, 10) || 1,
        end: parseInt(r.chapter_end, 10) || 1,
      },
    }));

    await this.importEvents(bookPath, bookId, events, options, result);
  }

  /**
   * 解析导入的人物关系数据
   */
  private parseImportedRelationships(data: unknown): CharacterRelationship[] {
    if (!Array.isArray(data)) {
      return [];
    }

    return data.map((item: Record<string, unknown>) => ({
      targetCharacterId: String(item.target_character_id || item.targetCharacterId || ''),
      targetName: String(item.target_name || item.targetName || ''),
      relationshipType: (item.relationship_type || item.relationshipType || 'custom') as CharacterRelationship['relationshipType'],
      customType: item.custom_type || item.customType ? String(item.custom_type || item.customType) : undefined,
      description: item.description ? String(item.description) : undefined,
    }));
  }

  // ============ 辅助方法 ============

  /**
   * 检查数据库是否已初始化
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns 是否已初始化
   */
  async isDatabaseInitialized(bookPath: string): Promise<boolean> {
    const metaPath = normalizePath(`${bookPath}/${DATABASE_FILES.BOOK_META}`);
    return await this.app.vault.adapter.exists(metaPath);
  }

  /**
   * 获取书籍 ID
   * 
   * @param bookPath - 书籍文件夹路径
   * @returns 书籍 ID，如果不存在返回 null
   */
  async getBookId(bookPath: string): Promise<string | null> {
    const bookMeta = await this.getBookMeta(bookPath);
    return bookMeta?.bookId || null;
  }

  // ============ 私有辅助方法 ============

  /**
   * 确保文件夹存在
   */
  private async ensureFolder(folderPath: string): Promise<void> {
    const normalizedPath = normalizePath(folderPath);
    const exists = await this.app.vault.adapter.exists(normalizedPath);
    
    if (!exists) {
      try {
        await this.app.vault.createFolder(normalizedPath);
      } catch (error) {
        // 忽略 "File already exists" 错误
        if (error instanceof Error && !error.message.includes('already exists')) {
          throw error;
        }
      }
    }
  }

  /**
   * 读取文件内容
   */
  private async readFile(filePath: string): Promise<string | null> {
    const normalizedPath = normalizePath(filePath);
    
    try {
      const exists = await this.app.vault.adapter.exists(normalizedPath);
      if (!exists) {
        return null;
      }
      return await this.app.vault.adapter.read(normalizedPath);
    } catch {
      return null;
    }
  }

  /**
   * 写入文件内容
   */
  private async writeFile(filePath: string, content: string): Promise<void> {
    const normalizedPath = normalizePath(filePath);
    await this.app.vault.adapter.write(normalizedPath, content);
  }

  /**
   * 将 BookMeta 转换为 Frontmatter 格式（snake_case）
   */
  private bookMetaToFrontmatter(bookMeta: BookMeta): Record<string, unknown> {
    const data: Record<string, unknown> = {
      type: 'book-database',
      version: DATABASE_VERSION,
      book_id: bookMeta.bookId,
      title: bookMeta.title,
      author: bookMeta.author,
      description: bookMeta.description,
      total_chapters: bookMeta.totalChapters,
      total_words: bookMeta.totalWords,
      reading_status: bookMeta.readingStatus,
      current_chapter: bookMeta.currentChapter,
      converted_at: bookMeta.convertedAt,
      created_at: bookMeta.createdAt,
      updated_at: bookMeta.updatedAt,
    };
    
    // 添加可选字段
    if (bookMeta.coverImage) data.cover_image = bookMeta.coverImage;
    if (bookMeta.aiSynopsis) data.ai_synopsis = bookMeta.aiSynopsis;
    if (bookMeta.aiWritingTechniques) data.ai_writing_techniques = bookMeta.aiWritingTechniques;
    if (bookMeta.aiTakeaways) data.ai_takeaways = bookMeta.aiTakeaways;
    if (bookMeta.lastReadAt) data.last_read_at = bookMeta.lastReadAt;
    if (bookMeta.customFields) data.custom_fields = bookMeta.customFields;
    
    return data;
  }

  /**
   * 将 Frontmatter 数据转换为 BookMeta
   */
  private frontmatterToBookMeta(data: Record<string, unknown>): BookMeta {
    return {
      bookId: String(data.book_id || ''),
      title: String(data.title || ''),
      author: String(data.author || ''),
      description: String(data.description || ''),
      coverImage: data.cover_image ? String(data.cover_image) : undefined,
      totalChapters: Number(data.total_chapters) || 0,
      totalWords: Number(data.total_words) || 0,
      aiSynopsis: data.ai_synopsis ? String(data.ai_synopsis) : undefined,
      aiWritingTechniques: Array.isArray(data.ai_writing_techniques)
        ? data.ai_writing_techniques.map(String)
        : undefined,
      aiTakeaways: Array.isArray(data.ai_takeaways)
        ? data.ai_takeaways.map(String)
        : undefined,
      readingStatus: (data.reading_status as BookMeta['readingStatus']) || 'unread',
      currentChapter: Number(data.current_chapter) || 0,
      lastReadAt: data.last_read_at ? String(data.last_read_at) : undefined,
      convertedAt: String(data.converted_at || new Date().toISOString()),
      createdAt: String(data.created_at || new Date().toISOString()),
      updatedAt: String(data.updated_at || new Date().toISOString()),
      customFields: data.custom_fields as Record<string, unknown> | undefined,
    };
  }

  // ============ 人物表解析和生成 ============

  /**
   * 从文件内容解析人物列表
   */
  private parseCharactersFromContent(content: string): Character[] {
    const characters: Character[] = [];
    
    // 查找人物数据块（使用 ```json 代码块格式）
    const dataBlockRegex = /```json:characters\n([\s\S]*?)\n```/g;
    let match;
    
    while ((match = dataBlockRegex.exec(content)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        if (Array.isArray(data)) {
          for (const item of data) {
            characters.push(this.parseCharacterData(item));
          }
        } else if (data.characterId) {
          characters.push(this.parseCharacterData(data));
        }
      } catch {
        // 忽略解析错误
      }
    }
    
    // 如果没有找到 JSON 块，尝试解析 Dataview 内联字段格式
    if (characters.length === 0) {
      const lines = content.split('\n');
      let currentCharacter: Partial<Character> | null = null;
      
      for (const line of lines) {
        // 检查是否是人物标题（### 人物名）
        const titleMatch = line.match(/^###\s+(.+)$/);
        if (titleMatch) {
          if (currentCharacter && currentCharacter.characterId) {
            characters.push(this.completeCharacter(currentCharacter));
          }
          currentCharacter = { name: titleMatch[1].trim() };
          continue;
        }
        
        // 解析内联字段
        if (currentCharacter) {
          const fieldMatch = line.match(/^(\w+)::\s*(.+)$/);
          if (fieldMatch) {
            const [, key, value] = fieldMatch;
            this.setCharacterField(currentCharacter, key, value);
          }
        }
      }
      
      // 添加最后一个人物
      if (currentCharacter && currentCharacter.characterId) {
        characters.push(this.completeCharacter(currentCharacter));
      }
    }
    
    return characters;
  }

  /**
   * 解析单个人物数据
   */
  private parseCharacterData(data: Record<string, unknown>): Character {
    return {
      characterId: String(data.character_id || data.characterId || ''),
      bookId: String(data.book_id || data.bookId || ''),
      name: String(data.name || ''),
      aliases: Array.isArray(data.aliases) ? data.aliases.map(String) : undefined,
      role: (data.role as Character['role']) || 'supporting',
      tags: Array.isArray(data.tags) ? data.tags.map(String) : undefined,
      aiDescription: data.ai_description || data.aiDescription ? String(data.ai_description || data.aiDescription) : undefined,
      aiMotivation: data.ai_motivation || data.aiMotivation ? String(data.ai_motivation || data.aiMotivation) : undefined,
      aiGrowthArc: data.ai_growth_arc || data.aiGrowthArc ? String(data.ai_growth_arc || data.aiGrowthArc) : undefined,
      relationships: this.parseRelationships(data.relationships),
      firstAppearanceChapter: Number(data.first_appearance_chapter || data.firstAppearanceChapter) || 0,
      appearanceChapters: Array.isArray(data.appearance_chapters) 
        ? (data.appearance_chapters as unknown[]).map(Number) 
        : Array.isArray(data.appearanceChapters)
          ? (data.appearanceChapters as unknown[]).map(Number)
          : [],
      source: (data.source as Character['source']) || 'manual',
      createdAt: String(data.created_at || data.createdAt || new Date().toISOString()),
      updatedAt: String(data.updated_at || data.updatedAt || new Date().toISOString()),
    };
  }

  /**
   * 解析人物关系数据
   */
  private parseRelationships(data: unknown): CharacterRelationship[] {
    if (!Array.isArray(data)) {
      return [];
    }
    
    return data.map((item: Record<string, unknown>) => ({
      targetCharacterId: String(item.target_character_id || item.targetCharacterId || ''),
      targetName: String(item.target_name || item.targetName || ''),
      relationshipType: (item.relationship_type || item.relationshipType || 'custom') as CharacterRelationship['relationshipType'],
      customType: item.custom_type || item.customType ? String(item.custom_type || item.customType) : undefined,
      description: item.description ? String(item.description) : undefined,
      changes: Array.isArray(item.changes) ? item.changes.map((c: Record<string, unknown>) => ({
        storyUnitId: String(c.story_unit_id || c.storyUnitId || ''),
        chapter: Number(c.chapter) || 0,
        description: String(c.description || ''),
      })) : undefined,
    }));
  }

  /**
   * 设置人物字段（从内联字段格式）
   */
  private setCharacterField(character: Partial<Character>, key: string, value: string): void {
    switch (key.toLowerCase()) {
      case 'character_id':
      case 'characterid':
        character.characterId = value;
        break;
      case 'book_id':
      case 'bookid':
        character.bookId = value;
        break;
      case 'role':
        character.role = value as Character['role'];
        break;
      case 'tags':
        character.tags = value.split(',').map(t => t.trim());
        break;
      case 'aliases':
        character.aliases = value.split(',').map(a => a.trim());
        break;
      case 'ai_description':
      case 'aidescription':
        character.aiDescription = value;
        break;
      case 'source':
        character.source = value as Character['source'];
        break;
      case 'relationships':
        try {
          character.relationships = JSON.parse(value);
        } catch {
          character.relationships = [];
        }
        break;
      case 'first_appearance_chapter':
      case 'firstappearancechapter':
        character.firstAppearanceChapter = parseInt(value, 10) || 0;
        break;
      case 'appearance_chapters':
      case 'appearancechapters':
        character.appearanceChapters = value.split(',').map(c => parseInt(c.trim(), 10));
        break;
      case 'created_at':
      case 'createdat':
        character.createdAt = value;
        break;
      case 'updated_at':
      case 'updatedat':
        character.updatedAt = value;
        break;
    }
  }

  /**
   * 补全人物数据的默认值
   */
  private completeCharacter(partial: Partial<Character>): Character {
    const now = new Date().toISOString();
    return {
      characterId: partial.characterId || '',
      bookId: partial.bookId || '',
      name: partial.name || '',
      aliases: partial.aliases,
      role: partial.role || 'supporting',
      tags: partial.tags,
      aiDescription: partial.aiDescription,
      aiMotivation: partial.aiMotivation,
      aiGrowthArc: partial.aiGrowthArc,
      relationships: partial.relationships || [],
      firstAppearanceChapter: partial.firstAppearanceChapter || 0,
      appearanceChapters: partial.appearanceChapters || [],
      source: partial.source || 'manual',
      createdAt: partial.createdAt || now,
      updatedAt: partial.updatedAt || now,
    };
  }

  /**
   * 生成人物表文件内容
   */
  private generateCharactersContent(originalContent: string, characters: Character[]): string {
    const parsed = parseFrontmatter(originalContent);
    
    // 更新 Frontmatter 的 updated_at
    const frontmatterData = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    };
    const frontmatter = generateFrontmatter(frontmatterData as Record<string, unknown>);
    
    // 生成人物列表内容
    let charactersContent = '';
    
    if (characters.length === 0) {
      charactersContent = '_暂无人物数据_';
    } else {
      // 使用 JSON 代码块存储数据（便于解析）
      const jsonData = characters.map(c => ({
        character_id: c.characterId,
        book_id: c.bookId,
        name: c.name,
        aliases: c.aliases,
        role: c.role,
        tags: c.tags,
        ai_description: c.aiDescription,
        ai_motivation: c.aiMotivation,
        ai_growth_arc: c.aiGrowthArc,
        relationships: c.relationships.map(r => ({
          target_character_id: r.targetCharacterId,
          target_name: r.targetName,
          relationship_type: r.relationshipType,
          custom_type: r.customType,
          description: r.description,
          changes: r.changes,
        })),
        first_appearance_chapter: c.firstAppearanceChapter,
        appearance_chapters: c.appearanceChapters,
        source: c.source,
        created_at: c.createdAt,
        updated_at: c.updatedAt,
      }));
      
      charactersContent = '```json:characters\n' + JSON.stringify(jsonData, null, 2) + '\n```';
      
      // 同时生成可读的 Markdown 格式
      charactersContent += '\n\n---\n\n';
      for (const char of characters) {
        charactersContent += `### ${char.name}\n\n`;
        charactersContent += `- **角色**: ${this.getRoleLabel(char.role)}\n`;
        if (char.tags && char.tags.length > 0) {
          charactersContent += `- **标签**: ${char.tags.join(', ')}\n`;
        }
        if (char.aiDescription) {
          charactersContent += `- **设定**: ${char.aiDescription}\n`;
        }
        if (char.relationships.length > 0) {
          charactersContent += `- **关系**:\n`;
          for (const rel of char.relationships) {
            charactersContent += `  - ${rel.targetName}: ${rel.description || this.getRelationshipLabel(rel.relationshipType)}\n`;
          }
        }
        charactersContent += '\n';
      }
    }
    
    return `${frontmatter}

# 人物表

> 此文件存储书籍的人物数据，支持 Dataview 查询。

## 人物列表

${charactersContent}
`;
  }

  /**
   * 获取角色类型标签
   */
  private getRoleLabel(role: Character['role']): string {
    const labels: Record<Character['role'], string> = {
      protagonist: '主角',
      antagonist: '反派',
      supporting: '配角',
      minor: '龙套',
    };
    return labels[role] || role;
  }

  /**
   * 获取关系类型标签
   */
  private getRelationshipLabel(type: CharacterRelationship['relationshipType']): string {
    const labels: Record<CharacterRelationship['relationshipType'], string> = {
      friend: '朋友',
      enemy: '敌人',
      family: '家人',
      lover: '恋人',
      rival: '对手',
      custom: '其他',
    };
    return labels[type] || type;
  }

  // ============ 故事单元表解析和生成 ============

  /**
   * 从文件内容解析故事单元列表
   */
  private parseStoryUnitsFromContent(content: string): StoryUnit[] {
    const storyUnits: StoryUnit[] = [];
    
    // 查找故事单元数据块
    const dataBlockRegex = /```json:story_units\n([\s\S]*?)\n```/g;
    let match;
    
    while ((match = dataBlockRegex.exec(content)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        if (Array.isArray(data)) {
          for (const item of data) {
            storyUnits.push(this.parseStoryUnitData(item));
          }
        } else if (data.unitId || data.unit_id) {
          storyUnits.push(this.parseStoryUnitData(data));
        }
      } catch {
        // 忽略解析错误
      }
    }
    
    return storyUnits;
  }

  /**
   * 解析单个故事单元数据
   */
  private parseStoryUnitData(data: Record<string, unknown>): StoryUnit {
    const chapterRange = data.chapter_range || data.chapterRange;
    const preciseRange = data.precise_range || data.preciseRange;
    const aiAnalysis = data.ai_analysis || data.aiAnalysis;
    
    return {
      unitId: String(data.unit_id || data.unitId || ''),
      bookId: String(data.book_id || data.bookId || ''),
      name: String(data.name || ''),
      chapterRange: chapterRange ? {
        start: Number((chapterRange as Record<string, unknown>).start) || 0,
        end: Number((chapterRange as Record<string, unknown>).end) || 0,
      } : { start: 0, end: 0 },
      preciseRange: preciseRange ? {
        start: {
          chapterIndex: Number(((preciseRange as Record<string, unknown>).start as Record<string, unknown>)?.chapterIndex || ((preciseRange as Record<string, unknown>).start as Record<string, unknown>)?.chapter_index) || 0,
          lineNumber: Number(((preciseRange as Record<string, unknown>).start as Record<string, unknown>)?.lineNumber || ((preciseRange as Record<string, unknown>).start as Record<string, unknown>)?.line_number) || 0,
          characterOffset: Number(((preciseRange as Record<string, unknown>).start as Record<string, unknown>)?.characterOffset || ((preciseRange as Record<string, unknown>).start as Record<string, unknown>)?.character_offset) || 0,
        },
        end: {
          chapterIndex: Number(((preciseRange as Record<string, unknown>).end as Record<string, unknown>)?.chapterIndex || ((preciseRange as Record<string, unknown>).end as Record<string, unknown>)?.chapter_index) || 0,
          lineNumber: Number(((preciseRange as Record<string, unknown>).end as Record<string, unknown>)?.lineNumber || ((preciseRange as Record<string, unknown>).end as Record<string, unknown>)?.line_number) || 0,
          characterOffset: Number(((preciseRange as Record<string, unknown>).end as Record<string, unknown>)?.characterOffset || ((preciseRange as Record<string, unknown>).end as Record<string, unknown>)?.character_offset) || 0,
        },
      } : undefined,
      lineType: (data.line_type || data.lineType || 'main') as StoryUnit['lineType'],
      customLineType: data.custom_line_type || data.customLineType ? String(data.custom_line_type || data.customLineType) : undefined,
      categories: Array.isArray(data.categories) ? data.categories.map(String) : undefined,
      relatedCharacters: Array.isArray(data.related_characters) 
        ? (data.related_characters as unknown[]).map(String) 
        : Array.isArray(data.relatedCharacters)
          ? (data.relatedCharacters as unknown[]).map(String)
          : [],
      textContent: data.text_content || data.textContent ? String(data.text_content || data.textContent) : undefined,
      textFilePath: data.text_file_path || data.textFilePath ? String(data.text_file_path || data.textFilePath) : undefined,
      analysisTemplate: (data.analysis_template || data.analysisTemplate || 'seven-step') as StoryUnit['analysisTemplate'],
      aiAnalysis: aiAnalysis ? this.parseStoryUnitAnalysis(aiAnalysis as Record<string, unknown>) : undefined,
      source: (data.source || 'manual') as StoryUnit['source'],
      createdAt: String(data.created_at || data.createdAt || new Date().toISOString()),
      updatedAt: String(data.updated_at || data.updatedAt || new Date().toISOString()),
    };
  }

  /**
   * 解析故事单元分析结果
   */
  private parseStoryUnitAnalysis(data: Record<string, unknown>): StoryUnit['aiAnalysis'] {
    const sevenStepData = (data.seven_step || data.sevenStep) as Record<string, unknown> | undefined;
    
    return {
      summary: String(data.summary || ''),
      sevenStep: sevenStepData ? {
        step1Advantage: String(sevenStepData.step1Advantage || sevenStepData.step1_advantage || ''),
        step2Villain: String(sevenStepData.step2Villain || sevenStepData.step2_villain || ''),
        step3Friction: String(sevenStepData.step3Friction || sevenStepData.step3_friction || ''),
        step4Expectation: String(sevenStepData.step4Expectation || sevenStepData.step4_expectation || ''),
        step5Climax: String(sevenStepData.step5Climax || sevenStepData.step5_climax || ''),
        step6Shock: String(sevenStepData.step6Shock || sevenStepData.step6_shock || ''),
        step7Reward: String(sevenStepData.step7Reward || sevenStepData.step7_reward || ''),
      } : undefined,
      techniques: Array.isArray(data.techniques) ? data.techniques.map(String) : undefined,
      takeaways: Array.isArray(data.takeaways) ? data.takeaways.map(String) : undefined,
      analyzedAt: String(data.analyzed_at || data.analyzedAt || new Date().toISOString()),
    };
  }

  /**
   * 生成故事单元表文件内容
   */
  private generateStoryUnitsContent(originalContent: string, storyUnits: StoryUnit[]): string {
    const parsed = parseFrontmatter(originalContent);
    
    // 更新 Frontmatter 的 updated_at
    const frontmatterData = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    };
    const frontmatter = generateFrontmatter(frontmatterData as Record<string, unknown>);
    
    // 生成故事单元列表内容
    let unitsContent = '';
    
    if (storyUnits.length === 0) {
      unitsContent = '_暂无故事单元数据_';
    } else {
      // 使用 JSON 代码块存储数据
      const jsonData = storyUnits.map(u => ({
        unit_id: u.unitId,
        book_id: u.bookId,
        name: u.name,
        chapter_range: u.chapterRange,
        precise_range: u.preciseRange ? {
          start: {
            chapter_index: u.preciseRange.start.chapterIndex,
            line_number: u.preciseRange.start.lineNumber,
            character_offset: u.preciseRange.start.characterOffset,
          },
          end: {
            chapter_index: u.preciseRange.end.chapterIndex,
            line_number: u.preciseRange.end.lineNumber,
            character_offset: u.preciseRange.end.characterOffset,
          },
        } : undefined,
        line_type: u.lineType,
        custom_line_type: u.customLineType,
        categories: u.categories,
        related_characters: u.relatedCharacters,
        text_content: u.textContent,
        text_file_path: u.textFilePath,
        analysis_template: u.analysisTemplate,
        ai_analysis: u.aiAnalysis ? {
          summary: u.aiAnalysis.summary,
          seven_step: u.aiAnalysis.sevenStep,
          techniques: u.aiAnalysis.techniques,
          takeaways: u.aiAnalysis.takeaways,
          analyzed_at: u.aiAnalysis.analyzedAt,
        } : undefined,
        source: u.source,
        created_at: u.createdAt,
        updated_at: u.updatedAt,
      }));
      
      unitsContent = '```json:story_units\n' + JSON.stringify(jsonData, null, 2) + '\n```';
      
      // 同时生成可读的 Markdown 格式
      unitsContent += '\n\n---\n\n';
      for (const unit of storyUnits) {
        unitsContent += `### ${unit.name}\n\n`;
        unitsContent += `- **章节范围**: 第${unit.chapterRange.start}章 - 第${unit.chapterRange.end}章\n`;
        unitsContent += `- **故事线**: ${this.getLineTypeLabel(unit.lineType)}\n`;
        if (unit.categories && unit.categories.length > 0) {
          unitsContent += `- **分类**: ${unit.categories.join(', ')}\n`;
        }
        if (unit.aiAnalysis?.summary) {
          unitsContent += `- **摘要**: ${unit.aiAnalysis.summary}\n`;
        }
        unitsContent += '\n';
      }
    }
    
    return `${frontmatter}

# 故事单元表

> 此文件存储书籍的故事单元数据，支持 Dataview 查询。

## 故事单元列表

${unitsContent}
`;
  }

  /**
   * 获取故事线类型标签
   */
  private getLineTypeLabel(lineType: StoryUnit['lineType']): string {
    const labels: Record<StoryUnit['lineType'], string> = {
      main: '主线',
      sub: '支线',
      independent: '独立',
      custom: '自定义',
    };
    return labels[lineType] || lineType;
  }

  /**
   * 保存故事单元的大文本内容到单独文件
   */
  private async saveStoryUnitText(bookPath: string, unitId: string, content: string): Promise<string> {
    const textFolderPath = normalizePath(`${bookPath}/_story_unit_texts`);
    await this.ensureFolder(textFolderPath);
    
    const textFilePath = normalizePath(`${textFolderPath}/${unitId}.md`);
    await this.writeFile(textFilePath, content);
    
    return textFilePath;
  }

  // ============ 事件表解析和生成 ============

  /**
   * 从文件内容解析事件列表
   */
  private parseEventsFromContent(content: string): StoryEvent[] {
    const events: StoryEvent[] = [];
    
    // 查找事件数据块
    const dataBlockRegex = /```json:events\n([\s\S]*?)\n```/g;
    let match;
    
    while ((match = dataBlockRegex.exec(content)) !== null) {
      try {
        const data = JSON.parse(match[1]);
        if (Array.isArray(data)) {
          for (const item of data) {
            events.push(this.parseEventData(item));
          }
        } else if (data.eventId || data.event_id) {
          events.push(this.parseEventData(data));
        }
      } catch {
        // 忽略解析错误
      }
    }
    
    return events;
  }

  /**
   * 解析单个事件数据
   */
  private parseEventData(data: Record<string, unknown>): StoryEvent {
    const chapterRange = data.chapter_range || data.chapterRange;
    
    return {
      eventId: String(data.event_id || data.eventId || ''),
      bookId: String(data.book_id || data.bookId || ''),
      storyUnitId: data.story_unit_id || data.storyUnitId ? String(data.story_unit_id || data.storyUnitId) : undefined,
      name: String(data.name || ''),
      description: data.description ? String(data.description) : undefined,
      pseudoTimeOrder: Number(data.pseudo_time_order || data.pseudoTimeOrder) || 0,
      durationSpan: Number(data.duration_span || data.durationSpan) || 1,
      layer: Number(data.layer) || 0,
      color: String(data.color || '#4ECDC4'),
      chapterRange: chapterRange ? {
        start: Number((chapterRange as Record<string, unknown>).start) || 0,
        end: Number((chapterRange as Record<string, unknown>).end) || 0,
      } : { start: 0, end: 0 },
      createdAt: String(data.created_at || data.createdAt || new Date().toISOString()),
      updatedAt: String(data.updated_at || data.updatedAt || new Date().toISOString()),
    };
  }

  /**
   * 生成事件表文件内容
   */
  private generateEventsContent(originalContent: string, events: StoryEvent[]): string {
    const parsed = parseFrontmatter(originalContent);
    
    // 更新 Frontmatter 的 updated_at
    const frontmatterData = {
      ...parsed.data,
      updated_at: new Date().toISOString(),
    };
    const frontmatter = generateFrontmatter(frontmatterData as Record<string, unknown>);
    
    // 生成事件列表内容
    let eventsContent = '';
    
    if (events.length === 0) {
      eventsContent = '_暂无事件数据_';
    } else {
      // 使用 JSON 代码块存储数据
      const jsonData = events.map(e => ({
        event_id: e.eventId,
        book_id: e.bookId,
        story_unit_id: e.storyUnitId,
        name: e.name,
        description: e.description,
        pseudo_time_order: e.pseudoTimeOrder,
        duration_span: e.durationSpan,
        layer: e.layer,
        color: e.color,
        chapter_range: e.chapterRange,
        created_at: e.createdAt,
        updated_at: e.updatedAt,
      }));
      
      eventsContent = '```json:events\n' + JSON.stringify(jsonData, null, 2) + '\n```';
      
      // 同时生成可读的 Markdown 格式
      eventsContent += '\n\n---\n\n';
      
      // 按时间顺序排序显示
      const sortedEvents = [...events].sort((a, b) => a.pseudoTimeOrder - b.pseudoTimeOrder);
      
      for (const event of sortedEvents) {
        eventsContent += `### ${event.name}\n\n`;
        eventsContent += `- **时间顺序**: ${event.pseudoTimeOrder}\n`;
        eventsContent += `- **持续跨度**: ${event.durationSpan}\n`;
        eventsContent += `- **章节范围**: 第${event.chapterRange.start}章 - 第${event.chapterRange.end}章\n`;
        if (event.description) {
          eventsContent += `- **描述**: ${event.description}\n`;
        }
        eventsContent += '\n';
      }
    }
    
    return `${frontmatter}

# 事件表

> 此文件存储书籍的事件数据，用于时间轴甘特图展示。

## 事件列表

${eventsContent}
`;
  }
}
