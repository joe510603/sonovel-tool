/**
 * MarkingToolbar - 章节文档的标记工具栏（简化版）
 * 
 * 只保留故事单元功能
 */

import { App, MarkdownView, Editor, WorkspaceLeaf, Menu } from 'obsidian';
import { UnifiedMarkingService } from '../services/UnifiedMarkingService';
import { PreciseMarkingService } from '../services/PreciseMarkingService';
import { showSuccess, showWarning } from './NotificationUtils';

export interface MarkingToolbarConfig {
  enabled: boolean;
  bookPathPrefix?: string;
  preciseMarkingEnabled?: boolean;
  contextMenuEnabled?: boolean;
}

export const DEFAULT_MARKING_TOOLBAR_CONFIG: MarkingToolbarConfig = {
  enabled: true,
  bookPathPrefix: 'NovelCraft/books/',
  preciseMarkingEnabled: false,
  contextMenuEnabled: true
};

export class MarkingToolbar {
  private app: App;
  private markingService: UnifiedMarkingService;
  private preciseMarkingService: PreciseMarkingService | null = null;
  private config: MarkingToolbarConfig;
  
  private currentEditor: Editor | null = null;
  private currentBookId: string | null = null;
  private currentBookPath: string | null = null;
  private currentChapterIndex: number | null = null;
  private contextMenuHandler: ((e: MouseEvent) => void) | null = null;

  constructor(
    app: App,
    markingService: UnifiedMarkingService,
    config?: Partial<MarkingToolbarConfig>
  ) {
    this.app = app;
    this.markingService = markingService;
    this.config = { ...DEFAULT_MARKING_TOOLBAR_CONFIG, ...config };
  }

  setPreciseMarkingService(service: PreciseMarkingService): void {
    this.preciseMarkingService = service;
  }

  initialize(): void {
    this.app.workspace.on('active-leaf-change', (leaf) => {
      if (leaf) this.handleLeafChange(leaf);
    });
    
    if (this.config.contextMenuEnabled) {
      this.registerContextMenu();
    }
  }

  destroy(): void {
    this.unregisterContextMenu();
  }

  private registerContextMenu(): void {
    this.contextMenuHandler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.cm-editor')) return;
      if (!this.currentBookId || this.currentChapterIndex === null) return;
      
      e.preventDefault();
      this.showContextMenu(e);
    };
    
    document.addEventListener('contextmenu', this.contextMenuHandler);
  }

  private unregisterContextMenu(): void {
    if (this.contextMenuHandler) {
      document.removeEventListener('contextmenu', this.contextMenuHandler);
      this.contextMenuHandler = null;
    }
  }

  private showContextMenu(e: MouseEvent): void {
    const menu = new Menu();
    
    const hasSelection = (this.currentEditor?.getSelection()?.length ?? 0) > 0;
    
    // 故事单元
    menu.addItem((item) => {
      item
        .setTitle('📖 创建故事单元')
        .setIcon('file-text')
        .onClick(() => this.handleCreateStoryUnit());
    });
    
    menu.addSeparator();
    
    // 位置信息
    if (this.currentEditor) {
      const cursor = this.currentEditor.getCursor();
      menu.addItem((item) => {
        item
          .setTitle(`📍 第${(this.currentChapterIndex || 0) + 1}章, 行${cursor.line + 1}`)
          .setDisabled(true);
      });
    }
    
    menu.showAtMouseEvent(e);
  }

  private handleCreateStoryUnit(): void {
    (this.app as any).commands?.executeCommandById('novel-craft:create-story-unit');
  }

  setBookPathPrefix(prefix: string): void {
    this.config.bookPathPrefix = prefix;
  }

  setBookContext(bookId: string, chapterIndex: number): void {
    this.currentBookId = bookId;
    this.currentChapterIndex = chapterIndex;
  }

  clearBookContext(): void {
    this.currentBookId = null;
    this.currentBookPath = null;
    this.currentChapterIndex = null;
  }

  private handleLeafChange(leaf: WorkspaceLeaf): void {
    if (!this.config.enabled) return;
    
    const view = leaf.view;
    if (view instanceof MarkdownView) {
      const file = view.file;
      if (file && this.isNovelCraftChapter(file.path)) {
        this.currentEditor = view.editor;
        this.extractBookContext(file.path);
        return;
      }
    }
    
    this.clearBookContext();
  }

  private isNovelCraftChapter(path: string): boolean {
    const prefix = this.config.bookPathPrefix || 'NovelCraft/books/';
    const isInBookPath = path.includes(prefix) || 
                         path.includes('NovelCraft/books/') ||
                         path.includes('novelcraft/books/');
    return isInBookPath && path.endsWith('.md') && !path.endsWith('_index.md');
  }

  private extractBookContext(path: string): void {
    const patterns = [
      /NovelCraft\/books\/([^/]+)\//i,
      /novelcraft\/books\/([^/]+)\//i,
      /books\/([^/]+)\//i
    ];
    
    for (const pattern of patterns) {
      const match = path.match(pattern);
      if (match) {
        this.currentBookId = match[1];
        const bookPathMatch = path.match(/(.*\/[^/]+)\//);
        if (bookPathMatch) {
          this.currentBookPath = bookPathMatch[1];
        }
        break;
      }
    }
    
    const parts = path.split('/');
    const filename = parts[parts.length - 1];
    const chapterMatch = filename.match(/^(\d+)/);
    if (chapterMatch) {
      this.currentChapterIndex = parseInt(chapterMatch[1], 10) - 1;
    } else {
      this.currentChapterIndex = 0;
    }
  }
}
