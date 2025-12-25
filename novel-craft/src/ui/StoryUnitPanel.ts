/**
 * 故事单元管理面板
 * 提供故事单元的列表查看、编辑和管理功能
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4
 */

import { App, Modal, Setting, DropdownComponent, TextComponent } from 'obsidian';
import { StoryUnitService, ChapterInfo, StoryUnitCreateConfig } from '../services/StoryUnitService';
import { TrackService } from '../services/TrackService';
import { databaseService } from '../services/DatabaseService';
import { StoryUnitRecord, TrackRecord, CharacterRecord } from '../types/database';
import { showSuccess, showError, showWarning } from './NotificationUtils';

/**
 * 故事单元面板配置
 */
export interface StoryUnitPanelConfig {
  /** 书籍ID */
  bookId: string;
  /** 创建回调 */
  onUnitCreated?: (unit: StoryUnitRecord) => void;
  /** 更新回调 */
  onUnitUpdated?: (unit: StoryUnitRecord) => void;
  /** 删除回调 */
  onUnitDeleted?: (unitId: string) => void;
}

/**
 * 故事单元管理面板
 */
export class StoryUnitPanel extends Modal {
  private config: StoryUnitPanelConfig;
  private storyUnitService: StoryUnitService;
  private trackService: TrackService;
  
  // 数据
  private units: StoryUnitRecord[] = [];
  private tracks: TrackRecord[] = [];
  private chapters: ChapterInfo[] = [];
  private characters: CharacterRecord[] = [];
  
  // UI 元素
  private listContainer: HTMLElement | null = null;

  constructor(app: App, config: StoryUnitPanelConfig) {
    super(app);
    this.config = config;
    this.storyUnitService = new StoryUnitService(app);
    this.trackService = new TrackService();
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-su-panel');

    // 加载数据
    await this.loadData();

    // 标题栏
    const header = contentEl.createDiv({ cls: 'nc-su-panel-header' });
    header.createEl('h2', { text: '📚 故事单元管理' });
    
    // 工具栏
    const toolbar = header.createDiv({ cls: 'nc-su-panel-toolbar' });
    
    const addBtn = toolbar.createEl('button', {
      text: '➕ 新建',
      cls: 'nc-btn nc-btn-primary'
    });
    addBtn.addEventListener('click', () => this.openCreateModal());
    
    const refreshBtn = toolbar.createEl('button', {
      text: '🔄 刷新',
      cls: 'nc-btn'
    });
    refreshBtn.addEventListener('click', () => this.refresh());

    // 统计信息
    const stats = contentEl.createDiv({ cls: 'nc-su-panel-stats' });
    stats.createSpan({ text: `共 ${this.units.length} 个故事单元，${this.tracks.length} 条轨道` });

    // 列表容器
    this.listContainer = contentEl.createDiv({ cls: 'nc-su-panel-list' });
    this.renderList();
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * 加载数据
   */
  private async loadData(): Promise<void> {
    const { bookId } = this.config;
    
    this.units = await this.storyUnitService.getStoryUnitsByBook(bookId);
    this.tracks = await this.trackService.getTracksByBook(bookId);
    this.chapters = await this.storyUnitService.getBookChapters(bookId);
    this.characters = await databaseService.characters.query({ book_id: bookId });
    
    // 如果没有轨道，初始化默认轨道
    if (this.tracks.length === 0) {
      this.tracks = await this.trackService.initializeDefaultTracks(bookId);
    }
  }

  /**
   * 刷新面板
   */
  private async refresh(): Promise<void> {
    await this.loadData();
    this.renderList();
  }

  /**
   * 渲染列表
   */
  private renderList(): void {
    if (!this.listContainer) return;
    this.listContainer.empty();

    if (this.units.length === 0) {
      const empty = this.listContainer.createDiv({ cls: 'nc-su-panel-empty' });
      empty.createSpan({ text: '暂无故事单元' });
      empty.createEl('p', { text: '点击"新建"按钮创建第一个故事单元' });
      return;
    }

    // 按轨道分组显示
    for (const track of this.tracks) {
      const trackUnits = this.units.filter(u => u.track_id === track.id);
      if (trackUnits.length === 0) continue;

      const trackSection = this.listContainer.createDiv({ cls: 'nc-su-track-section' });
      
      // 轨道标题
      const trackHeader = trackSection.createDiv({ cls: 'nc-su-track-header' });
      const colorDot = trackHeader.createSpan({ cls: 'nc-su-track-color' });
      colorDot.style.backgroundColor = track.color;
      trackHeader.createSpan({ text: `${track.name} (${trackUnits.length})` });

      // 故事单元列表
      const unitList = trackSection.createDiv({ cls: 'nc-su-unit-list' });
      
      for (const unit of trackUnits.sort((a, b) => a.chapter_start - b.chapter_start)) {
        this.renderUnitItem(unitList, unit, track);
      }
    }

    // 未分配轨道的单元
    const unassigned = this.units.filter(u => !this.tracks.find(t => t.id === u.track_id));
    if (unassigned.length > 0) {
      const section = this.listContainer.createDiv({ cls: 'nc-su-track-section' });
      section.createDiv({ cls: 'nc-su-track-header', text: `未分配 (${unassigned.length})` });
      
      const unitList = section.createDiv({ cls: 'nc-su-unit-list' });
      for (const unit of unassigned) {
        this.renderUnitItem(unitList, unit);
      }
    }
  }

  /**
   * 渲染单个故事单元项
   */
  private renderUnitItem(container: HTMLElement, unit: StoryUnitRecord, track?: TrackRecord): void {
    const item = container.createDiv({ cls: 'nc-su-unit-item' });
    
    // 标题和章节范围
    const info = item.createDiv({ cls: 'nc-su-unit-info' });
    info.createSpan({ text: unit.title, cls: 'nc-su-unit-title' });
    
    const range = info.createSpan({ cls: 'nc-su-unit-range' });
    range.textContent = unit.chapter_start === unit.chapter_end
      ? `第${unit.chapter_start}章`
      : `第${unit.chapter_start}-${unit.chapter_end}章`;
    
    // 标签
    const tags = item.createDiv({ cls: 'nc-su-unit-tags' });
    if (unit.is_past_event) {
      tags.createSpan({ text: '过去', cls: 'nc-su-tag nc-su-tag-past' });
    }
    
    const charIds: string[] = JSON.parse(unit.character_ids || '[]');
    if (charIds.length > 0) {
      tags.createSpan({ text: `${charIds.length}人`, cls: 'nc-su-tag' });
    }

    // 操作按钮
    const actions = item.createDiv({ cls: 'nc-su-unit-actions' });
    
    const editBtn = actions.createEl('button', { text: '✏️', cls: 'nc-su-action-btn' });
    editBtn.title = '编辑';
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.openEditModal(unit);
    });
    
    const deleteBtn = actions.createEl('button', { text: '🗑️', cls: 'nc-su-action-btn nc-su-action-danger' });
    deleteBtn.title = '删除';
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.confirmDelete(unit);
    });
  }

  /**
   * 打开创建模态框
   */
  private openCreateModal(): void {
    const modal = new StoryUnitEditModal(this.app, {
      bookId: this.config.bookId,
      tracks: this.tracks,
      chapters: this.chapters,
      characters: this.characters,
      onSave: async (config) => {
        const id = await this.storyUnitService.createStoryUnit(config);
        const unit = await this.storyUnitService.getStoryUnit(id);
        if (unit) {
          showSuccess('故事单元创建成功');
          this.config.onUnitCreated?.(unit);
          await this.refresh();
        }
      }
    });
    modal.open();
  }

  /**
   * 打开编辑模态框
   */
  private openEditModal(unit: StoryUnitRecord): void {
    const modal = new StoryUnitEditModal(this.app, {
      bookId: this.config.bookId,
      tracks: this.tracks,
      chapters: this.chapters,
      characters: this.characters,
      existingUnit: unit,
      onSave: async (config) => {
        await this.storyUnitService.updateStoryUnit(unit.id, {
          title: config.title,
          chapterStart: config.chapterStart,
          chapterEnd: config.chapterEnd,
          trackId: config.trackId,
          isPastEvent: config.isPastEvent,
          characterIds: config.characterIds
        });
        const updated = await this.storyUnitService.getStoryUnit(unit.id);
        if (updated) {
          showSuccess('故事单元更新成功');
          this.config.onUnitUpdated?.(updated);
          await this.refresh();
        }
      }
    });
    modal.open();
  }

  /**
   * 确认删除
   */
  private confirmDelete(unit: StoryUnitRecord): void {
    const modal = new ConfirmModal(this.app, {
      title: '删除故事单元',
      message: `确定要删除"${unit.title}"吗？此操作不可撤销。`,
      confirmText: '删除',
      onConfirm: async () => {
        await this.storyUnitService.deleteStoryUnit(unit.id);
        showSuccess('故事单元已删除');
        this.config.onUnitDeleted?.(unit.id);
        await this.refresh();
      }
    });
    modal.open();
  }
}


/**
 * 故事单元编辑模态框
 */
class StoryUnitEditModal extends Modal {
  private config: {
    bookId: string;
    tracks: TrackRecord[];
    chapters: ChapterInfo[];
    characters: CharacterRecord[];
    existingUnit?: StoryUnitRecord;
    onSave: (config: StoryUnitCreateConfig) => Promise<void>;
  };
  
  private formData: {
    title: string;
    chapterStart: number;
    chapterEnd: number;
    trackId: string;
    isPastEvent: boolean;
    characterIds: string[];
  };

  constructor(app: App, config: typeof StoryUnitEditModal.prototype.config) {
    super(app);
    this.config = config;
    
    const existing = config.existingUnit;
    this.formData = {
      title: existing?.title || '',
      chapterStart: existing?.chapter_start || 1,
      chapterEnd: existing?.chapter_end || 1,
      trackId: existing?.track_id || config.tracks[0]?.id || '',
      isPastEvent: existing?.is_past_event || false,
      characterIds: existing ? JSON.parse(existing.character_ids || '[]') : []
    };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-su-edit-modal');

    const isEdit = !!this.config.existingUnit;
    contentEl.createEl('h2', { text: isEdit ? '✏️ 编辑故事单元' : '➕ 新建故事单元' });

    const form = contentEl.createDiv({ cls: 'nc-su-form' });

    // 标题
    new Setting(form)
      .setName('标题')
      .addText((text: TextComponent) => {
        text.setPlaceholder('故事单元标题')
          .setValue(this.formData.title)
          .onChange((value: string) => { this.formData.title = value; });
      });

    // 轨道
    new Setting(form)
      .setName('轨道')
      .addDropdown((dropdown: DropdownComponent) => {
        for (const track of this.config.tracks) {
          dropdown.addOption(track.id, track.name);
        }
        dropdown.setValue(this.formData.trackId);
        dropdown.onChange((value: string) => { this.formData.trackId = value; });
      });

    // 章节范围
    new Setting(form)
      .setName('起始章节')
      .addText((text: TextComponent) => {
        text.inputEl.type = 'number';
        text.inputEl.min = '1';
        text.setValue(String(this.formData.chapterStart));
        text.onChange((value: string) => { 
          this.formData.chapterStart = parseInt(value) || 1; 
        });
      });

    new Setting(form)
      .setName('结束章节')
      .addText((text: TextComponent) => {
        text.inputEl.type = 'number';
        text.inputEl.min = '1';
        text.setValue(String(this.formData.chapterEnd));
        text.onChange((value: string) => { 
          this.formData.chapterEnd = parseInt(value) || 1; 
        });
      });

    // 过去事件
    new Setting(form)
      .setName('过去事件')
      .setDesc('标记为回忆、闪回等过去发生的事件')
      .addToggle((toggle) => {
        toggle.setValue(this.formData.isPastEvent)
          .onChange((value: boolean) => { this.formData.isPastEvent = value; });
      });

    // 人物选择
    if (this.config.characters.length > 0) {
      const charSetting = new Setting(form).setName('关联人物');
      const charContainer = charSetting.controlEl.createDiv({ cls: 'nc-su-char-list' });
      
      for (const char of this.config.characters) {
        const item = charContainer.createDiv({ cls: 'nc-su-char-item' });
        const checkbox = item.createEl('input', { 
          type: 'checkbox',
          attr: { id: `char-${char.id}` }
        }) as HTMLInputElement;
        checkbox.checked = this.formData.characterIds.includes(char.id);
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            this.formData.characterIds.push(char.id);
          } else {
            const idx = this.formData.characterIds.indexOf(char.id);
            if (idx > -1) this.formData.characterIds.splice(idx, 1);
          }
        });
        item.createEl('label', { text: char.name, attr: { for: `char-${char.id}` } });
      }
    }

    // 按钮
    const buttons = contentEl.createDiv({ cls: 'nc-su-buttons' });
    
    buttons.createEl('button', { text: '取消', cls: 'nc-btn' })
      .addEventListener('click', () => this.close());
    
    buttons.createEl('button', { text: '保存', cls: 'nc-btn nc-btn-primary' })
      .addEventListener('click', () => this.save());
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async save(): Promise<void> {
    if (!this.formData.title.trim()) {
      showWarning('请输入标题');
      return;
    }

    try {
      await this.config.onSave({
        bookId: this.config.bookId,
        title: this.formData.title.trim(),
        chapterStart: this.formData.chapterStart,
        chapterEnd: this.formData.chapterEnd,
        trackId: this.formData.trackId,
        isPastEvent: this.formData.isPastEvent,
        characterIds: this.formData.characterIds
      });
      this.close();
    } catch (error) {
      showError('保存失败', error instanceof Error ? error.message : '未知错误');
    }
  }
}


/**
 * 确认对话框
 */
class ConfirmModal extends Modal {
  private config: {
    title: string;
    message: string;
    confirmText?: string;
    onConfirm: () => Promise<void>;
  };

  constructor(app: App, config: typeof ConfirmModal.prototype.config) {
    super(app);
    this.config = config;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-confirm-modal');

    contentEl.createEl('h3', { text: this.config.title });
    contentEl.createEl('p', { text: this.config.message });

    const buttons = contentEl.createDiv({ cls: 'nc-su-buttons' });
    
    buttons.createEl('button', { text: '取消', cls: 'nc-btn' })
      .addEventListener('click', () => this.close());
    
    buttons.createEl('button', { 
      text: this.config.confirmText || '确认', 
      cls: 'nc-btn nc-btn-danger' 
    }).addEventListener('click', async () => {
      await this.config.onConfirm();
      this.close();
    });
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export { StoryUnitEditModal, ConfirmModal };
