import { ItemView, WorkspaceLeaf, TFile } from 'obsidian';
import { NovelCraftSettings, BookSearchResult, LocalBook } from '../types';
import { SoNovelService } from '../services/SoNovelService';
import { LLMService } from '../services/LLMService';
import { showError, showSuccess, showWarning } from './NotificationUtils';
import { getSupportedExtensions } from '../core/ParserFactory';

export const MAIN_PANEL_VIEW_TYPE = 'novel-craft-main-panel';

/**
 * NovelCraft 主面板 - 侧边栏视图
 * 提供统一的操作界面
 */
export class MainPanel extends ItemView {
  private settings: NovelCraftSettings;
  private soNovelService: SoNovelService;
  private llmService: LLMService;
  private onAnalyzeBook: (path: string) => void;
  private onOpenChat: () => void;
  private hasAnalysisResult: () => boolean;
  
  // UI 元素
  private searchInput: HTMLInputElement;
  private searchResults: HTMLElement;
  private localBooks: HTMLElement;
  private epubList: HTMLElement;
  private chatButton: HTMLButtonElement;

  constructor(
    leaf: WorkspaceLeaf,
    settings: NovelCraftSettings,
    soNovelService: SoNovelService,
    llmService: LLMService,
    onAnalyzeBook: (path: string) => void,
    onOpenChat: () => void,
    hasAnalysisResult?: () => boolean
  ) {
    super(leaf);
    this.settings = settings;
    this.soNovelService = soNovelService;
    this.llmService = llmService;
    this.onAnalyzeBook = onAnalyzeBook;
    this.onOpenChat = onOpenChat;
    this.hasAnalysisResult = hasAnalysisResult || (() => false);
  }

  getViewType(): string {
    return MAIN_PANEL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return 'NovelCraft';
  }

  getIcon(): string {
    return 'book-open';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('novel-craft-main-panel');

    // 创建主容器
    const content = container.createDiv({ cls: 'nc-panel-content' });
    
    // 标题
    const header = content.createDiv({ cls: 'nc-panel-header' });
    header.createEl('h3', { text: '📚 NovelCraft', cls: 'nc-panel-title' });
    
    // 标签页
    const tabs = content.createDiv({ cls: 'nc-tabs' });
    const tabSearch = tabs.createEl('button', { text: '搜索下载', cls: 'nc-tab active' });
    const tabLocal = tabs.createEl('button', { text: '本地书籍', cls: 'nc-tab' });
    const tabVault = tabs.createEl('button', { text: 'Vault', cls: 'nc-tab' });
    
    // 内容区域
    const contentArea = content.createDiv({ cls: 'nc-content-area' });
    
    // 搜索面板
    const searchPanel = contentArea.createDiv({ cls: 'nc-tab-panel active', attr: { 'data-tab': 'search' } });
    this.createSearchPanel(searchPanel);
    
    // 本地书籍面板
    const localPanel = contentArea.createDiv({ cls: 'nc-tab-panel', attr: { 'data-tab': 'local' } });
    this.createLocalBooksPanel(localPanel);
    
    // Vault 面板
    const vaultPanel = contentArea.createDiv({ cls: 'nc-tab-panel', attr: { 'data-tab': 'vault' } });
    this.createVaultPanel(vaultPanel);
    
    // 标签页切换逻辑
    const allTabs = [tabSearch, tabLocal, tabVault];
    const allPanels = [searchPanel, localPanel, vaultPanel];
    
    allTabs.forEach((tab, index) => {
      tab.addEventListener('click', () => {
        allTabs.forEach(t => t.removeClass('active'));
        allPanels.forEach(p => p.removeClass('active'));
        tab.addClass('active');
        allPanels[index].addClass('active');
        
        // 切换到本地书籍时刷新列表
        if (index === 1) {
          this.refreshLocalBooks();
        }
        // 切换到 Vault 时刷新列表
        if (index === 2) {
          this.refreshVaultEpubs();
        }
      });
    });

    // 底部操作区
    const footer = content.createDiv({ cls: 'nc-panel-footer' });
    this.createFooterActions(footer);
  }

  /**
   * 创建底部操作区
   */
  private createFooterActions(container: HTMLElement): void {
    // 对话按钮（始终可用，可在视图内选择已有分析）
    this.chatButton = container.createEl('button', {
      text: '💬 打开对话',
      cls: 'nc-btn nc-btn-chat'
    });
    this.chatButton.addEventListener('click', () => {
      this.onOpenChat();
    });
    
    // 提示文字
    const hint = container.createDiv({ cls: 'nc-footer-hint' });
    hint.textContent = '可选择已分析的书籍进行追问';
  }

  /**
   * 更新对话按钮状态（保留方法以兼容）
   */
  updateChatButtonState(): void {
    // 按钮始终可用，不需要更新状态
  }

  /**
   * 创建搜索面板
   */
  private createSearchPanel(container: HTMLElement): void {
    // 搜索框
    const searchBox = container.createDiv({ cls: 'nc-search-box' });
    this.searchInput = searchBox.createEl('input', {
      type: 'text',
      placeholder: '输入书名或作者...',
      cls: 'nc-search-input'
    });
    
    const searchBtn = searchBox.createEl('button', { text: '搜索', cls: 'nc-btn nc-btn-primary' });
    
    // 搜索结果
    this.searchResults = container.createDiv({ cls: 'nc-search-results' });
    this.searchResults.createEl('p', { text: '输入关键词搜索小说', cls: 'nc-hint' });
    
    // 事件绑定
    searchBtn.addEventListener('click', () => this.performSearch());
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.performSearch();
    });
  }

  /**
   * 创建本地书籍面板
   */
  private createLocalBooksPanel(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'nc-section-header' });
    header.createEl('span', { text: 'SoNovel 已下载' });
    const refreshBtn = header.createEl('button', { text: '刷新', cls: 'nc-btn nc-btn-small' });
    refreshBtn.addEventListener('click', () => this.refreshLocalBooks());
    
    this.localBooks = container.createDiv({ cls: 'nc-book-list' });
    this.localBooks.createEl('p', { text: '点击刷新加载列表', cls: 'nc-hint' });
  }

  /**
   * 创建 Vault 面板
   */
  private createVaultPanel(container: HTMLElement): void {
    const header = container.createDiv({ cls: 'nc-section-header' });
    header.createEl('span', { text: 'Vault 中的文档' });
    const refreshBtn = header.createEl('button', { text: '刷新', cls: 'nc-btn nc-btn-small' });
    refreshBtn.addEventListener('click', () => this.refreshVaultDocuments());
    
    // 支持的格式提示
    const hint = container.createDiv({ cls: 'nc-format-hint' });
    hint.textContent = `支持格式: ${getSupportedExtensions().join(', ')}`;
    
    this.epubList = container.createDiv({ cls: 'nc-book-list' });
    this.refreshVaultDocuments();
  }

  /**
   * 执行搜索
   */
  private async performSearch(): Promise<void> {
    const keyword = this.searchInput.value.trim();
    if (!keyword) {
      showWarning('请输入搜索关键词');
      return;
    }

    this.searchResults.empty();
    this.searchResults.createEl('p', { text: '搜索中...', cls: 'nc-loading' });

    try {
      const results = await this.soNovelService.search(keyword);
      this.renderSearchResults(results);
    } catch (error) {
      this.searchResults.empty();
      this.searchResults.createEl('p', { 
        text: `搜索失败: ${error instanceof Error ? error.message : '未知错误'}`, 
        cls: 'nc-error' 
      });
    }
  }

  /**
   * 渲染搜索结果
   */
  private renderSearchResults(results: BookSearchResult[]): void {
    this.searchResults.empty();
    
    if (results.length === 0) {
      this.searchResults.createEl('p', { text: '未找到相关书籍', cls: 'nc-hint' });
      return;
    }

    results.forEach((book, index) => {
      const item = this.searchResults.createDiv({ cls: 'nc-book-item' });
      
      const info = item.createDiv({ cls: 'nc-book-info' });
      info.createEl('div', { text: book.bookName, cls: 'nc-book-title' });
      info.createEl('div', { text: `${book.author} · ${book.sourceId}`, cls: 'nc-book-meta' });
      if (book.latestChapter) {
        info.createEl('div', { text: book.latestChapter, cls: 'nc-book-chapter' });
      }
      
      const actions = item.createDiv({ cls: 'nc-book-actions' });
      const downloadBtn = actions.createEl('button', { text: '下载', cls: 'nc-btn nc-btn-small nc-btn-primary' });
      downloadBtn.addEventListener('click', () => this.downloadBook(book, downloadBtn));
    });
  }

  /**
   * 下载书籍
   */
  private async downloadBook(book: BookSearchResult, btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true;
    btn.textContent = '下载中...';

    try {
      // 触发服务器下载
      await this.soNovelService.fetchBook(book);
      
      // 获取最新的本地书籍列表
      const localBooks = await this.soNovelService.getLocalBooks();
      const latestBook = localBooks[0]; // 假设最新的在前面
      
      if (latestBook) {
        // 下载到 vault
        const arrayBuffer = await this.soNovelService.downloadBook(latestBook.filename, '');
        const savePath = `${this.settings.downloadPath}/${latestBook.filename}`;
        
        // 确保目录存在
        await this.ensureDirectory(this.settings.downloadPath);
        
        // 保存文件
        const existingFile = this.app.vault.getAbstractFileByPath(savePath);
        if (existingFile instanceof TFile) {
          await this.app.vault.modifyBinary(existingFile, arrayBuffer);
        } else {
          await this.app.vault.createBinary(savePath, arrayBuffer);
        }
        
        showSuccess(`已下载: ${latestBook.filename}`);
        btn.textContent = '已下载';
      }
    } catch (error) {
      showError('下载失败', error instanceof Error ? error.message : '未知错误');
      btn.textContent = '下载';
      btn.disabled = false;
    }
  }

  /**
   * 刷新本地书籍列表
   */
  private async refreshLocalBooks(): Promise<void> {
    this.localBooks.empty();
    this.localBooks.createEl('p', { text: '加载中...', cls: 'nc-loading' });

    try {
      const books = await this.soNovelService.getLocalBooks();
      this.renderLocalBooks(books);
    } catch (error) {
      this.localBooks.empty();
      this.localBooks.createEl('p', { 
        text: 'SoNovel 服务不可用', 
        cls: 'nc-error' 
      });
    }
  }

  /**
   * 渲染本地书籍列表
   */
  private renderLocalBooks(books: LocalBook[]): void {
    this.localBooks.empty();
    
    if (books.length === 0) {
      this.localBooks.createEl('p', { text: '暂无已下载书籍', cls: 'nc-hint' });
      return;
    }

    books.forEach(book => {
      const item = this.localBooks.createDiv({ cls: 'nc-book-item' });
      
      const info = item.createDiv({ cls: 'nc-book-info' });
      info.createEl('div', { text: book.filename, cls: 'nc-book-title' });
      info.createEl('div', { text: this.formatSize(book.size), cls: 'nc-book-meta' });
      
      const actions = item.createDiv({ cls: 'nc-book-actions' });
      const importBtn = actions.createEl('button', { text: '导入', cls: 'nc-btn nc-btn-small' });
      importBtn.addEventListener('click', () => this.importBook(book, importBtn));
    });
  }

  /**
   * 导入书籍到 Vault
   */
  private async importBook(book: LocalBook, btn: HTMLButtonElement): Promise<void> {
    btn.disabled = true;
    btn.textContent = '导入中...';

    try {
      const arrayBuffer = await this.soNovelService.downloadBook(book.filename, '');
      const savePath = `${this.settings.downloadPath}/${book.filename}`;
      
      await this.ensureDirectory(this.settings.downloadPath);
      
      const existingFile = this.app.vault.getAbstractFileByPath(savePath);
      if (existingFile instanceof TFile) {
        await this.app.vault.modifyBinary(existingFile, arrayBuffer);
      } else {
        await this.app.vault.createBinary(savePath, arrayBuffer);
      }
      
      showSuccess(`已导入: ${book.filename}`);
      btn.textContent = '已导入';
      
      // 刷新 Vault 列表
      this.refreshVaultDocuments();
    } catch (error) {
      showError('导入失败', error instanceof Error ? error.message : '未知错误');
      btn.textContent = '导入';
      btn.disabled = false;
    }
  }

  /**
   * 刷新 Vault 中的文档列表
   */
  private refreshVaultDocuments(): void {
    this.epubList.empty();
    
    const supportedExts = getSupportedExtensions();
    const files = this.app.vault.getFiles().filter(f => 
      supportedExts.includes(f.extension.toLowerCase())
    );
    
    if (files.length === 0) {
      this.epubList.createEl('p', { text: '暂无支持的文档文件', cls: 'nc-hint' });
      return;
    }

    // 按扩展名分组显示
    const grouped = new Map<string, TFile[]>();
    for (const file of files) {
      const ext = file.extension.toLowerCase();
      if (!grouped.has(ext)) {
        grouped.set(ext, []);
      }
      grouped.get(ext)!.push(file);
    }

    for (const [ext, extFiles] of grouped) {
      // 格式标题
      const formatHeader = this.epubList.createDiv({ cls: 'nc-format-header' });
      formatHeader.textContent = `${ext.toUpperCase()} (${extFiles.length})`;
      
      for (const file of extFiles) {
        const item = this.epubList.createDiv({ cls: 'nc-book-item' });
        
        const info = item.createDiv({ cls: 'nc-book-info' });
        info.createEl('div', { text: file.basename, cls: 'nc-book-title' });
        info.createEl('div', { text: file.path, cls: 'nc-book-meta' });
        
        const actions = item.createDiv({ cls: 'nc-book-actions' });
        const analyzeBtn = actions.createEl('button', { text: '分析', cls: 'nc-btn nc-btn-small nc-btn-primary' });
        analyzeBtn.addEventListener('click', () => {
          this.onAnalyzeBook(file.path);
        });
      }
    }
  }

  /**
   * 刷新 Vault 中的 epub 文件列表（兼容旧方法名）
   */
  private refreshVaultEpubs(): void {
    this.refreshVaultDocuments();
  }

  /**
   * 确保目录存在
   */
  private async ensureDirectory(path: string): Promise<void> {
    const parts = path.split('/').filter(p => p);
    let currentPath = '';
    
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const folder = this.app.vault.getAbstractFileByPath(currentPath);
      
      if (!folder) {
        await this.app.vault.createFolder(currentPath);
      }
    }
  }

  /**
   * 格式化文件大小
   */
  private formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  async onClose(): Promise<void> {
    // 清理
  }
}
