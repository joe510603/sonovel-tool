import { App, Modal, Notice, Setting } from 'obsidian';
import { SoNovelService } from '../services/SoNovelService';
import { BookSearchResult, DownloadProgress, NovelCraftSettings } from '../types';
import { showSuccess, showError, showWarning, handleError, createLoadingIndicator } from './NotificationUtils';

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
   * 下载书籍
   */
  private async downloadBook(book: BookSearchResult, button: HTMLButtonElement): Promise<void> {
    if (this.currentDownload) {
      new Notice('已有下载任务进行中，请稍候');
      return;
    }

    const originalText = button.textContent;
    button.textContent = '准备中...';
    button.disabled = true;
    this.currentDownload = book.bookName;

    // Show progress modal
    const progressModal = new DownloadProgressModal(this.app, book.bookName);
    progressModal.open();

    try {
      // Step 1: Fetch book to SoNovel server
      progressModal.updateProgress(0, '正在获取书籍信息...');
      await this.soNovelService.fetchBook(book);

      // Step 2: Get local books to find the downloaded file
      progressModal.updateProgress(30, '正在下载书籍...');
      
      // Register progress callback
      const filename = `${book.bookName}.epub`;
      this.soNovelService.onDownloadProgress(filename, (progress) => {
        progressModal.updateProgress(
          30 + progress.progress * 0.5,
          progress.message || `下载中: ${Math.round(progress.progress * 100)}%`
        );

        if (progress.status === 'failed') {
          throw new Error(progress.message || '下载失败');
        }
      });

      // Wait a bit for download to complete
      await this.waitForDownload(filename, progressModal);

      // Step 3: Download file to vault
      progressModal.updateProgress(80, '正在保存到 Vault...');
      const fileData = await this.soNovelService.downloadBook(filename, this.settings.downloadPath);

      // Save to vault
      const savePath = `${this.settings.downloadPath}/${filename}`;
      await this.saveToVault(savePath, fileData);

      progressModal.updateProgress(100, '下载完成！');
      showSuccess(`《${book.bookName}》下载完成`);

      // Callback
      if (this.onBookDownloaded) {
        this.onBookDownloaded(savePath);
      }

      // Close progress modal after a short delay
      setTimeout(() => {
        progressModal.close();
      }, 1000);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      progressModal.showError(errorMessage);
      showError('下载失败', errorMessage);
    } finally {
      button.textContent = originalText;
      button.disabled = false;
      this.currentDownload = null;
      this.soNovelService.removeProgressCallback(`${book.bookName}.epub`);
    }
  }

  /**
   * 等待下载完成
   */
  private async waitForDownload(
    filename: string,
    progressModal: DownloadProgressModal
  ): Promise<void> {
    // Poll for local books to check if download is complete
    const maxAttempts = 60; // 60 seconds timeout
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const localBooks = await this.soNovelService.getLocalBooks();
        const found = localBooks.find((b) => b.filename === filename);
        if (found) {
          return;
        }
      } catch {
        // Ignore errors during polling
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
      progressModal.updateProgress(30 + (i / maxAttempts) * 50, `下载中... (${i + 1}s)`);
    }
    throw new Error('下载超时，请重试');
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
