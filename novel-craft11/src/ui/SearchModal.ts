import { App, Modal, Notice } from 'obsidian';
import { SoNovelService } from '../services/SoNovelService';
import { BookSearchResult, NovelCraftSettings } from '../types';
import { showWarning } from './NotificationUtils';

/**
 * SearchModal - 小说搜索弹窗组件
 * 提供带防抖的搜索输入框、搜索结果展示和下载功能
 */
export class SearchModal extends Modal {
  private settings: NovelCraftSettings;
  private soNovelService: SoNovelService;
  private searchInput: HTMLInputElement;
  private resultsContainer: HTMLElement;
  private statusContainer: HTMLElement;
  private searchTimeout: ReturnType<typeof setTimeout> | null = null;
  private isSearching = false;
  private currentDownload: string | null = null;
  private onBookDownloaded?: (filePath: string) => void;

  constructor(
    app: App,
    settings: NovelCraftSettings,
    onBookDownloaded?: (filePath: string) => void
  ) {
    super(app);
    this.settings = settings;
    this.soNovelService = new SoNovelService(settings.sonovelUrl);
    this.onBookDownloaded = onBookDownloaded;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('novel-craft-search-modal');

    // Title
    contentEl.createEl('h2', { text: '🔍 搜索小说' });

    // Search input with debounce
    const searchContainer = contentEl.createDiv({ cls: 'novel-craft-search-container' });
    this.searchInput = searchContainer.createEl('input', {
      type: 'text',
      placeholder: '输入书名或作者名...',
      cls: 'novel-craft-search-input'
    });

    // Search button
    const searchButton = searchContainer.createEl('button', {
      text: '搜索',
      cls: 'novel-craft-search-button'
    });

    // Status container for errors and loading
    this.statusContainer = contentEl.createDiv({ cls: 'novel-craft-status-container' });

    // Results container
    this.resultsContainer = contentEl.createDiv({ cls: 'novel-craft-search-results' });

    // Event listeners
    this.searchInput.addEventListener('input', () => this.handleSearchInput());
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        this.performSearch();
      }
    });
    searchButton.addEventListener('click', () => this.performSearch());

    // Focus input
    this.searchInput.focus();

    // Check service health on open
    this.checkServiceHealth();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    
    // Clear any pending search timeout
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    // Cleanup service
    this.soNovelService.destroy();
  }

  /**
   * 检查 SoNovel 服务状态
   */
  private async checkServiceHealth(): Promise<void> {
    const isHealthy = await this.soNovelService.checkHealth();
    if (!isHealthy) {
      this.showError(
        'SoNovel 服务不可用',
        `无法连接到 ${this.settings.sonovelUrl}，请检查服务是否已启动。`,
        true
      );
      showWarning('SoNovel 服务不可用，请检查服务状态');
    }
  }

  /**
   * 处理搜索输入（带防抖）
   */
  private handleSearchInput(): void {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
    }

    const keyword = this.searchInput.value.trim();
    if (!keyword) {
      this.resultsContainer.empty();
      this.clearStatus();
      return;
    }

    // 300ms debounce
    this.searchTimeout = setTimeout(() => {
      this.performSearch();
    }, 300);
  }

  /**
   * 执行搜索
   */
  private async performSearch(): Promise<void> {
    if (this.searchTimeout) {
      clearTimeout(this.searchTimeout);
      this.searchTimeout = null;
    }

    const keyword = this.searchInput.value.trim();
    if (!keyword) {
      return;
    }

    if (this.isSearching) {
      return;
    }

    this.isSearching = true;
    this.showLoading('正在搜索...');
    this.resultsContainer.empty();

    try {
      const results = await this.soNovelService.search(keyword);
      this.clearStatus();
      this.displayResults(results);
    } catch (error) {
      this.showError(
        '搜索失败',
        error instanceof Error ? error.message : '未知错误',
        true
      );
    } finally {
      this.isSearching = false;
    }
  }


  /**
   * 显示搜索结果
   */
  private displayResults(results: BookSearchResult[]): void {
    this.resultsContainer.empty();

    if (results.length === 0) {
      this.resultsContainer.createDiv({
        cls: 'novel-craft-no-results',
        text: '未找到相关书籍'
      });
      return;
    }

    results.forEach((book) => {
      const bookItem = this.resultsContainer.createDiv({ cls: 'novel-craft-book-item' });

      // Book info
      const infoContainer = bookItem.createDiv({ cls: 'novel-craft-book-info' });
      
      // Title and author
      const titleEl = infoContainer.createDiv({ cls: 'novel-craft-book-title' });
      titleEl.createSpan({ text: `📖 ${book.bookName}` });
      if (book.author) {
        titleEl.createSpan({ text: ` - ${book.author}`, cls: 'novel-craft-book-author' });
      }

      // Meta info
      const metaEl = infoContainer.createDiv({ cls: 'novel-craft-book-meta' });
      if (book.latestChapter) {
        metaEl.createSpan({ text: `最新: ${book.latestChapter}` });
      }
      if (book.sourceId) {
        metaEl.createSpan({ text: ` | 书源: ${book.sourceId}` });
      }
      if (book.lastUpdateTime) {
        metaEl.createSpan({ text: ` | ${book.lastUpdateTime}` });
      }

      // Download button
      const buttonContainer = bookItem.createDiv({ cls: 'novel-craft-book-actions' });
      const downloadBtn = buttonContainer.createEl('button', {
        text: '下载',
        cls: 'novel-craft-download-button'
      });

      downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.downloadBook(book, downloadBtn);
      });
    });
  }

  /**
   * 下载书籍 - 使用 SSE 获取真实下载进度
   */
  private async downloadBook(book: BookSearchResult, button: HTMLButtonElement): Promise<void> {
    if (this.currentDownload) {
      new Notice('已有下载任务进行中，请稍候');
      return;
    }

    // 立即捕获书名
    const currentBookName = String(book.bookName);
    const originalButtonText = button.textContent || '下载';
    
    // 创建一个更新按钮的辅助函数
    const updateButton = (text: string) => {
      button.textContent = text;
    };

    // 设置下载状态
    updateButton('检查中...');
    button.disabled = true;
    button.addClass('nc-downloading');
    this.currentDownload = currentBookName;

    // 创建进度弹窗
    const progressModal = new DownloadProgressModal(this.app, currentBookName);
    progressModal.open();

    // SSE 进度监听取消函数
    let cancelSSE: (() => void) | null = null;

    try {
      // 先检查本地是否已有该书
      progressModal.updateProgress(5, '检查本地书库...');
      let existingFilename = '';
      try {
        const localBooks = await this.soNovelService.getLocalBooks();
        const existing = localBooks.find(b => b.filename.includes(currentBookName));
        if (existing) {
          existingFilename = existing.filename;
        }
      } catch {
        // 忽略检查错误，继续下载流程
      }

      // 如果本地已有，直接导入到 Vault
      if (existingFilename) {
        progressModal.updateProgress(50, '本地已有，正在导入...');
        updateButton('导入中...');
        
        const fileData = await this.soNovelService.downloadBook(existingFilename, this.settings.downloadPath);
        const savePath = `${this.settings.downloadPath}/${existingFilename}`;
        await this.saveToVault(savePath, fileData);

        progressModal.updateProgress(100, '导入完成！');
        updateButton('已下载 ✓');
        new Notice(`✅ 《${currentBookName}》已从本地导入`);

        if (this.onBookDownloaded) {
          this.onBookDownloaded(savePath);
        }

        setTimeout(() => progressModal.close(), 1500);
        return;
      }

      // 本地没有，记录当前列表用于后续比对
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
          const percent = Math.round((progress.index / progress.total) * 100);
          progressModal.updateProgress(15 + percent * 0.55, `下载中 ${progress.index}/${progress.total} 章`);
          updateButton(`${progress.index}/${progress.total}`);
        }
      });

      // Step 1: 请求 SoNovel 服务器获取书籍
      progressModal.updateProgress(10, '正在解析目录...');
      updateButton('解析中...');
      await this.soNovelService.fetchBook(book);

      // Step 2: 轮询等待下载完成，查找包含书名的新文件
      progressModal.updateProgress(15, '服务器正在下载...');
      updateButton('下载中...');
      
      const maxWaitSeconds = 300; // 增加到 5 分钟，因为有真实进度了
      let downloadedFilename = '';
      
      for (let second = 1; second <= maxWaitSeconds; second++) {
        // 等待 1 秒
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
          const localBooks = await this.soNovelService.getLocalBooks();
          // 查找包含书名的新文件
          const newBook = localBooks.find(b => 
            !beforeBooks.includes(b.filename) && 
            b.filename.includes(currentBookName)
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

      // Step 3: 从服务器下载文件到 Vault
      progressModal.updateProgress(75, '正在保存到 Vault...');
      updateButton('保存中...');
      
      const fileData = await this.soNovelService.downloadBook(downloadedFilename, this.settings.downloadPath);
      const savePath = `${this.settings.downloadPath}/${downloadedFilename}`;
      await this.saveToVault(savePath, fileData);

      // 下载成功
      progressModal.updateProgress(100, '下载完成！');
      updateButton('已下载 ✓');
      
      new Notice(`✅ 《${currentBookName}》下载完成`);

      // 回调
      if (this.onBookDownloaded) {
        this.onBookDownloaded(savePath);
      }

      setTimeout(() => progressModal.close(), 1500);

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      progressModal.showError(errorMsg);
      updateButton('下载失败');
      new Notice(`❌ 《${currentBookName}》下载失败: ${errorMsg}`);
    } finally {
      // 取消 SSE 监听
      if (cancelSSE) {
        cancelSSE();
      }
      setTimeout(() => {
        updateButton(originalButtonText);
        button.disabled = false;
        button.removeClass('nc-downloading');
      }, 2500);
      this.currentDownload = null;
    }
  }

  /**
   * 保存文件到 Vault
   */
  private async saveToVault(path: string, data: ArrayBuffer): Promise<void> {
    // Ensure directory exists
    const dirPath = path.substring(0, path.lastIndexOf('/'));
    const existingFolder = this.app.vault.getAbstractFileByPath(dirPath);
    if (!existingFolder) {
      await this.app.vault.createFolder(dirPath);
    }

    // Check if file already exists
    const existingFile = this.app.vault.getAbstractFileByPath(path);
    if (existingFile) {
      // File exists, could prompt user or overwrite
      await this.app.vault.modifyBinary(existingFile as any, data);
    } else {
      await this.app.vault.createBinary(path, data);
    }
  }

  /**
   * 显示加载状态
   */
  private showLoading(message: string): void {
    this.statusContainer.empty();
    this.statusContainer.addClass('novel-craft-loading');
    this.statusContainer.createDiv({
      cls: 'novel-craft-loading-message',
      text: `⏳ ${message}`
    });
  }

  /**
   * 显示错误信息
   */
  private showError(title: string, message: string, showRetry = false): void {
    this.statusContainer.empty();
    this.statusContainer.removeClass('novel-craft-loading');
    this.statusContainer.addClass('novel-craft-error');

    const errorContainer = this.statusContainer.createDiv({ cls: 'novel-craft-error-container' });
    errorContainer.createDiv({ cls: 'novel-craft-error-title', text: `❌ ${title}` });
    errorContainer.createDiv({ cls: 'novel-craft-error-message', text: message });

    if (showRetry) {
      const retryBtn = errorContainer.createEl('button', {
        text: '重试',
        cls: 'novel-craft-retry-button'
      });
      retryBtn.addEventListener('click', () => {
        this.clearStatus();
        this.performSearch();
      });
    }
  }

  /**
   * 清除状态显示
   */
  private clearStatus(): void {
    this.statusContainer.empty();
    this.statusContainer.removeClass('novel-craft-loading', 'novel-craft-error');
  }
}


/**
 * DownloadProgressModal - 下载进度弹窗
 */
class DownloadProgressModal extends Modal {
  private bookName: string;
  private progressBar: HTMLElement;
  private progressFill: HTMLElement;
  private progressText: HTMLElement;
  private errorContainer: HTMLElement;

  constructor(app: App, bookName: string) {
    super(app);
    this.bookName = bookName;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('novel-craft-progress-modal');

    // Title
    contentEl.createEl('h3', { text: `正在下载《${this.bookName}》` });

    // Progress bar
    this.progressBar = contentEl.createDiv({ cls: 'novel-craft-progress-bar' });
    this.progressFill = this.progressBar.createDiv({ cls: 'novel-craft-progress-fill' });
    this.progressFill.style.width = '0%';

    // Progress text
    this.progressText = contentEl.createDiv({
      cls: 'novel-craft-progress-text',
      text: '准备中...'
    });

    // Error container (hidden by default)
    this.errorContainer = contentEl.createDiv({ cls: 'novel-craft-progress-error' });
    this.errorContainer.style.display = 'none';
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * 更新进度
   */
  updateProgress(percent: number, message: string): void {
    this.progressFill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
    this.progressText.textContent = message;
  }

  /**
   * 显示错误
   */
  showError(message: string): void {
    this.errorContainer.style.display = 'block';
    this.errorContainer.empty();
    this.errorContainer.createDiv({
      cls: 'novel-craft-error-title',
      text: '❌ 下载失败'
    });
    this.errorContainer.createDiv({
      cls: 'novel-craft-error-message',
      text: message
    });

    // Add close button
    const closeBtn = this.errorContainer.createEl('button', {
      text: '关闭',
      cls: 'novel-craft-close-button'
    });
    closeBtn.addEventListener('click', () => this.close());
  }
}
