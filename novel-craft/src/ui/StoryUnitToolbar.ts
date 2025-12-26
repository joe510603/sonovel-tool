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
import { LLMService } from '../services/LLMService';
import { databaseService } from '../services/DatabaseService';
import { TrackRecord, CharacterRecord } from '../types/database';
import { showSuccess, showError, showWarning, showInfo } from './NotificationUtils';
import { StoryUnitView, STORY_UNIT_VIEW_TYPE } from './StoryUnitView';
import { TimelineView, TIMELINE_VIEW_TYPE } from './TimelineView';

/**
 * 段落位置信息
 * 用于段落级精细标记
 */
export interface ParagraphPosition {
  /** 段落序号 (1-based) */
  paragraphIndex: number;
  /** 段落内偏移量 */
  offset?: number;
  /** 文本锚点（选中文本的前30字符） */
  textAnchor?: string;
}

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
  /** 段落位置（可选，用于段落级精细标记） */
  paragraphPosition?: ParagraphPosition;
}

/**
 * 标记组信息
 * 支持多组标记并行进行（嵌套标记）
 * 适用场景：主线故事中嵌套回忆、支线、闪回等
 * 
 * Requirements: 1.1, 1.2
 */
export interface MarkingGroup {
  /** 标记组唯一ID */
  id: string;
  /** 标记组名称（用户可自定义） */
  name: string;
  /** 起始标记 */
  startMark: ChapterMark | null;
  /** 结束标记 */
  endMark: ChapterMark | null;
  /** 创建时间 */
  createdAt: number;
  /** 标记组颜色（用于UI区分） */
  color: string;
}

/**
 * 故事单元工具栏配置
 */
export interface StoryUnitToolbarConfig {
  /** 获取当前书籍ID的回调 */
  getBookIdFromFile?: (filePath: string) => Promise<string | null>;
  /** LLM服务（用于AI分析） */
  llmService?: LLMService;
}

/**
 * 默认标记组颜色列表
 */
const MARKING_GROUP_COLORS = [
  '#4a90d9', // 蓝色
  '#50c878', // 绿色
  '#daa520', // 金色
  '#9370db', // 紫色
  '#ff6b6b', // 红色
  '#4ecdc4', // 青色
  '#45b7d1', // 天蓝
  '#f39c12', // 橙色
];

/**
 * 生成唯一ID
 */
function generateId(): string {
  return `mg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 故事单元编辑器工具栏
 */
class StoryUnitToolbar {
  private app: App;
  private config: StoryUnitToolbarConfig;
  private storyUnitService: StoryUnitService;
  private trackService: TrackService;

  // 标记组列表（支持多组并行标记）
  private markingGroups: MarkingGroup[] = [];
  // 当前活动的标记组ID
  private activeGroupId: string | null = null;
  
  // 工具栏元素
  private toolbarEl: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private groupListEl: HTMLElement | null = null;

  constructor(app: App, config: StoryUnitToolbarConfig = {}) {
    this.app = app;
    this.config = config;
    this.storyUnitService = new StoryUnitService(app);
    this.trackService = new TrackService();
  }

  /**
   * 获取或创建活动标记组
   */
  private getOrCreateActiveGroup(bookId: string): MarkingGroup {
    // 如果有活动组，返回它
    if (this.activeGroupId) {
      const activeGroup = this.markingGroups.find(g => g.id === this.activeGroupId);
      if (activeGroup) return activeGroup;
    }
    
    // 如果没有任何标记组，创建一个默认组
    if (this.markingGroups.length === 0) {
      return this.createMarkingGroup('标记组 1');
    }
    
    // 返回第一个标记组
    this.activeGroupId = this.markingGroups[0].id;
    return this.markingGroups[0];
  }

  /**
   * 创建新的标记组
   */
  createMarkingGroup(name?: string): MarkingGroup {
    const colorIndex = this.markingGroups.length % MARKING_GROUP_COLORS.length;
    const groupName = name || `标记组 ${this.markingGroups.length + 1}`;
    
    const newGroup: MarkingGroup = {
      id: generateId(),
      name: groupName,
      startMark: null,
      endMark: null,
      createdAt: Date.now(),
      color: MARKING_GROUP_COLORS[colorIndex]
    };
    
    this.markingGroups.push(newGroup);
    this.activeGroupId = newGroup.id;
    
    return newGroup;
  }

  /**
   * 删除标记组
   */
  deleteMarkingGroup(groupId: string): void {
    const index = this.markingGroups.findIndex(g => g.id === groupId);
    if (index === -1) return;
    
    this.markingGroups.splice(index, 1);
    
    // 如果删除的是活动组，切换到第一个组或清空
    if (this.activeGroupId === groupId) {
      this.activeGroupId = this.markingGroups.length > 0 ? this.markingGroups[0].id : null;
    }
    
    this.updateStatusDisplay();
  }

  /**
   * 设置活动标记组
   */
  setActiveGroup(groupId: string): void {
    if (this.markingGroups.find(g => g.id === groupId)) {
      this.activeGroupId = groupId;
      this.updateStatusDisplay();
    }
  }

  /**
   * 重命名标记组
   */
  renameMarkingGroup(groupId: string, newName: string): void {
    const group = this.markingGroups.find(g => g.id === groupId);
    if (group) {
      group.name = newName;
      this.updateStatusDisplay();
    }
  }

  /**
   * 获取所有标记组
   */
  getMarkingGroups(): MarkingGroup[] {
    return [...this.markingGroups];
  }

  /**
   * 获取活动标记组
   */
  getActiveGroup(): MarkingGroup | null {
    if (!this.activeGroupId) return null;
    return this.markingGroups.find(g => g.id === this.activeGroupId) || null;
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
    
    // 新增标记组按钮
    const addGroupBtn = buttonGroup.createEl('button', {
      text: '➕ 新建标记组',
      cls: 'nc-su-toolbar-btn',
      attr: { title: '创建新的标记组，支持多组并行标记' }
    });
    addGroupBtn.addEventListener('click', () => {
      this.createMarkingGroup();
      this.updateStatusDisplay();
      showInfo('已创建新的标记组');
    });
    
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
    
    // 时间线按钮
    const timelineBtn = buttonGroup.createEl('button', {
      text: '📊 时间线',
      cls: 'nc-su-toolbar-btn',
      attr: { title: '打开故事时间线视图' }
    });
    timelineBtn.addEventListener('click', () => this.openTimelineView(bookId));
    
    const clearBtn = buttonGroup.createEl('button', {
      text: '🗑️ 清除标记',
      cls: 'nc-su-toolbar-btn nc-su-toolbar-btn-danger',
      attr: { title: '清除当前标记组的标记' }
    });
    clearBtn.addEventListener('click', () => this.clearActiveGroupMarks());
    
    // 标记组列表区域
    this.groupListEl = toolbar.createDiv({ cls: 'nc-su-group-list' });
    
    // 状态显示区域
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
    // 更新标记组列表
    this.updateGroupList();
    
    // 更新当前活动组状态
    if (!this.statusEl) return;
    
    this.statusEl.empty();
    
    const activeGroup = this.getActiveGroup();
    
    if (activeGroup && (activeGroup.startMark || activeGroup.endMark)) {
      const statusText = this.statusEl.createDiv({ cls: 'nc-su-status-text' });
      
      // 显示当前活动组名称
      const groupLabel = statusText.createSpan({ 
        text: `[${activeGroup.name}] `,
        cls: 'nc-su-status-group-label'
      });
      groupLabel.style.color = activeGroup.color;
      
      if (activeGroup.startMark) {
        const startText = this.formatMarkPosition(activeGroup.startMark, '起始');
        statusText.createSpan({ 
          text: startText,
          cls: 'nc-su-status-mark nc-su-status-start'
        });
      }
      
      if (activeGroup.startMark && activeGroup.endMark) {
        statusText.createSpan({ text: ' → ', cls: 'nc-su-status-arrow' });
      }
      
      if (activeGroup.endMark) {
        const endText = this.formatMarkPosition(activeGroup.endMark, '结束');
        statusText.createSpan({ 
          text: endText,
          cls: 'nc-su-status-mark nc-su-status-end'
        });
      }
      
      if (activeGroup.startMark && activeGroup.endMark) {
        const count = Math.abs(activeGroup.endMark.chapterIndex - activeGroup.startMark.chapterIndex) + 1;
        statusText.createSpan({ 
          text: ` (共${count}章)`,
          cls: 'nc-su-status-count'
        });
        
        // 添加可点击的创建按钮（当有完整标记时）
        const createBtn = statusText.createSpan({ 
          text: ' 📝 点击创建',
          cls: 'nc-su-status-create-btn',
          attr: { title: '点击从当前标记创建故事单元' }
        });
        createBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openCreateDialogForGroup(activeGroup);
        });
      }
    } else if (this.markingGroups.length > 0) {
      this.statusEl.createSpan({ 
        text: `当前: ${activeGroup?.name || '无活动组'} - 未设置标记`,
        cls: 'nc-su-status-empty'
      });
    } else {
      this.statusEl.createSpan({ 
        text: '点击"新建标记组"开始标记',
        cls: 'nc-su-status-empty'
      });
    }
  }

  /**
   * 格式化标记位置显示
   * 支持段落级精细标记显示格式
   */
  private formatMarkPosition(mark: ChapterMark, prefix: string): string {
    let text = `${prefix}: 第${mark.chapterIndex}章`;
    
    if (mark.paragraphPosition) {
      text += ` 第${mark.paragraphPosition.paragraphIndex}段`;
      
      // 如果有文本锚点，显示简短预览
      if (mark.paragraphPosition.textAnchor) {
        const anchor = mark.paragraphPosition.textAnchor;
        const preview = anchor.length > 10 ? anchor.substring(0, 10) + '...' : anchor;
        text += ` "${preview}"`;
      }
    }
    
    return text;
  }

  /**
   * 更新标记组列表显示
   */
  private updateGroupList(): void {
    if (!this.groupListEl) return;
    
    this.groupListEl.empty();
    
    if (this.markingGroups.length === 0) return;
    
    // 创建标记组标签列表
    for (const group of this.markingGroups) {
      const isActive = group.id === this.activeGroupId;
      const hasMarks = group.startMark || group.endMark;
      
      const groupTag = this.groupListEl.createDiv({ 
        cls: `nc-su-group-tag ${isActive ? 'nc-su-group-tag-active' : ''} ${hasMarks ? 'nc-su-group-tag-has-marks' : ''}`
      });
      groupTag.style.borderColor = group.color;
      if (isActive) {
        groupTag.style.backgroundColor = group.color + '20'; // 20% opacity
      }
      
      // 颜色指示点
      const colorDot = groupTag.createSpan({ cls: 'nc-su-group-color-dot' });
      colorDot.style.backgroundColor = group.color;
      
      // 组名称（可点击切换）
      const nameSpan = groupTag.createSpan({ 
        text: group.name,
        cls: 'nc-su-group-name'
      });
      nameSpan.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setActiveGroup(group.id);
      });
      
      // 显示标记范围（包含段落信息）
      if (group.startMark || group.endMark) {
        const rangeSpan = groupTag.createSpan({ cls: 'nc-su-group-range' });
        rangeSpan.textContent = this.formatGroupRange(group);
        
        // 如果有段落级标记，添加提示
        if (this.hasParagraphMarks(group)) {
          rangeSpan.setAttribute('title', this.formatGroupRangeTooltip(group));
          rangeSpan.addClass('nc-su-group-range-detailed');
        }
      }
      
      // 编辑按钮
      const editBtn = groupTag.createSpan({ 
        text: '✏️',
        cls: 'nc-su-group-action-btn',
        attr: { title: '重命名标记组' }
      });
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openRenameGroupModal(group);
      });
      
      // 创建故事单元按钮（仅当有完整标记时显示）
      if (group.startMark && group.endMark) {
        const createBtn = groupTag.createSpan({ 
          text: '➕',
          cls: 'nc-su-group-action-btn nc-su-group-create-btn',
          attr: { title: '从此标记组创建故事单元' }
        });
        createBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openCreateDialogForGroup(group);
        });
      }
      
      // 删除按钮
      const deleteBtn = groupTag.createSpan({ 
        text: '×',
        cls: 'nc-su-group-action-btn nc-su-group-delete-btn',
        attr: { title: '删除标记组' }
      });
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteMarkingGroup(group.id);
        showInfo(`已删除标记组: ${group.name}`);
      });
    }
  }

  /**
   * 检查标记组是否有段落级标记
   */
  private hasParagraphMarks(group: MarkingGroup): boolean {
    return !!(
      group.startMark?.paragraphPosition || 
      group.endMark?.paragraphPosition
    );
  }

  /**
   * 格式化标记组范围显示（简短版）
   */
  private formatGroupRange(group: MarkingGroup): string {
    if (group.startMark && group.endMark) {
      let range = `(${group.startMark.chapterIndex}`;
      if (group.startMark.paragraphPosition) {
        range += `.${group.startMark.paragraphPosition.paragraphIndex}`;
      }
      range += `-${group.endMark.chapterIndex}`;
      if (group.endMark.paragraphPosition) {
        range += `.${group.endMark.paragraphPosition.paragraphIndex}`;
      }
      range += ')';
      return range;
    } else if (group.startMark) {
      let range = `(${group.startMark.chapterIndex}`;
      if (group.startMark.paragraphPosition) {
        range += `.${group.startMark.paragraphPosition.paragraphIndex}`;
      }
      range += '-)';
      return range;
    } else if (group.endMark) {
      let range = `(-${group.endMark.chapterIndex}`;
      if (group.endMark.paragraphPosition) {
        range += `.${group.endMark.paragraphPosition.paragraphIndex}`;
      }
      range += ')';
      return range;
    }
    return '';
  }

  /**
   * 格式化标记组范围提示（详细版）
   */
  private formatGroupRangeTooltip(group: MarkingGroup): string {
    const parts: string[] = [];
    
    if (group.startMark) {
      let start = `起始: 第${group.startMark.chapterIndex}章`;
      if (group.startMark.paragraphPosition) {
        start += ` 第${group.startMark.paragraphPosition.paragraphIndex}段`;
        if (group.startMark.paragraphPosition.textAnchor) {
          start += ` "${group.startMark.paragraphPosition.textAnchor}"`;
        }
      }
      parts.push(start);
    }
    
    if (group.endMark) {
      let end = `结束: 第${group.endMark.chapterIndex}章`;
      if (group.endMark.paragraphPosition) {
        end += ` 第${group.endMark.paragraphPosition.paragraphIndex}段`;
        if (group.endMark.paragraphPosition.textAnchor) {
          end += ` "${group.endMark.paragraphPosition.textAnchor}"`;
        }
      }
      parts.push(end);
    }
    
    return parts.join('\n');
  }

  /**
   * 打开重命名标记组模态框
   */
  private openRenameGroupModal(group: MarkingGroup): void {
    const modal = new RenameGroupModal(this.app, {
      currentName: group.name,
      onSave: (newName) => {
        this.renameMarkingGroup(group.id, newName);
        showInfo(`标记组已重命名为: ${newName}`);
      }
    });
    modal.open();
  }

  /**
   * 为指定标记组打开创建对话框
   */
  private async openCreateDialogForGroup(group: MarkingGroup): Promise<void> {
    if (!group.startMark || !group.endMark) {
      showWarning('请先完成起始和结束标记');
      return;
    }
    
    const bookId = group.startMark.bookId;
    const chapterStart = Math.min(group.startMark.chapterIndex, group.endMark.chapterIndex);
    const chapterEnd = Math.max(group.startMark.chapterIndex, group.endMark.chapterIndex);
    
    // 提取段落级信息
    const paragraphStart = group.startMark.paragraphPosition?.paragraphIndex;
    const paragraphEnd = group.endMark.paragraphPosition?.paragraphIndex;
    const textAnchor = group.startMark.paragraphPosition?.textAnchor || 
                       group.endMark.paragraphPosition?.textAnchor;
    
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
        defaultTitle: group.name, // 使用标记组名称作为默认标题
        paragraphStart,
        paragraphEnd,
        textAnchor,
        onSave: async (config) => {
          try {
            await this.storyUnitService.createStoryUnit(config);
            showSuccess('故事单元创建成功');
            // 创建成功后删除该标记组
            this.deleteMarkingGroup(group.id);
            // 自动刷新侧边栏视图
            this.refreshStoryUnitView();
          } catch (error) {
            showError('创建失败', error instanceof Error ? error.message : '未知错误');
          }
        }
      }
    );
    modal.open();
  }

  /**
   * 清除当前活动标记组的标记
   */
  private clearActiveGroupMarks(): void {
    const activeGroup = this.getActiveGroup();
    if (activeGroup) {
      activeGroup.startMark = null;
      activeGroup.endMark = null;
      this.updateStatusDisplay();
      showInfo(`已清除标记组 "${activeGroup.name}" 的标记`);
    } else {
      showWarning('没有活动的标记组');
    }
  }

  /**
   * 获取当前光标位置的段落信息
   * 支持段落级精细标记
   */
  private getCurrentParagraphPosition(): ParagraphPosition | undefined {
    const activeView = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!activeView) return undefined;
    
    const editor = activeView.editor;
    if (!editor) return undefined;
    
    // 获取选中的文本或光标位置
    const selection = editor.getSelection();
    const cursor = editor.getCursor();
    
    // 获取文档内容
    const content = editor.getValue();
    const lines = content.split('\n');
    
    // 计算段落序号（以空行分隔的段落）
    let paragraphIndex = 1;
    let currentLine = 0;
    let inParagraph = false;
    
    for (let i = 0; i <= cursor.line && i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line === '') {
        // 空行
        if (inParagraph) {
          inParagraph = false;
        }
      } else {
        // 非空行
        if (!inParagraph) {
          // 开始新段落
          if (i > 0) {
            paragraphIndex++;
          }
          inParagraph = true;
        }
      }
      currentLine = i;
    }
    
    // 获取文本锚点（选中文本的前30字符，或光标所在行的前30字符）
    let textAnchor: string | undefined;
    
    if (selection && selection.length > 0) {
      // 使用选中的文本
      textAnchor = selection.substring(0, 30).replace(/\n/g, ' ').trim();
    } else {
      // 使用光标所在行的文本
      const currentLineText = lines[cursor.line]?.trim();
      if (currentLineText && currentLineText.length > 0) {
        textAnchor = currentLineText.substring(0, 30);
      }
    }
    
    return {
      paragraphIndex,
      offset: cursor.ch,
      textAnchor
    };
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
    
    // 获取或创建活动标记组
    const activeGroup = this.getOrCreateActiveGroup(bookId);
    
    // 获取段落位置信息
    const paragraphPosition = this.getCurrentParagraphPosition();
    
    activeGroup.startMark = {
      filePath: file.path,
      chapterIndex: chapterInfo.index,
      chapterTitle: chapterInfo.title,
      bookId,
      paragraphPosition
    };
    
    // 自动调整顺序
    if (activeGroup.endMark && activeGroup.endMark.chapterIndex < activeGroup.startMark.chapterIndex) {
      const temp = activeGroup.startMark;
      activeGroup.startMark = activeGroup.endMark;
      activeGroup.endMark = temp;
    }
    
    this.updateStatusDisplay();
    
    // 构建提示信息
    let message = `[${activeGroup.name}] 已标记起始位置: 第${chapterInfo.index}章`;
    if (paragraphPosition) {
      message += ` 第${paragraphPosition.paragraphIndex}段`;
      if (paragraphPosition.textAnchor) {
        message += ` "${paragraphPosition.textAnchor.substring(0, 15)}..."`;
      }
    }
    showInfo(message);
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
    
    // 获取或创建活动标记组
    const activeGroup = this.getOrCreateActiveGroup(bookId);
    
    // 获取段落位置信息
    const paragraphPosition = this.getCurrentParagraphPosition();
    
    activeGroup.endMark = {
      filePath: file.path,
      chapterIndex: chapterInfo.index,
      chapterTitle: chapterInfo.title,
      bookId,
      paragraphPosition
    };
    
    // 自动调整顺序
    if (activeGroup.startMark && activeGroup.endMark.chapterIndex < activeGroup.startMark.chapterIndex) {
      const temp = activeGroup.startMark;
      activeGroup.startMark = activeGroup.endMark;
      activeGroup.endMark = temp;
    }
    
    this.updateStatusDisplay();
    
    // 构建提示信息
    let message = `[${activeGroup.name}] 已标记结束位置: 第${chapterInfo.index}章`;
    if (paragraphPosition) {
      message += ` 第${paragraphPosition.paragraphIndex}段`;
      if (paragraphPosition.textAnchor) {
        message += ` "${paragraphPosition.textAnchor.substring(0, 15)}..."`;
      }
    }
    showInfo(message);
  }

  /**
   * 清除所有标记（兼容旧API）
   */
  private clearMarks(): void {
    this.markingGroups = [];
    this.activeGroupId = null;
    this.updateStatusDisplay();
    showInfo('已清除所有标记组');
  }

  /**
   * 打开创建对话框
   */
  private async openCreateDialog(bookId: string): Promise<void> {
    let chapterStart = 1;
    let chapterEnd = 1;
    let defaultTitle = '';
    
    const activeGroup = this.getActiveGroup();
    
    if (activeGroup) {
      if (activeGroup.startMark && activeGroup.endMark) {
        chapterStart = Math.min(activeGroup.startMark.chapterIndex, activeGroup.endMark.chapterIndex);
        chapterEnd = Math.max(activeGroup.startMark.chapterIndex, activeGroup.endMark.chapterIndex);
        defaultTitle = activeGroup.name;
      } else if (activeGroup.startMark) {
        chapterStart = activeGroup.startMark.chapterIndex;
        chapterEnd = activeGroup.startMark.chapterIndex;
      } else if (activeGroup.endMark) {
        chapterStart = activeGroup.endMark.chapterIndex;
        chapterEnd = activeGroup.endMark.chapterIndex;
      }
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
        defaultTitle,
        onSave: async (config) => {
          try {
            await this.storyUnitService.createStoryUnit(config);
            showSuccess('故事单元创建成功');
            // 创建成功后清除当前活动组的标记
            if (activeGroup) {
              activeGroup.startMark = null;
              activeGroup.endMark = null;
              this.updateStatusDisplay();
            }
            // 自动刷新侧边栏视图
            this.refreshStoryUnitView();
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
      
      // 设置当前书籍和LLM服务
      const view = leaf.view as StoryUnitView;
      if (view && typeof view.setBook === 'function') {
        // 设置LLM服务（用于AI分析）
        if (this.config.llmService && typeof view.setLLMService === 'function') {
          view.setLLMService(this.config.llmService);
        }
        await view.setBook(bookId);
      }
    }
  }

  /**
   * 打开时间线视图（在底部面板）
   */
  private async openTimelineView(bookId: string): Promise<void> {
    const { workspace } = this.app;
    
    // 查找或创建时间线视图
    let leaf = workspace.getLeavesOfType(TIMELINE_VIEW_TYPE)[0];
    
    if (!leaf) {
      // 在底部创建新的叶子（类似剪辑软件的时间线）
      const rootSplit = workspace.rootSplit;
      if (rootSplit) {
        // 创建底部分割
        leaf = workspace.createLeafBySplit(workspace.getMostRecentLeaf()!, 'horizontal', true);
        if (leaf) {
          await leaf.setViewState({
            type: TIMELINE_VIEW_TYPE,
            active: true
          });
        }
      }
    }
    
    if (leaf) {
      workspace.revealLeaf(leaf);
      
      // 设置当前书籍
      const view = leaf.view as TimelineView;
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
   * 获取当前标记状态（兼容旧API）
   */
  getMarks(): { start: ChapterMark | null; end: ChapterMark | null } {
    const activeGroup = this.getActiveGroup();
    return { 
      start: activeGroup?.startMark || null, 
      end: activeGroup?.endMark || null 
    };
  }

  /**
   * 获取所有标记组的标记状态
   */
  getAllMarks(): { groupId: string; name: string; start: ChapterMark | null; end: ChapterMark | null }[] {
    return this.markingGroups.map(group => ({
      groupId: group.id,
      name: group.name,
      start: group.startMark,
      end: group.endMark
    }));
  }

  /**
   * 刷新故事单元侧边栏视图
   */
  private refreshStoryUnitView(): void {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(STORY_UNIT_VIEW_TYPE);
    
    for (const leaf of leaves) {
      const view = leaf.view as StoryUnitView;
      if (view && typeof view.refresh === 'function') {
        view.refresh();
      }
    }
  }

  /**
   * 销毁工具栏
   */
  destroy(): void {
    this.removeToolbar();
    this.markingGroups = [];
    this.activeGroupId = null;
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
    defaultTitle?: string;
    paragraphStart?: number;
    paragraphEnd?: number;
    textAnchor?: string;
    onSave: (config: StoryUnitCreateConfig) => Promise<void>;
  };
  
  private formData: {
    title: string;
    chapterStart: number;
    chapterEnd: number;
    trackId: string;
    isPastEvent: boolean;
    characterIds: string[];
    paragraphStart?: number;
    paragraphEnd?: number;
    textAnchor?: string;
  };
  
  private saveButton!: HTMLButtonElement;

  constructor(app: App, config: typeof StoryUnitQuickCreateModal.prototype.config) {
    super(app);
    this.config = config;
    
    this.formData = {
      title: config.defaultTitle || '',
      chapterStart: config.chapterStart,
      chapterEnd: config.chapterEnd,
      trackId: config.tracks[0]?.id || '',
      isPastEvent: false,
      characterIds: [],
      paragraphStart: config.paragraphStart,
      paragraphEnd: config.paragraphEnd,
      textAnchor: config.textAnchor
    };
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-su-quick-create-modal');

    contentEl.createEl('h2', { text: '➕ 创建故事单元' });
    
    const rangeInfo = contentEl.createDiv({ cls: 'nc-su-range-info' });
    const count = this.formData.chapterEnd - this.formData.chapterStart + 1;
    
    // 构建范围显示文本（包含段落级信息）
    let rangeText = `📖 章节范围: 第${this.formData.chapterStart}章`;
    if (this.formData.paragraphStart) {
      rangeText += ` 第${this.formData.paragraphStart}段`;
    }
    rangeText += ` - 第${this.formData.chapterEnd}章`;
    if (this.formData.paragraphEnd) {
      rangeText += ` 第${this.formData.paragraphEnd}段`;
    }
    rangeText += ` (共${count}章)`;
    
    rangeInfo.createSpan({ 
      text: rangeText,
      cls: 'nc-su-range-text'
    });
    
    // 如果有文本锚点，显示预览
    if (this.formData.textAnchor) {
      const anchorInfo = rangeInfo.createDiv({ cls: 'nc-su-anchor-info' });
      anchorInfo.createSpan({ 
        text: `📍 文本锚点: "${this.formData.textAnchor}"`,
        cls: 'nc-su-anchor-text'
      });
    }

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
        characterIds: this.formData.characterIds,
        paragraphStart: this.formData.paragraphStart,
        paragraphEnd: this.formData.paragraphEnd,
        textAnchor: this.formData.textAnchor
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

/**
 * 重命名标记组模态框
 */
class RenameGroupModal extends Modal {
  private config: {
    currentName: string;
    onSave: (newName: string) => void;
  };
  
  private newName: string;

  constructor(app: App, config: typeof RenameGroupModal.prototype.config) {
    super(app);
    this.config = config;
    this.newName = config.currentName;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-su-rename-modal');

    contentEl.createEl('h3', { text: '✏️ 重命名标记组' });

    const form = contentEl.createDiv({ cls: 'nc-su-form' });

    new Setting(form)
      .setName('标记组名称')
      .addText((text: TextComponent) => {
        text.setPlaceholder('输入新名称')
          .setValue(this.newName)
          .onChange((value: string) => { this.newName = value; });
        text.inputEl.addClass('nc-su-rename-input');
        setTimeout(() => {
          text.inputEl.focus();
          text.inputEl.select();
        }, 100);
      });

    const buttonContainer = contentEl.createDiv({ cls: 'nc-su-buttons' });
    
    buttonContainer.createEl('button', { text: '取消', cls: 'nc-btn' })
      .addEventListener('click', () => this.close());
    
    buttonContainer.createEl('button', { text: '保存', cls: 'nc-btn nc-btn-primary' })
      .addEventListener('click', () => this.save());
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private save(): void {
    if (!this.newName.trim()) {
      showWarning('请输入标记组名称');
      return;
    }
    
    this.config.onSave(this.newName.trim());
    this.close();
  }
}
