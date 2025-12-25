import { ItemView, WorkspaceLeaf, TFile, Modal, App } from 'obsidian';
import { NovelCraftSettings, BookSearchResult, LocalBook, ConversionResult, BatchConversionResult } from '../types';
import { SoNovelService } from '../services/SoNovelService';
import { LLMService } from '../services/LLMService';
import { EpubConverterService } from '../services/EpubConverterService';
import { LibraryService } from '../services/LibraryService';
import { showError, showSuccess, showWarning, showInfo } from './NotificationUtils';
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
  private epubConverterService: EpubConverterService | null = null;
  private libraryService: LibraryService | null = null;
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

  /**
   * 设置 EpubConverterService 实例
   * Requirements: 1.1
   */
  setEpubConverterService(service: EpubConverterService): void {
    this.epubConverterService = service;
  }

  /**
   * 设置 LibraryService 实例
   */
  setLibraryService(service: LibraryService): void {
    this.libraryService = service;
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
    
    const headerActions = header.createDiv({ cls: 'nc-header-actions' });
    
    // 批量转换按钮
    // Requirements: 8.1, 8.2
    const batchConvertBtn = headerActions.createEl('button', { text: '批量转换', cls: 'nc-btn nc-btn-small nc-btn-batch' });
    batchConvertBtn.addEventListener('click', () => this.handleBatchConvert());
    
    const refreshBtn = headerActions.createEl('button', { text: '刷新', cls: 'nc-btn nc-btn-small' });
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
   * 下载书籍 - 使用 SSE 获取真实下载进度
   */
  private async downloadBook(book: BookSearchResult, btn: HTMLButtonElement): Promise<void> {
    // 立即捕获书名
    const bookName = String(book.bookName);
    
    btn.disabled = true;
    btn.textContent = '检查中...';

    // SSE 进度监听取消函数
    let cancelSSE: (() => void) | null = null;

    try {
      // 先检查本地是否已有该书
      let existingFilename = '';
      try {
        const localBooks = await this.soNovelService.getLocalBooks();
        const existing = localBooks.find(b => b.filename.includes(bookName));
        if (existing) {
          existingFilename = existing.filename;
        }
      } catch {
        // 忽略检查错误，继续下载流程
      }

      // 如果本地已有，直接导入到 Vault
      if (existingFilename) {
        btn.textContent = '导入中...';
        const arrayBuffer = await this.soNovelService.downloadBook(existingFilename, '');
        const savePath = `${this.settings.downloadPath}/${existingFilename}`;
        
        await this.ensureDirectory(this.settings.downloadPath);
        
        const existingFile = this.app.vault.getAbstractFileByPath(savePath);
        if (existingFile instanceof TFile) {
          await this.app.vault.modifyBinary(existingFile, arrayBuffer);
        } else {
          await this.app.vault.createBinary(savePath, arrayBuffer);
        }
        
        showSuccess(`已导入: ${existingFilename}（本地已有）`);
        btn.textContent = '已下载 ✓';
        return;
      }

      // 本地没有，记录下载前的本地书籍列表
      let beforeBooks: string[] = [];
      try {
        const books = await this.soNovelService.getLocalBooks();
        beforeBooks = books.map(b => b.filename);
      } catch {
        // 忽略
      }

      // 注册 SSE 进度监听
      cancelSSE = this.soNovelService.onAnyDownloadProgress((progress) => {
        if (progress.index !== undefined && progress.total !== undefined) {
          btn.textContent = `${progress.index}/${progress.total}`;
        }
      });

      // 开始下载流程
      btn.textContent = '解析中...';
      await this.soNovelService.fetchBook(book);
      
      btn.textContent = '下载中...';
      
      // 轮询等待下载完成 - 查找新增的文件
      const maxWaitSeconds = 300; // 增加到 5 分钟
      let downloadedFilename = '';
      
      for (let i = 0; i < maxWaitSeconds; i++) {
        // 等待 1 秒
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
          const localBooks = await this.soNovelService.getLocalBooks();
          // 查找新增的包含书名的文件
          const newBook = localBooks.find(b => 
            !beforeBooks.includes(b.filename) && 
            b.filename.includes(bookName)
          );
          
          if (newBook) {
            downloadedFilename = newBook.filename;
            break;
          }
        } catch {
          // 忽略轮询错误
        }
      }
      
      if (!downloadedFilename) {
        throw new Error('下载超时，未找到文件');
      }
      
      // 下载到 vault
      btn.textContent = '保存中...';
      const arrayBuffer = await this.soNovelService.downloadBook(downloadedFilename, '');
      const savePath = `${this.settings.downloadPath}/${downloadedFilename}`;
      
      // 确保目录存在
      await this.ensureDirectory(this.settings.downloadPath);
      
      // 保存文件
      const existingFile = this.app.vault.getAbstractFileByPath(savePath);
      if (existingFile instanceof TFile) {
        await this.app.vault.modifyBinary(existingFile, arrayBuffer);
      } else {
        await this.app.vault.createBinary(savePath, arrayBuffer);
      }
      
      showSuccess(`已下载: ${downloadedFilename}`);
      btn.textContent = '已下载 ✓';
    } catch (error) {
      showError('下载失败', error instanceof Error ? error.message : '未知错误');
      btn.textContent = '下载';
      btn.disabled = false;
    } finally {
      // 取消 SSE 监听
      if (cancelSSE) {
        cancelSSE();
      }
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
        
        // 分析按钮
        const analyzeBtn = actions.createEl('button', { text: '分析', cls: 'nc-btn nc-btn-small nc-btn-primary' });
        analyzeBtn.addEventListener('click', () => {
          this.onAnalyzeBook(file.path);
        });
        
        // 转换按钮（仅 EPUB 文件显示）
        // Requirements: 1.1, 1.5
        if (ext === 'epub') {
          const convertBtn = actions.createEl('button', { text: '转换', cls: 'nc-btn nc-btn-small nc-btn-convert' });
          convertBtn.addEventListener('click', () => this.handleConvertEpub(file, convertBtn));
        }
      }
    }
  }

  /**
   * 处理 EPUB 转换
   * Requirements: 1.1, 1.5
   */
  private async handleConvertEpub(file: TFile, btn: HTMLButtonElement): Promise<void> {
    if (!this.epubConverterService) {
      showWarning('转换服务未初始化');
      return;
    }

    const outputPath = this.settings.epubConversion?.outputPath || 'NovelCraft/books';

    // 检查是否已转换
    // Requirements: 1.5
    const alreadyConverted = await this.epubConverterService.isConverted(file.path, outputPath);
    
    if (alreadyConverted) {
      // 弹出对话框询问覆盖或跳过
      const modal = new ConversionConfirmModal(
        this.app,
        file.basename,
        async (action) => {
          if (action === 'overwrite') {
            await this.performConversion(file, btn, true);
          } else if (action === 'skip') {
            showInfo('已跳过转换');
          }
        }
      );
      modal.open();
    } else {
      await this.performConversion(file, btn, false);
    }
  }

  /**
   * 执行 EPUB 转换
   * Requirements: 1.1
   */
  private async performConversion(file: TFile, btn: HTMLButtonElement, _overwrite: boolean): Promise<void> {
    if (!this.epubConverterService) {
      showWarning('转换服务未初始化');
      return;
    }

    btn.disabled = true;
    btn.textContent = '转换中...';
    btn.addClass('nc-btn-loading');

    try {
      const options = {
        outputPath: this.settings.epubConversion?.outputPath || 'NovelCraft/books',
        mergeToSingleFile: this.settings.epubConversion?.mergeToSingleFile || false,
        preserveHtmlTags: this.settings.epubConversion?.preserveHtmlTags || false,
        includeNavigation: this.settings.epubConversion?.includeNavigation ?? true,
        linkToAnalysis: this.settings.epubConversion?.autoLinkAnalysis ?? true
      };

      const result = await this.epubConverterService.convert(file.path, options);

      if (result.success) {
        showSuccess(`转换完成: ${result.totalChapters} 章, ${this.formatWordCount(result.totalWords)}`);
        btn.textContent = '已转换 ✓';
        btn.removeClass('nc-btn-loading');
        
        // 显示转换结果详情
        this.showConversionResult(result, file.basename);
      } else {
        throw new Error(result.errors.join(', ') || '转换失败');
      }
    } catch (error) {
      showError('转换失败', error instanceof Error ? error.message : '未知错误');
      btn.textContent = '转换';
      btn.disabled = false;
      btn.removeClass('nc-btn-loading');
    }
  }

  /**
   * 显示转换结果
   */
  private showConversionResult(result: ConversionResult, bookName: string): void {
    const modal = new ConversionResultModal(this.app, result, bookName);
    modal.open();
  }

  /**
   * 处理批量转换
   * Requirements: 8.1, 8.2, 8.4
   */
  private async handleBatchConvert(): Promise<void> {
    if (!this.epubConverterService) {
      showWarning('转换服务未初始化');
      return;
    }

    // 获取所有 EPUB 文件
    const epubFiles = this.app.vault.getFiles().filter(f => 
      f.extension.toLowerCase() === 'epub'
    );

    if (epubFiles.length === 0) {
      showInfo('没有找到 EPUB 文件');
      return;
    }

    // 打开批量转换对话框
    const modal = new BatchConversionModal(
      this.app,
      epubFiles,
      this.epubConverterService,
      this.settings
    );
    modal.open();
  }

  /**
   * 格式化字数显示
   */
  private formatWordCount(count: number): string {
    if (count >= 10000) {
      return `${(count / 10000).toFixed(1)} 万字`;
    }
    return `${count} 字`;
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

/**
 * 转换确认对话框
 * Requirements: 1.5
 */
class ConversionConfirmModal extends Modal {
  private bookName: string;
  private onAction: (action: 'overwrite' | 'skip') => void;

  constructor(app: App, bookName: string, onAction: (action: 'overwrite' | 'skip') => void) {
    super(app);
    this.bookName = bookName;
    this.onAction = onAction;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-confirm-modal');

    contentEl.createEl('h3', { text: '书籍已存在' });
    contentEl.createEl('p', { 
      text: `《${this.bookName}》已经转换过了。请选择操作：`,
      cls: 'nc-confirm-message'
    });

    const btnContainer = contentEl.createDiv({ cls: 'nc-confirm-buttons' });
    
    const overwriteBtn = btnContainer.createEl('button', { 
      text: '覆盖', 
      cls: 'nc-btn nc-btn-primary' 
    });
    overwriteBtn.addEventListener('click', () => {
      this.close();
      this.onAction('overwrite');
    });

    const skipBtn = btnContainer.createEl('button', { 
      text: '跳过', 
      cls: 'nc-btn' 
    });
    skipBtn.addEventListener('click', () => {
      this.close();
      this.onAction('skip');
    });

    const cancelBtn = btnContainer.createEl('button', { 
      text: '取消', 
      cls: 'nc-btn' 
    });
    cancelBtn.addEventListener('click', () => {
      this.close();
    });
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * 转换结果对话框
 */
class ConversionResultModal extends Modal {
  private result: ConversionResult;
  private bookName: string;

  constructor(app: App, result: ConversionResult, bookName: string) {
    super(app);
    this.result = result;
    this.bookName = bookName;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-result-modal');

    contentEl.createEl('h3', { text: '✅ 转换完成' });
    
    const infoContainer = contentEl.createDiv({ cls: 'nc-result-info' });
    
    infoContainer.createEl('p', { text: `书籍: ${this.bookName}` });
    infoContainer.createEl('p', { text: `章节数: ${this.result.totalChapters} 章` });
    infoContainer.createEl('p', { text: `总字数: ${this.formatWordCount(this.result.totalWords)}` });
    infoContainer.createEl('p', { text: `保存位置: ${this.result.bookFolder}` });

    if (this.result.errors.length > 0) {
      const errorContainer = contentEl.createDiv({ cls: 'nc-result-errors' });
      errorContainer.createEl('p', { text: '警告:', cls: 'nc-error-title' });
      for (const error of this.result.errors) {
        errorContainer.createEl('p', { text: `• ${error}`, cls: 'nc-error-item' });
      }
    }

    const btnContainer = contentEl.createDiv({ cls: 'nc-result-buttons' });
    
    const openBtn = btnContainer.createEl('button', { 
      text: '打开书籍文件夹', 
      cls: 'nc-btn nc-btn-primary' 
    });
    openBtn.addEventListener('click', async () => {
      // 打开书籍管理文件
      const indexFile = this.app.vault.getAbstractFileByPath(this.result.indexFile);
      if (indexFile instanceof TFile) {
        await this.app.workspace.getLeaf().openFile(indexFile);
      }
      this.close();
    });

    const closeBtn = btnContainer.createEl('button', { 
      text: '关闭', 
      cls: 'nc-btn' 
    });
    closeBtn.addEventListener('click', () => {
      this.close();
    });
  }

  private formatWordCount(count: number): string {
    if (count >= 10000) {
      return `${(count / 10000).toFixed(1)} 万字`;
    }
    return `${count} 字`;
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * 批量转换对话框
 * Requirements: 8.1, 8.2, 8.4
 */
class BatchConversionModal extends Modal {
  private epubFiles: TFile[];
  private converterService: EpubConverterService;
  private settings: NovelCraftSettings;
  private isConverting: boolean = false;
  private progressContainer: HTMLElement | null = null;
  private progressBar: HTMLElement | null = null;
  private progressText: HTMLElement | null = null;
  private currentFileText: HTMLElement | null = null;
  private startBtn: HTMLButtonElement | null = null;
  private closeBtn: HTMLButtonElement | null = null;

  constructor(
    app: App, 
    epubFiles: TFile[], 
    converterService: EpubConverterService,
    settings: NovelCraftSettings
  ) {
    super(app);
    this.epubFiles = epubFiles;
    this.converterService = converterService;
    this.settings = settings;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-batch-modal');

    contentEl.createEl('h3', { text: '📚 批量转换 EPUB' });
    
    // 文件列表信息
    const infoContainer = contentEl.createDiv({ cls: 'nc-batch-info' });
    infoContainer.createEl('p', { 
      text: `找到 ${this.epubFiles.length} 个 EPUB 文件`,
      cls: 'nc-batch-count'
    });

    // 文件列表预览（最多显示 5 个）
    const previewList = infoContainer.createDiv({ cls: 'nc-batch-preview' });
    const displayFiles = this.epubFiles.slice(0, 5);
    for (const file of displayFiles) {
      previewList.createEl('div', { 
        text: `• ${file.basename}`,
        cls: 'nc-batch-preview-item'
      });
    }
    if (this.epubFiles.length > 5) {
      previewList.createEl('div', { 
        text: `... 还有 ${this.epubFiles.length - 5} 个文件`,
        cls: 'nc-batch-preview-more'
      });
    }

    // 进度区域（初始隐藏）
    this.progressContainer = contentEl.createDiv({ cls: 'nc-batch-progress hidden' });
    
    const progressBarContainer = this.progressContainer.createDiv({ cls: 'nc-progress-bar-container' });
    this.progressBar = progressBarContainer.createDiv({ cls: 'nc-progress-bar' });
    this.progressBar.style.width = '0%';
    
    this.progressText = this.progressContainer.createDiv({ cls: 'nc-progress-text' });
    this.progressText.textContent = '0 / 0';
    
    this.currentFileText = this.progressContainer.createDiv({ cls: 'nc-current-file' });
    this.currentFileText.textContent = '';

    // 按钮区域
    const btnContainer = contentEl.createDiv({ cls: 'nc-batch-buttons' });
    
    this.startBtn = btnContainer.createEl('button', { 
      text: '开始转换', 
      cls: 'nc-btn nc-btn-primary' 
    });
    this.startBtn.addEventListener('click', () => this.startBatchConversion());

    this.closeBtn = btnContainer.createEl('button', { 
      text: '取消', 
      cls: 'nc-btn' 
    });
    this.closeBtn.addEventListener('click', () => {
      if (!this.isConverting) {
        this.close();
      }
    });
  }

  /**
   * 开始批量转换
   * Requirements: 8.1, 8.2, 8.3, 8.4
   */
  private async startBatchConversion(): Promise<void> {
    if (this.isConverting) return;
    
    this.isConverting = true;
    
    // 更新 UI 状态
    if (this.startBtn) {
      this.startBtn.disabled = true;
      this.startBtn.textContent = '转换中...';
    }
    if (this.closeBtn) {
      this.closeBtn.disabled = true;
    }
    if (this.progressContainer) {
      this.progressContainer.removeClass('hidden');
    }

    const epubPaths = this.epubFiles.map(f => f.path);
    const options = {
      outputPath: this.settings.epubConversion?.outputPath || 'NovelCraft/books',
      mergeToSingleFile: this.settings.epubConversion?.mergeToSingleFile || false,
      preserveHtmlTags: this.settings.epubConversion?.preserveHtmlTags || false,
      includeNavigation: this.settings.epubConversion?.includeNavigation ?? true,
      linkToAnalysis: this.settings.epubConversion?.autoLinkAnalysis ?? true
    };

    try {
      // 执行批量转换，带进度回调
      // Requirements: 8.2
      const result = await this.converterService.convertBatch(
        epubPaths,
        options,
        (current, total, filename) => {
          this.updateProgress(current, total, filename);
        }
      );

      // 显示结果
      // Requirements: 8.4
      this.showBatchResult(result);
    } catch (error) {
      showError('批量转换失败', error instanceof Error ? error.message : '未知错误');
      this.resetUI();
    }
  }

  /**
   * 更新进度显示
   * Requirements: 8.2
   */
  private updateProgress(current: number, total: number, filename: string): void {
    const percent = Math.round((current / total) * 100);
    
    if (this.progressBar) {
      this.progressBar.style.width = `${percent}%`;
    }
    if (this.progressText) {
      this.progressText.textContent = `${current} / ${total} (${percent}%)`;
    }
    if (this.currentFileText) {
      this.currentFileText.textContent = `正在处理: ${filename}`;
    }
  }

  /**
   * 显示批量转换结果
   * Requirements: 8.4
   */
  private showBatchResult(result: BatchConversionResult): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('nc-batch-result');

    contentEl.createEl('h3', { text: '✅ 批量转换完成' });

    // 结果摘要
    const summaryContainer = contentEl.createDiv({ cls: 'nc-batch-summary' });
    
    const successItem = summaryContainer.createDiv({ cls: 'nc-summary-item nc-summary-success' });
    successItem.createEl('span', { text: '成功', cls: 'nc-summary-label' });
    successItem.createEl('span', { text: `${result.successCount}`, cls: 'nc-summary-value' });

    const failedItem = summaryContainer.createDiv({ cls: 'nc-summary-item nc-summary-failed' });
    failedItem.createEl('span', { text: '失败', cls: 'nc-summary-label' });
    failedItem.createEl('span', { text: `${result.failedCount}`, cls: 'nc-summary-value' });

    const skippedItem = summaryContainer.createDiv({ cls: 'nc-summary-item nc-summary-skipped' });
    skippedItem.createEl('span', { text: '跳过', cls: 'nc-summary-label' });
    skippedItem.createEl('span', { text: `${result.skippedCount}`, cls: 'nc-summary-value' });

    // 详细结果列表（如果有失败或跳过的）
    if (result.failedCount > 0 || result.skippedCount > 0) {
      const detailsContainer = contentEl.createDiv({ cls: 'nc-batch-details' });
      
      // 失败的文件
      const failedResults = result.results.filter(r => r.error || (r.result && !r.result.success));
      if (failedResults.length > 0) {
        detailsContainer.createEl('h4', { text: '❌ 失败的文件' });
        const failedList = detailsContainer.createDiv({ cls: 'nc-detail-list' });
        for (const item of failedResults) {
          const filename = item.epubPath.split('/').pop() || item.epubPath;
          const errorMsg = item.error || (item.result?.errors.join(', ') || '未知错误');
          failedList.createEl('div', { 
            text: `• ${filename}: ${errorMsg}`,
            cls: 'nc-detail-item nc-detail-failed'
          });
        }
      }

      // 跳过的文件
      const skippedResults = result.results.filter(r => r.skipped);
      if (skippedResults.length > 0) {
        detailsContainer.createEl('h4', { text: '⏭️ 跳过的文件（已存在）' });
        const skippedList = detailsContainer.createDiv({ cls: 'nc-detail-list' });
        for (const item of skippedResults) {
          const filename = item.epubPath.split('/').pop() || item.epubPath;
          skippedList.createEl('div', { 
            text: `• ${filename}`,
            cls: 'nc-detail-item nc-detail-skipped'
          });
        }
      }
    }

    // 关闭按钮
    const btnContainer = contentEl.createDiv({ cls: 'nc-batch-buttons' });
    const closeBtn = btnContainer.createEl('button', { 
      text: '关闭', 
      cls: 'nc-btn nc-btn-primary' 
    });
    closeBtn.addEventListener('click', () => this.close());

    this.isConverting = false;
  }

  /**
   * 重置 UI 状态
   */
  private resetUI(): void {
    this.isConverting = false;
    if (this.startBtn) {
      this.startBtn.disabled = false;
      this.startBtn.textContent = '开始转换';
    }
    if (this.closeBtn) {
      this.closeBtn.disabled = false;
    }
  }

  onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}