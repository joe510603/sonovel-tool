import { App, setIcon } from 'obsidian';
import { BookEntry } from '../types';
import { LibraryService } from '../services/LibraryService';

/**
 * 书籍选择回调
 */
export type BookSelectCallback = (bookId: string, book: BookEntry) => void;

/**
 * BookSelector - 书籍选择器组件
 * 
 * 提供下拉选择书籍的 UI 组件，用于各个视图中选择当前操作的书籍
 */
export class BookSelector {
  private app: App;
  private libraryService: LibraryService;
  private containerEl: HTMLElement;
  private selectEl: HTMLSelectElement;
  private onSelect: BookSelectCallback | null = null;
  private currentBookId: string | null = null;
  private books: BookEntry[] = [];

  constructor(app: App, libraryService: LibraryService) {
    this.app = app;
    this.libraryService = libraryService;
  }

  /**
   * 渲染选择器到容器
   */
  render(container: HTMLElement): void {
    this.containerEl = container.createDiv({ cls: 'novelcraft-book-selector' });
    
    // 标签
    const labelEl = this.containerEl.createEl('label', {
      text: '选择书籍',
      cls: 'novelcraft-book-selector-label'
    });
    
    // 选择器容器
    const selectContainer = this.containerEl.createDiv({ cls: 'novelcraft-book-selector-container' });
    
    // 图标
    const iconEl = selectContainer.createSpan({ cls: 'novelcraft-book-selector-icon' });
    setIcon(iconEl, 'book');
    
    // 下拉选择框
    this.selectEl = selectContainer.createEl('select', {
      cls: 'novelcraft-book-selector-select'
    });
    
    this.selectEl.addEventListener('change', () => {
      const selectedValue = this.selectEl.value;
      if (selectedValue && this.onSelect) {
        const book = this.books.find(b => b.title === selectedValue);
        if (book) {
          this.currentBookId = selectedValue;
          this.onSelect(selectedValue, book);
        }
      }
    });
    
    // 刷新按钮
    const refreshBtn = selectContainer.createEl('button', {
      cls: 'novelcraft-book-selector-refresh',
      attr: { 'aria-label': '刷新书籍列表' }
    });
    setIcon(refreshBtn, 'refresh-cw');
    refreshBtn.addEventListener('click', () => this.refresh());
    
    // 初始加载
    this.refresh();
  }

  /**
   * 设置选择回调
   */
  setOnSelect(callback: BookSelectCallback): void {
    this.onSelect = callback;
  }

  /**
   * 刷新书籍列表
   */
  async refresh(): Promise<void> {
    try {
      this.books = await this.libraryService.getAllBooks();
      this.updateSelectOptions();
    } catch (error) {
      console.error('BookSelector: 加载书籍列表失败', error);
    }
  }

  /**
   * 更新下拉选项
   */
  private updateSelectOptions(): void {
    // 清空现有选项
    this.selectEl.empty();
    
    // 添加默认选项
    const defaultOption = this.selectEl.createEl('option', {
      text: '-- 请选择书籍 --',
      value: ''
    });
    defaultOption.disabled = true;
    
    if (this.books.length === 0) {
      const emptyOption = this.selectEl.createEl('option', {
        text: '暂无书籍，请先转换 EPUB',
        value: ''
      });
      emptyOption.disabled = true;
      this.selectEl.value = '';
      return;
    }
    
    // 添加书籍选项
    for (const book of this.books) {
      const option = this.selectEl.createEl('option', {
        text: `${book.title} - ${book.author}`,
        value: book.title
      });
      
      // 如果是当前选中的书籍，保持选中状态
      if (this.currentBookId === book.title) {
        option.selected = true;
      }
    }
    
    // 如果没有选中的书籍，选择默认选项
    if (!this.currentBookId) {
      defaultOption.selected = true;
    }
  }

  /**
   * 设置当前选中的书籍
   */
  setCurrentBook(bookId: string): void {
    this.currentBookId = bookId;
    if (this.selectEl) {
      this.selectEl.value = bookId;
    }
  }

  /**
   * 获取当前选中的书籍 ID
   */
  getCurrentBookId(): string | null {
    return this.currentBookId;
  }

  /**
   * 获取当前选中的书籍
   */
  getCurrentBook(): BookEntry | null {
    if (!this.currentBookId) return null;
    return this.books.find(b => b.title === this.currentBookId) || null;
  }

  /**
   * 销毁组件
   */
  destroy(): void {
    if (this.containerEl) {
      this.containerEl.remove();
    }
  }
}
