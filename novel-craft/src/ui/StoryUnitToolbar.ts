/**
 * 故事单元编辑器工具栏
 * 在编辑器顶部提供故事单元相关的操作按钮
 * 
 * 功能：
 * - 标记起始位置
 * - 标记结束位置
 * - 创建故事单元（基于标记或选择）
 * - 清除标记
 * 
 * 需求: 1.1, 1.2, 1.3
 */

import { App, MarkdownView, TFile, Modal, Setting, DropdownComponent, TextComponent, normalizePath } from 'obsidian';
import { StoryUnitService, StoryUnitCreateConfig, ChapterInfo } from '../services/StoryUnitService';
import { TrackService } from '../services/TrackService';
import { databaseService } from '../services/DatabaseService';
import { TrackRecord, CharacterRecord } from '../types/database';
import { showSuccess, showError, showWarning, showInfo } from './NotificationUtils';
import { StoryUnitView, STORY_UNIT_VIEW_TYPE } from './StoryUnitView';

/**
 * 章节标记信息
 */
export interface ChapterMark {
  /** 章节文件路径 */
  filePath: string;
  /** 章节序号 */
  chapterIndex: number;
  /** 章节标题 */
  chapterTitle: string;
  /** 书籍ID */
  bookId: string;
}

/**
 * 故事单元工具栏配置
 */
export interface StoryUnitToolbarConfig {
  /** 获取当前书籍ID的回调 */
  getBookIdFromFile?: (filePath: string) => Promise<string | null>;
}

/**
 * 故事单元编辑器工具栏
 */
class StoryUnitToolbar {
  private app: App;
  private config: StoryUnitToolbarConfig;
  private storyUnitService: StoryUnitService;
  private trackService: TrackService;

  // 标记状态
  private startMark: ChapterMark | null = null;
  private endMark: ChapterMark | null = null;
  
  // 工具栏元素
  private toolbarEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;

  constructor(app: App, config: StoryUnitToolbarConfig = {}) {
    this.app = app;
    this.config = config;
    this.storyUnitService = new StoryUnitService(app);
    this.trackService = new TrackService();
  }

  /**
   * 注册编辑器扩展
   */
  registerEditorExtension(): void {
    // 只监听 active-leaf-change，因为它会在文件打开时也触发
    // 避免重复触发导致工具栏重复创建
    this.app.workspace.on('active-leaf-change', () => {
      // 使用 setTimeout 确保 DOM 已更新
      setTimeout(() => this.updateToolbar(), 50);
    });
  }

  /**
   * 更新工具栏显示
   */
  private async updateToolbar(): Promise<void> {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    
    if (!activeView) {
      this.removeToolbar();
      return;
    }
    
    const file = activeView.file;
    if (!file) {
      this.removeToolbar();
      return;
    }
    
    const bookId = await this.getBookIdFromFile(file.path);
    if (!bookId) {
      this.removeToolbar();
      return;
    }
    
    this.createToolbar(activeView, bookId, file);
  }

  /**
   * 创建工具栏
   */
  private createToolbar(view: MarkdownView, bookId: string, file: TFile): void {
    // 先移除旧的工具栏
    this.removeToolbar();
    
    const containerEl = view.containerEl;
    const editorEl = containerEl.querySelector('.cm-editor');
    
    if (!editorEl) return;
    
    // 检查是否已存在工具栏（防止重复创建）
    const existingToolbar = containerEl.querySelector('.nc-su-toolbar-container');
    if (existingToolbar) {
      existingToolbar.remove();
    }
    
    this.toolbarEl = document.createElement('div');
    this.toolbarEl.className = 'nc-su-toolbar-container';
    
    const toolbar = this.toolbarEl.createDiv({ cls: 'nc-su-editor-toolbar' });
    
    toolbar.createSpan({ text: '📚 故事单元', cls: 'nc-su-toolbar-title' });
    
    const buttonGroup = toolbar.createDiv({ cls: 'nc-su-toolbar-buttons' });
    
    const startBtn = buttonGroup.createEl('button', {
      text: '🏁 标记起始',
      cls: 'nc-su-toolbar-btn',
      attr: { title: '将当前章节标记为故事单元的起始位置' }
    });
    startBtn.addEventListener('click', () => this.markStart(bookId, file));
    
    const endBtn = buttonGroup.createEl('button', {
      text: '🏴 标记结束',
      cls: 'nc-su-toolbar-btn',
      attr: { title: '将当前章节标记为故事单元的结束位置' }
    });
    endBtn.addEventListener('click', () => this.markEnd(bookId, file));
    
    const createBtn = buttonGroup.createEl('button', {
      text: '➕ 创建单元',
      cls: 'nc-su-toolbar-btn nc-su-toolbar-btn-primary',
      attr: { title: '基于标记创建故事单元' }
    });
    createBtn.addEventListener('click', () => this.openCreateDialog(bookId));
    
    const manageBtn = buttonGroup.createEl('button', {
      text: '📋 管理',
      cls: 'nc-su-toolbar-btn',
      attr: { title: '打开故事单元管理面板' }
    });
    manageBtn.addEventListener('click', () => this.openManagePanel(bookId));
    
    const clearBtn = buttonGroup.createEl('button', {
      text: '🗑️ 清除标记',
      cls: 'nc-su-toolbar-btn nc-su-toolbar-btn-danger',
      attr: { title: '清除所有标记' }
    });
    clearBtn.addEventListener('click', () => this.clearMarks());
    
    this.statusEl = toolbar.createDiv({ cls: 'nc-su-toolbar-status' });
    this.updateStatusDisplay();
    
    editorEl.parentElement?.insertBefore(this.toolbarEl, editorEl);
  }

  /**
   * 移除工具栏
   */
  private removeToolbar(): void {
    // 移除当前引用的工具栏
    if (this.toolbarEl) {
      this.toolbarEl.remove();
      this.toolbarEl = null;
      this.statusEl = null;
    }
    
    // 同时移除所有可能残留的工具栏（防止重复）
    document.querySelectorAll('.nc-su-toolbar-container').forEach(el => el.remove());
  }

  /**
   * 更新状态显示
   */
  private updateStatusDisplay(): void {
    if (!this.statusEl) return;
    
    this.statusEl.empty();
    
    if (this.startMark || this.endMark) {
      const statusText = this.statusEl.createDiv({ cls: 'nc-su-status-text' });
      
      if (this.startMark) {
        statusText.createSpan({ 
          text: `起始: 第${this.startMark.chapterIndex}章`,
          cls: 'nc-su-status-mark nc-su-status-start'
        });
      }
      
      if (this.startMark && this.endMark) {
        statusText.createSpan({ text: ' → ', cls: 'nc-su-status-arrow' });
      }
      
      if (this.endMark) {
        statusText.createSpan({ 
          text: `结束: 第${this.endMark.chapterIndex}章`,
          cls: 'nc-su-status-mark nc-su-status-end'
        });
      }
      
      if (this.startMark && this.endMark) {
        const count = Math.abs(this.endMark.chapterIndex - this.startMark.chapterIndex) + 1;
        statusText.createSpan({ 
          text: ` (共${count}章)`,
          cls: 'nc-su-status-count'
        });
      }
    } else {
      this.statusEl.createSpan({ 
        text: '未设置标记',
        cls: 'nc-su-status-empty'
      });
    }
  }

  /**
   * 标记起始位置
   */
  private async markStart(bookId: string, file: TFile): Promise<void> {
    const chapterInfo = await this.getChapterInfo(bookId, file);
    if (!chapterInfo) {
      showWarning('无法获取章节信息');
      return;
    }
    
    this.startMark = {
      filePath: file.path,
      chapterIndex: chapterInfo.index,
      chapterTitle: chapterInfo.title,
      bookId
    };
    
    if (this.endMark && this.endMark.chapterIndex < this.startMark.chapterIndex) {
      const temp = this.startMark;
      this.startMark = this.endMark;
      this.endMark = temp;
    }
    
    this.updateStatusDisplay();
    showInfo(`已标记起始位置: 第${chapterInfo.index}章 - ${chapterInfo.title}`);
  }

  /**
   * 标记结束位置
   */
  private async markEnd(bookId: string, file: TFile): Promise<void> {
    const chapterInfo = await this.getChapterInfo(bookId, file);
    if (!chapterInfo) {
      showWarning('无法获取章节信息');
      return;
    }
    
    this.endMark = {
      filePath: file.path,
      chapterIndex: chapterInfo.index,
      chapterTitle: chapterInfo.title,
      bookId
    };
    
    if (this.startMark && this.endMark.chapterIndex < this.startMark.chapterIndex) {
      const temp = this.startMark;
      this.startMark = this.endMark;
      this.endMark = temp;
    }
    
    this.updateStatusDisplay();
    showInfo(`已标记结束位置: 第${chapterInfo.index}章 - ${chapterInfo.title}`);
  }

  /**
   * 清除所有标记
   */
  private clearMarks(): void {
    this.startMark = null;
    this.endMark = null;
    this.updateStatusDisplay();
    showInfo('已清除所有标记');
  }

  /**
   * 打开创建对话框
   */
  private async openCreateDialog(bookId: string): Promise<void> {
    let chapterStart = 1;
    let chapterEnd = 1;
    
    if (this.startMark && this.endMark) {
      chapterStart = Math.min(this.startMark.chapterIndex, this.endMark.chapterIndex);
      chapterEnd = Math.max(this.startMark.chapterIndex, this.endMark.chapterIndex);
    } else if (this.startMark) {
      chapterStart = this.startMark.chapterIndex;
      chapterEnd = this.startMark.chapterIndex;
    } else if (this.endMark) {
      chapterStart = this.endMark.chapterIndex;
      chapterEnd = this.endMark.chapterIndex;
    }
    
    const tracks = await this.trackService.getTracksByBook(bookId);
    const chapters = await this.storyUnitService.getBookChapters(bookId);
    const characters = await databaseService.characters.query({ book_id: bookId });
    
    if (tracks.length === 0) {
      await this.trackService.initializeDefaultTracks(bookId);
      const newTracks = await this.trackService.getTracksByBook(bookId);
      tracks.push(...newTracks);
    }
    
    const modal = new StoryUnitQuickCreateModal(
      this.app,
      {
        bookId,
        chapterStart,
        chapterEnd,
        tracks,
        chapters,
        characters,
        onSave: async (config) => {
          try {
            await this.storyUnitService.createStoryUnit(config);
            showSuccess('故事单元创建成功');
            this.clearMarks();
          } catch (error) {
            showError('创建失败', error instanceof Error ? error.message : '未知错误');
          }
        }
      }
    );
    modal.open();
  }

  /**
   * 打开管理面板（在右侧边栏）
   */
  private async openManagePanel(bookId: string): Promise<void> {
    const { workspace } = this.app;
    
    // 查找或创建故事单元视图
    let leaf = workspace.getLeavesOfType(STORY_UNIT_VIEW_TYPE)[0];
    
    if (!leaf) {
      // 在右侧创建新的叶子
      const rightLeaf = workspace.getRightLeaf(false);
      if (rightLeaf) {
        await rightLeaf.setViewState({
          type: STORY_UNIT_VIEW_TYPE,
          active: true
        });
        leaf = rightLeaf;
      }
    }
    
    if (leaf) {
      workspace.revealLeaf(leaf);
      
      // 设置当前书籍
      const view = leaf.view as StoryUnitView;
      if (view && typeof view.setBook === 'function') {
        await view.setBook(bookId);
      }
    }
  }

  /**
   * 获取章节信息
   */
  private async getChapterInfo(bookId: string, file: TFile): Promise<ChapterInfo | null> {
    const chapters = await this.storyUnitService.getBookChapters(bookId);
    // 规范化当前文件路径进行比较
    const normalizedFilePath = normalizePath(file.path);
    
    // 调试日志
    console.log('NovelCraft [StoryUnitToolbar] getChapterInfo:', {
      bookId,
      currentFilePath: file.path,
      normalizedFilePath,
      chaptersCount: chapters.length,
      chapterPaths: chapters.slice(0, 3).map(ch => ch.filePath)
    });
    
    const found = chapters.find((ch: ChapterInfo) => {
      const normalizedChapterPath = normalizePath(ch.filePath);
      const match = normalizedChapterPath === normalizedFilePath;
      if (!match && chapters.indexOf(ch) < 3) {
        console.log('NovelCraft [StoryUnitToolbar] path comparison:', {
          chapterPath: ch.filePath,
          normalizedChapterPath,
          normalizedFilePath,
          match
        });
      }
      return match;
    });
    
    console.log('NovelCraft [StoryUnitToolbar] found chapter:', found);
    return found || null;
  }

  /**
   * 从文件路径获取书籍ID
   */
  private async getBookIdFromFile(filePath: string): Promise<string | null> {
    if (this.config.getBookIdFromFile) {
      return await this.config.getBookIdFromFile(filePath);
    }
    
    // 规范化文件路径
    const normalizedFilePath = normalizePath(filePath);
    const parts = normalizedFilePath.split('/');
    const booksIndex = parts.findIndex(p => p === 'books');
    if (booksIndex === -1 || booksIndex >= parts.length - 2) {
      return null;
    }
    
    const bookFolderName = parts[booksIndex + 1];
    const bookFolderPath = normalizePath(parts.slice(0, booksIndex + 2).join('/'));
    
    const books = await databaseService.books.getAll();
    const book = books.find(b => {
      // 规范化数据库中的路径进行比较
      const dbPath = normalizePath(b.file_path);
      return dbPath === bookFolderPath || b.title === bookFolderName;
    });
    
    return book?.id || null;
  }

  /**
   * 获取当前标记状态
   */
  getMarks(): { start: ChapterMark | null; end: ChapterMark | null } {
    return { start: this.startMark, end: this.endMark };
  }

  /**
   * 销毁工具栏
   */
  destroy(): void {
    this.removeToolbar();
    this.startMark = null;
    this.endMark = null;
  }
}


/**
 * 快速创建故事单元模态框
 */
class StoryUnitQuickCreateModal extends Modal {
  private config: {
    bookId: string;
    chapterStart: number;
    chapterEnd: number;
    tracks: TrackRecord[];
    chapters: ChapterInfo[];
    characters: CharacterRecord[];
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
  
  private saveButton!: HTMLButtonElement;

  constructor(app: App, config: typeof StoryUnitQuickCreateModal.prototype.config) {
    super(app);
    this.config = config;
    
    this.formData = {
      title: '',
      chapterStart: config.chapterStart,
      chapterEnd: config.chapterEnd,
      trackId: config.tracks[0]?.id || '',
      isPastEvent: false,
      characterIds: []
    };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-su-quick-create-modal');

    contentEl.createEl('h2', { text: '➕ 创建故事单元' });
    
    const rangeInfo = contentEl.createDiv({ cls: 'nc-su-range-info' });
    const count = this.formData.chapterEnd - this.formData.chapterStart + 1;
    rangeInfo.createSpan({ 
      text: `📖 章节范围: 第${this.formData.chapterStart}章 - 第${this.formData.chapterEnd}章 (共${count}章)`,
      cls: 'nc-su-range-text'
    });

    const form = contentEl.createDiv({ cls: 'nc-su-form' });

    new Setting(form)
      .setName('故事单元标题')
      .setDesc('为这个故事单元起一个描述性的名称')
      .addText((text: TextComponent) => {
        text.setPlaceholder('例如：主角觉醒、师徒相遇')
          .setValue(this.formData.title)
          .onChange((value: string) => {
            this.formData.title = value;
            this.validateForm();
          });
        text.inputEl.addClass('nc-su-title-input');
        setTimeout(() => text.inputEl.focus(), 100);
      });

    new Setting(form)
      .setName('所属轨道')
      .setDesc('选择故事单元所属的时间线轨道')
      .addDropdown((dropdown: DropdownComponent) => {
        for (const track of this.config.tracks) {
          const label = track.type === 'main' ? `${track.name} (主线)` : track.name;
          dropdown.addOption(track.id, label);
        }
        dropdown.setValue(this.formData.trackId);
        dropdown.onChange((value: string) => { this.formData.trackId = value; });
      });

    this.createChapterRangeAdjuster(form);

    new Setting(form)
      .setName('过去事件')
      .setDesc('标记为过去事件（回忆、闪回等）')
      .addToggle((toggle) => {
        toggle.setValue(this.formData.isPastEvent)
          .onChange((value: boolean) => { this.formData.isPastEvent = value; });
      });

    this.createCharacterSelector(form);

    const buttonContainer = contentEl.createDiv({ cls: 'nc-su-buttons' });
    
    const cancelBtn = buttonContainer.createEl('button', { text: '取消', cls: 'nc-btn' });
    cancelBtn.addEventListener('click', () => this.close());
    
    this.saveButton = buttonContainer.createEl('button', {
      text: '创建',
      cls: 'nc-btn nc-btn-primary'
    });
    this.saveButton.addEventListener('click', () => this.save());
    
    this.validateForm();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private createChapterRangeAdjuster(container: HTMLElement): void {
    const chapters = this.config.chapters;
    
    // 起始章节下拉菜单
    new Setting(container)
      .setName('起始章节')
      .setDesc('选择故事单元的起始章节')
      .addDropdown((dropdown: DropdownComponent) => {
        for (const chapter of chapters) {
          const label = `第${chapter.index}章 - ${chapter.title}`;
          dropdown.addOption(String(chapter.index), label);
        }
        dropdown.setValue(String(this.formData.chapterStart));
        dropdown.onChange((value: string) => {
          this.formData.chapterStart = parseInt(value) || 1;
          // 如果起始章节大于结束章节，自动调整结束章节
          if (this.formData.chapterStart > this.formData.chapterEnd) {
            this.formData.chapterEnd = this.formData.chapterStart;
            // 更新结束章节下拉菜单
            const endDropdown = container.querySelector('.nc-su-end-chapter-dropdown') as HTMLSelectElement;
            if (endDropdown) {
              endDropdown.value = String(this.formData.chapterEnd);
            }
          }
          this.updateRangeInfo();
          this.validateForm();
        });
        dropdown.selectEl.addClass('nc-su-chapter-dropdown');
      });

    // 结束章节下拉菜单
    new Setting(container)
      .setName('结束章节')
      .setDesc('选择故事单元的结束章节')
      .addDropdown((dropdown: DropdownComponent) => {
        for (const chapter of chapters) {
          const label = `第${chapter.index}章 - ${chapter.title}`;
          dropdown.addOption(String(chapter.index), label);
        }
        dropdown.setValue(String(this.formData.chapterEnd));
        dropdown.onChange((value: string) => {
          this.formData.chapterEnd = parseInt(value) || 1;
          // 如果结束章节小于起始章节，自动调整起始章节
          if (this.formData.chapterEnd < this.formData.chapterStart) {
            this.formData.chapterStart = this.formData.chapterEnd;
            // 更新起始章节下拉菜单
            const startDropdown = container.querySelector('.nc-su-chapter-dropdown') as HTMLSelectElement;
            if (startDropdown) {
              startDropdown.value = String(this.formData.chapterStart);
            }
          }
          this.updateRangeInfo();
          this.validateForm();
        });
        dropdown.selectEl.addClass('nc-su-end-chapter-dropdown');
      });
  }

  /**
   * 更新章节范围信息显示
   */
  private updateRangeInfo(): void {
    const rangeInfo = this.contentEl.querySelector('.nc-su-range-info .nc-su-range-text');
    if (rangeInfo) {
      const count = this.formData.chapterEnd - this.formData.chapterStart + 1;
      rangeInfo.textContent = `📖 章节范围: 第${this.formData.chapterStart}章 - 第${this.formData.chapterEnd}章 (共${count}章)`;
    }
  }

  private createCharacterSelector(container: HTMLElement): void {
    if (this.config.characters.length === 0) return;
    
    const setting = new Setting(container)
      .setName(`关联人物 (${this.config.characters.length}个可选)`)
      .setDesc('选择与此故事单元相关的人物');

    const charContainer = setting.controlEl.createDiv({ cls: 'nc-su-char-selector-compact' });
    const quickSelect = charContainer.createDiv({ cls: 'nc-su-char-quick' });
    const displayChars = this.config.characters.slice(0, 5);
    
    for (const char of displayChars) {
      const charBtn = quickSelect.createEl('button', { text: char.name, cls: 'nc-su-char-btn' });
      
      charBtn.addEventListener('click', () => {
        const index = this.formData.characterIds.indexOf(char.id);
        if (index > -1) {
          this.formData.characterIds.splice(index, 1);
          charBtn.removeClass('nc-su-char-btn-selected');
        } else {
          this.formData.characterIds.push(char.id);
          charBtn.addClass('nc-su-char-btn-selected');
        }
        this.updateCharacterCount(charContainer);
      });
    }
    
    if (this.config.characters.length > 5) {
      const moreBtn = quickSelect.createEl('button', {
        text: `+${this.config.characters.length - 5}`,
        cls: 'nc-su-char-btn nc-su-char-more'
      });
      moreBtn.addEventListener('click', () => this.showAllCharacters(charContainer));
    }
    
    const countEl = charContainer.createDiv({ cls: 'nc-su-char-count' });
    countEl.textContent = '已选择 0 个人物';
  }

  private showAllCharacters(container: HTMLElement): void {
    const quickSelect = container.querySelector('.nc-su-char-quick');
    if (quickSelect) quickSelect.remove();
    
    const allChars = container.createDiv({ cls: 'nc-su-char-all' });
    
    for (const char of this.config.characters) {
      const charItem = allChars.createDiv({ cls: 'nc-su-char-item-compact' });
      
      const checkbox = charItem.createEl('input', {
        type: 'checkbox',
        attr: { id: `qc-char-${char.id}` }
      }) as HTMLInputElement;
      checkbox.checked = this.formData.characterIds.includes(char.id);
      
      const label = charItem.createEl('label', { attr: { for: `qc-char-${char.id}` } });
      label.textContent = `${char.name} (${char.role})`;
      
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          if (!this.formData.characterIds.includes(char.id)) {
            this.formData.characterIds.push(char.id);
          }
        } else {
          const index = this.formData.characterIds.indexOf(char.id);
          if (index > -1) this.formData.characterIds.splice(index, 1);
        }
        this.updateCharacterCount(container);
      });
    }
  }

  private updateCharacterCount(container: HTMLElement): void {
    const countEl = container.querySelector('.nc-su-char-count');
    if (countEl) {
      countEl.textContent = `已选择 ${this.formData.characterIds.length} 个人物`;
    }
  }

  private validateForm(): void {
    const isValid = this.formData.title.trim().length > 0 &&
                    this.formData.trackId.length > 0 &&
                    this.formData.chapterStart > 0 &&
                    this.formData.chapterEnd >= this.formData.chapterStart;
    
    if (this.saveButton) {
      this.saveButton.disabled = !isValid;
    }
  }

  private async save(): Promise<void> {
    if (!this.formData.title.trim()) {
      showWarning('请输入故事单元标题');
      return;
    }
    
    this.saveButton.disabled = true;
    this.saveButton.textContent = '创建中...';
    
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
      this.saveButton.disabled = false;
      this.saveButton.textContent = '创建';
      throw error;
    }
  }
}

export { StoryUnitToolbar };
