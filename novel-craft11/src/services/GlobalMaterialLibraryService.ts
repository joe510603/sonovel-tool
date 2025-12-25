/**
 * GlobalMaterialLibraryService - 全局素材库服务
 * 
 * 跨书籍的素材收集和管理
 * 
 * 重构说明 (Requirements: 9.4):
 * - 改为基于 Dataview 的跨书籍查询
 * - 从各书籍的 _story_units.md 和 _characters.md 聚合数据
 * - 保留现有接口，修改底层实现
 */

import { App, TFolder, TFile, normalizePath } from 'obsidian';
import {
  GlobalMaterialItem,
  GlobalMaterialStorage,
  UnifiedMark,
  MarkAnalysisResult
} from '../types/unified-marking';
import { BookDatabaseService } from './BookDatabaseService';
import {
  StoryUnit,
  Character,
  DATABASE_FILES,
} from '../types/database';

/**
 * 添加素材参数
 */
export interface AddMaterialParams {
  title: string;
  type: GlobalMaterialItem['type'];
  sourceBookId: string;
  sourceBookTitle: string;
  markId: string;
  content: string;
  summary?: string;
  analysis?: MarkAnalysisResult;
  tags?: string[];
  category?: string;
}

/**
 * 素材过滤条件
 */
export interface MaterialFilter {
  type?: GlobalMaterialItem['type'];
  sourceBookId?: string;
  tags?: string[];
  category?: string;
  starred?: boolean;
  searchQuery?: string;
}

export class GlobalMaterialLibraryService {
  private app: App;
  private storagePath: string;
  private materials: GlobalMaterialItem[] = [];
  private loaded = false;
  
  /** 书籍数据库服务 */
  private bookDatabaseService: BookDatabaseService;
  /** 书籍根目录（用于扫描所有书籍） */
  private booksRootPath: string;
  /** 是否使用 Dataview 模式 */
  private useDataviewMode: boolean = true;

  constructor(
    app: App, 
    storagePath: string = '.novelcraft/global-materials.json',
    booksRootPath: string = 'NovelCraft/books'
  ) {
    this.app = app;
    this.storagePath = storagePath;
    this.booksRootPath = booksRootPath;
    this.bookDatabaseService = new BookDatabaseService(app);
  }

  /**
   * 设置 BookDatabaseService 实例
   */
  setBookDatabaseService(service: BookDatabaseService): void {
    this.bookDatabaseService = service;
  }

  /**
   * 设置书籍根目录
   */
  setBooksRootPath(path: string): void {
    this.booksRootPath = path;
  }

  /**
   * 设置是否使用 Dataview 模式
   * @param useDataview - 是否使用 Dataview 模式
   */
  setUseDataviewMode(useDataview: boolean): void {
    this.useDataviewMode = useDataview;
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    await this.load();
  }

  /**
   * 加载素材库
   * 
   * Requirements: 9.4 - 支持 Dataview 模式的跨书籍查询
   */
  private async load(): Promise<void> {
    try {
      if (this.useDataviewMode) {
        // Dataview 模式：从各书籍的数据库文件聚合数据
        await this.loadFromDataview();
      } else {
        // 传统模式：从 JSON 文件加载
        await this.loadFromJson();
      }
      this.loaded = true;
    } catch (error) {
      console.warn('Failed to load global material library:', error);
      this.materials = [];
      this.loaded = true;
    }
  }

  /**
   * 从 Dataview 兼容的数据库文件加载素材
   * 
   * Requirements: 9.4
   */
  private async loadFromDataview(): Promise<void> {
    this.materials = [];
    
    // 扫描所有书籍文件夹
    const bookFolders = await this.scanBookFolders();
    
    for (const bookFolder of bookFolders) {
      try {
        // 获取书籍元数据
        const bookMeta = await this.bookDatabaseService.getBookMeta(bookFolder.path);
        if (!bookMeta) continue;
        
        const bookId = bookMeta.bookId;
        const bookTitle = bookMeta.title;
        
        // 加载故事单元作为素材
        const storyUnits = await this.bookDatabaseService.getStoryUnits(bookFolder.path);
        for (const unit of storyUnits) {
          const material = this.storyUnitToMaterial(unit, bookId, bookTitle);
          this.materials.push(material);
        }
        
        // 加载人物作为素材
        const characters = await this.bookDatabaseService.getCharacters(bookFolder.path);
        for (const character of characters) {
          const material = this.characterToMaterial(character, bookId, bookTitle);
          this.materials.push(material);
        }
      } catch (error) {
        console.warn(`Failed to load materials from book: ${bookFolder.path}`, error);
      }
    }
    
    // 同时加载传统 JSON 存储中的自定义素材（用户手动添加的）
    await this.loadCustomMaterialsFromJson();
  }

  /**
   * 从 JSON 文件加载素材（传统模式）
   */
  private async loadFromJson(): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(this.storagePath);
    if (file) {
      const content = await this.app.vault.read(file as TFile);
      const storage: GlobalMaterialStorage = JSON.parse(content);
      this.materials = storage.materials.map(m => ({
        ...m,
        createdAt: new Date(m.createdAt),
        updatedAt: new Date(m.updatedAt)
      }));
    }
  }

  /**
   * 加载自定义素材（用户手动添加的，不在数据库中的）
   */
  private async loadCustomMaterialsFromJson(): Promise<void> {
    try {
      const file = this.app.vault.getAbstractFileByPath(this.storagePath);
      if (file) {
        const content = await this.app.vault.read(file as TFile);
        const storage: GlobalMaterialStorage = JSON.parse(content);
        
        // 只加载自定义类型的素材（不是从数据库同步的）
        const customMaterials = storage.materials
          .filter(m => m.type === 'custom' || m.type === 'quote' || m.type === 'technique')
          .map(m => ({
            ...m,
            createdAt: new Date(m.createdAt),
            updatedAt: new Date(m.updatedAt)
          }));
        
        // 合并到素材列表（避免重复）
        for (const material of customMaterials) {
          if (!this.materials.find(m => m.id === material.id)) {
            this.materials.push(material);
          }
        }
      }
    } catch (error) {
      // 忽略加载错误
    }
  }

  /**
   * 扫描所有书籍文件夹
   * 
   * Requirements: 9.4
   */
  private async scanBookFolders(): Promise<TFolder[]> {
    const bookFolders: TFolder[] = [];
    const normalizedPath = normalizePath(this.booksRootPath);
    
    const rootFolder = this.app.vault.getAbstractFileByPath(normalizedPath);
    if (!(rootFolder instanceof TFolder)) {
      return bookFolders;
    }
    
    for (const child of rootFolder.children) {
      if (child instanceof TFolder) {
        // 检查是否是有效的书籍文件夹（包含 _book_meta.md）
        const metaPath = normalizePath(`${child.path}/${DATABASE_FILES.BOOK_META}`);
        if (await this.app.vault.adapter.exists(metaPath)) {
          bookFolders.push(child);
        }
      }
    }
    
    return bookFolders;
  }

  /**
   * 将故事单元转换为素材
   */
  private storyUnitToMaterial(unit: StoryUnit, bookId: string, bookTitle: string): GlobalMaterialItem {
    return {
      id: `db_${unit.unitId}`,
      title: unit.name,
      type: 'story-unit',
      sourceBookId: bookId,
      sourceBookTitle: bookTitle,
      markId: unit.unitId,
      summary: unit.aiAnalysis?.summary || unit.textContent?.slice(0, 200) || '',
      content: unit.textContent || '',
      analysis: unit.aiAnalysis ? {
        templateId: unit.analysisTemplate,
        summary: unit.aiAnalysis.summary,
        sevenStep: unit.aiAnalysis.sevenStep ? {
          step1_advantage: unit.aiAnalysis.sevenStep.step1Advantage,
          step2_villain: unit.aiAnalysis.sevenStep.step2Villain,
          step3_friction: unit.aiAnalysis.sevenStep.step3Friction,
          step4_expectation: unit.aiAnalysis.sevenStep.step4Expectation,
          step5_climax: unit.aiAnalysis.sevenStep.step5Climax,
          step6_shock: unit.aiAnalysis.sevenStep.step6Shock,
          step7_reward: unit.aiAnalysis.sevenStep.step7Reward,
        } : undefined,
        techniques: unit.aiAnalysis.techniques?.map(t => ({ name: t, description: '', effect: '' })),
        takeaways: unit.aiAnalysis.takeaways,
        analyzedAt: new Date(unit.aiAnalysis.analyzedAt),
      } : undefined,
      tags: unit.categories || [],
      category: unit.lineType,
      starred: false,
      useCount: 0,
      createdAt: new Date(unit.createdAt),
      updatedAt: new Date(unit.updatedAt),
    };
  }

  /**
   * 将人物转换为素材
   */
  private characterToMaterial(character: Character, bookId: string, bookTitle: string): GlobalMaterialItem {
    return {
      id: `db_${character.characterId}`,
      title: character.name,
      type: 'character',
      sourceBookId: bookId,
      sourceBookTitle: bookTitle,
      markId: character.characterId,
      summary: character.aiDescription?.slice(0, 200) || `${character.name} - ${this.getRoleLabel(character.role)}`,
      content: [
        character.aiDescription,
        character.aiMotivation ? `动机: ${character.aiMotivation}` : '',
        character.aiGrowthArc ? `成长弧线: ${character.aiGrowthArc}` : '',
      ].filter(Boolean).join('\n\n'),
      tags: character.tags || [],
      category: character.role,
      starred: false,
      useCount: 0,
      createdAt: new Date(character.createdAt),
      updatedAt: new Date(character.updatedAt),
    };
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
   * 保存素材库
   * 
   * 注意：在 Dataview 模式下，只保存自定义素材到 JSON 文件
   * 数据库中的素材通过 BookDatabaseService 管理
   */
  private async save(): Promise<void> {
    // 只保存自定义素材（不是从数据库同步的）
    const customMaterials = this.materials.filter(m => 
      !m.id.startsWith('db_') || m.type === 'custom' || m.type === 'quote' || m.type === 'technique'
    );
    
    const storage: GlobalMaterialStorage = {
      version: '1.0.0',
      materials: customMaterials,
      lastUpdated: new Date().toISOString()
    };

    const content = JSON.stringify(storage, null, 2);
    
    // 确保目录存在
    const dir = this.storagePath.substring(0, this.storagePath.lastIndexOf('/'));
    if (dir && !this.app.vault.getAbstractFileByPath(dir)) {
      await this.app.vault.createFolder(dir);
    }

    const file = this.app.vault.getAbstractFileByPath(this.storagePath);
    if (file) {
      await this.app.vault.modify(file as TFile, content);
    } else {
      await this.app.vault.create(this.storagePath, content);
    }
  }

  /**
   * 添加素材
   */
  async addMaterial(params: AddMaterialParams): Promise<GlobalMaterialItem> {
    if (!this.loaded) await this.load();

    const material: GlobalMaterialItem = {
      id: this.generateId(),
      title: params.title,
      type: params.type,
      sourceBookId: params.sourceBookId,
      sourceBookTitle: params.sourceBookTitle,
      markId: params.markId,
      summary: params.summary || params.content.slice(0, 200),
      content: params.content,
      analysis: params.analysis,
      tags: params.tags || [],
      category: params.category,
      starred: false,
      useCount: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.materials.push(material);
    await this.save();

    return material;
  }

  /**
   * 从标记添加素材
   */
  async addFromMark(
    mark: UnifiedMark,
    bookTitle: string,
    title?: string
  ): Promise<GlobalMaterialItem> {
    const materialType = this.getTypeFromMark(mark);
    const chapterIndex = mark.range?.start?.chapterIndex ?? 0;
    
    return this.addMaterial({
      title: title || mark.unitName || `${mark.type} - ${chapterIndex + 1}章`,
      type: materialType,
      sourceBookId: mark.bookId,
      sourceBookTitle: bookTitle,
      markId: mark.id,
      content: mark.content || mark.range?.textSnapshot || '',
      summary: mark.range?.textSnapshot?.slice(0, 200),
      analysis: mark.analysisResult,
      tags: mark.associations?.tags || []
    });
  }

  /**
   * 根据标记类型确定素材类型
   */
  private getTypeFromMark(mark: UnifiedMark): GlobalMaterialItem['type'] {
    if (mark.mode === 'story-unit') return 'story-unit';
    
    switch (mark.type) {
      case 'character': return 'character';
      case 'setting': return 'setting';
      case 'scene': return 'scene';
      case 'material':
        if (mark.subType === 'quote') return 'quote';
        if (mark.subType === 'technique') return 'technique';
        return 'custom';
      default: return 'custom';
    }
  }

  /**
   * 获取素材
   */
  async getMaterial(id: string): Promise<GlobalMaterialItem | null> {
    if (!this.loaded) await this.load();
    return this.materials.find(m => m.id === id) || null;
  }

  /**
   * 获取所有素材
   * 
   * Requirements: 9.4 - 支持跨书籍查询
   */
  async getAllMaterials(): Promise<GlobalMaterialItem[]> {
    if (!this.loaded) await this.load();
    return [...this.materials];
  }

  /**
   * 刷新素材库
   * 重新从数据库加载所有素材
   * 
   * Requirements: 9.4
   */
  async refresh(): Promise<void> {
    this.loaded = false;
    await this.load();
  }

  /**
   * 按书籍获取素材
   * 
   * Requirements: 9.4
   */
  async getMaterialsByBook(bookId: string): Promise<GlobalMaterialItem[]> {
    if (!this.loaded) await this.load();
    return this.materials.filter(m => m.sourceBookId === bookId);
  }

  /**
   * 跨书籍搜索素材
   * 
   * Requirements: 9.4
   */
  async searchAcrossBooks(query: string): Promise<GlobalMaterialItem[]> {
    if (!this.loaded) await this.load();
    
    const lowerQuery = query.toLowerCase();
    return this.materials.filter(m =>
      m.title.toLowerCase().includes(lowerQuery) ||
      m.content.toLowerCase().includes(lowerQuery) ||
      m.summary.toLowerCase().includes(lowerQuery) ||
      m.tags.some(t => t.toLowerCase().includes(lowerQuery)) ||
      m.sourceBookTitle.toLowerCase().includes(lowerQuery)
    );
  }

  /**
   * 查询素材
   */
  async queryMaterials(filter: MaterialFilter): Promise<GlobalMaterialItem[]> {
    if (!this.loaded) await this.load();

    let result = [...this.materials];

    if (filter.type) {
      result = result.filter(m => m.type === filter.type);
    }

    if (filter.sourceBookId) {
      result = result.filter(m => m.sourceBookId === filter.sourceBookId);
    }

    if (filter.tags && filter.tags.length > 0) {
      result = result.filter(m => 
        filter.tags!.some(tag => m.tags.includes(tag))
      );
    }

    if (filter.category) {
      result = result.filter(m => m.category === filter.category);
    }

    if (filter.starred !== undefined) {
      result = result.filter(m => m.starred === filter.starred);
    }

    if (filter.searchQuery) {
      const query = filter.searchQuery.toLowerCase();
      result = result.filter(m =>
        m.title.toLowerCase().includes(query) ||
        m.content.toLowerCase().includes(query) ||
        m.summary.toLowerCase().includes(query) ||
        m.tags.some(t => t.toLowerCase().includes(query))
      );
    }

    return result;
  }

  /**
   * 更新素材
   */
  async updateMaterial(
    id: string,
    updates: Partial<Pick<GlobalMaterialItem, 'title' | 'tags' | 'category' | 'starred'>>
  ): Promise<boolean> {
    if (!this.loaded) await this.load();

    const index = this.materials.findIndex(m => m.id === id);
    if (index === -1) return false;

    this.materials[index] = {
      ...this.materials[index],
      ...updates,
      updatedAt: new Date()
    };

    await this.save();
    return true;
  }

  /**
   * 切换收藏状态
   */
  async toggleStar(id: string): Promise<boolean> {
    const material = await this.getMaterial(id);
    if (!material) return false;

    return this.updateMaterial(id, { starred: !material.starred });
  }

  /**
   * 增加使用次数
   */
  async incrementUseCount(id: string): Promise<void> {
    if (!this.loaded) await this.load();

    const material = this.materials.find(m => m.id === id);
    if (material) {
      material.useCount++;
      material.updatedAt = new Date();
      await this.save();
    }
  }

  /**
   * 删除素材
   */
  async deleteMaterial(id: string): Promise<boolean> {
    if (!this.loaded) await this.load();

    const index = this.materials.findIndex(m => m.id === id);
    if (index === -1) return false;

    this.materials.splice(index, 1);
    await this.save();
    return true;
  }

  /**
   * 获取所有标签
   */
  async getAllTags(): Promise<string[]> {
    if (!this.loaded) await this.load();

    const tags = new Set<string>();
    for (const material of this.materials) {
      for (const tag of material.tags) {
        tags.add(tag);
      }
    }
    return Array.from(tags).sort();
  }

  /**
   * 获取所有分类
   */
  async getAllCategories(): Promise<string[]> {
    if (!this.loaded) await this.load();

    const categories = new Set<string>();
    for (const material of this.materials) {
      if (material.category) {
        categories.add(material.category);
      }
    }
    return Array.from(categories).sort();
  }

  /**
   * 获取统计信息
   */
  async getStatistics(): Promise<{
    total: number;
    byType: Record<string, number>;
    byBook: Record<string, number>;
    starredCount: number;
  }> {
    if (!this.loaded) await this.load();

    const byType: Record<string, number> = {};
    const byBook: Record<string, number> = {};
    let starredCount = 0;

    for (const material of this.materials) {
      byType[material.type] = (byType[material.type] || 0) + 1;
      byBook[material.sourceBookId] = (byBook[material.sourceBookId] || 0) + 1;
      if (material.starred) starredCount++;
    }

    return {
      total: this.materials.length,
      byType,
      byBook,
      starredCount
    };
  }

  /**
   * 导出为 JSON
   */
  async exportToJson(): Promise<string> {
    if (!this.loaded) await this.load();

    const storage: GlobalMaterialStorage = {
      version: '1.0.0',
      materials: this.materials,
      lastUpdated: new Date().toISOString()
    };

    return JSON.stringify(storage, null, 2);
  }

  /**
   * 从 JSON 导入
   */
  async importFromJson(jsonContent: string): Promise<number> {
    try {
      const storage: GlobalMaterialStorage = JSON.parse(jsonContent);
      
      let importCount = 0;
      for (const material of storage.materials) {
        // 检查是否已存在
        const existing = this.materials.find(m => 
          m.sourceBookId === material.sourceBookId && 
          m.markId === material.markId
        );

        if (!existing) {
          this.materials.push({
            ...material,
            id: this.generateId(),
            createdAt: new Date(material.createdAt),
            updatedAt: new Date()
          });
          importCount++;
        }
      }

      if (importCount > 0) {
        await this.save();
      }

      return importCount;
    } catch (error) {
      console.error('Failed to import materials:', error);
      throw new Error('导入失败：无效的 JSON 格式');
    }
  }

  /**
   * 生成唯一 ID
   */
  private generateId(): string {
    return `gm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
