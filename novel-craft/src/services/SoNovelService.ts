import { BookSearchResult, LocalBook, DownloadProgress } from '../types';

/**
 * SoNovelService - 与 SoNovel API 交互的服务类
 * 提供小说搜索、下载和进度追踪功能
 */
export class SoNovelService {
  private baseUrl: string;
  private progressCallbacks: Map<string, (progress: DownloadProgress) => void> = new Map();
  private eventSource: EventSource | null = null;

  constructor(baseUrl: string = 'http://localhost:7765') {
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Remove trailing slash
  }

  /**
   * 更新服务基础 URL
   */
  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/$/, '');
  }

  /**
   * 搜索书籍
   * @param keyword 搜索关键词（书名或作者名）
   * @returns 搜索结果列表
   */
  async search(keyword: string): Promise<BookSearchResult[]> {
    if (!keyword || keyword.trim() === '') {
      return [];
    }

    const response = await fetch(
      `${this.baseUrl}/search/aggregated?kw=${encodeURIComponent(keyword.trim())}`
    );

    if (!response.ok) {
      throw new Error(`搜索失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return this.normalizeSearchResults(data);
  }

  /**
   * 标准化搜索结果，确保所有必需字段存在
   */
  private normalizeSearchResults(data: unknown): BookSearchResult[] {
    // API 返回格式是 { data: [...] }
    let results: unknown[] = [];
    if (data && typeof data === 'object' && 'data' in data && Array.isArray((data as { data: unknown }).data)) {
      results = (data as { data: unknown[] }).data;
    } else if (Array.isArray(data)) {
      results = data;
    }

    return results
      .filter((item): item is Record<string, unknown> => 
        item !== null && typeof item === 'object'
      )
      .map((item) => ({
        bookName: String(item.bookName || item.name || ''),
        author: String(item.author || ''),
        latestChapter: String(item.latestChapter || item.latest_chapter || ''),
        lastUpdateTime: String(item.lastUpdateTime || item.last_update_time || ''),
        sourceId: String(item.sourceId || item.source_id || ''),
        url: String(item.url || '')
      }))
      .filter((result) => result.bookName && result.url);
  }


  /**
   * 获取书籍到服务器（触发 SoNovel 下载）
   * @param book 要下载的书籍信息
   */
  async fetchBook(book: BookSearchResult): Promise<void> {
    // Web UI 使用 GET 请求和查询参数
    const params = new URLSearchParams({
      bookName: book.bookName,
      author: book.author,
      latestChapter: book.latestChapter,
      lastUpdateTime: book.lastUpdateTime,
      sourceId: book.sourceId,
      url: book.url
    });
    
    const response = await fetch(`${this.baseUrl}/book-fetch?${params.toString()}`);

    if (!response.ok) {
      throw new Error(`获取书籍失败: ${response.status} ${response.statusText}`);
    }
  }

  /**
   * 获取已下载的本地书籍列表
   * @returns 本地书籍列表
   */
  async getLocalBooks(): Promise<LocalBook[]> {
    const response = await fetch(`${this.baseUrl}/local-books`);

    if (!response.ok) {
      throw new Error(`获取本地书籍列表失败: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    return this.normalizeLocalBooks(data);
  }

  /**
   * 标准化本地书籍数据
   */
  private normalizeLocalBooks(data: unknown): LocalBook[] {
    // API 返回格式是 { data: [...] }
    let results: unknown[] = [];
    if (data && typeof data === 'object' && 'data' in data && Array.isArray((data as { data: unknown }).data)) {
      results = (data as { data: unknown[] }).data;
    } else if (Array.isArray(data)) {
      results = data;
    }

    return results
      .filter((item): item is Record<string, unknown> =>
        item !== null && typeof item === 'object'
      )
      .map((item) => ({
        filename: String(item.filename || item.name || ''),
        path: String(item.path || ''),
        size: Number(item.size) || 0,
        downloadedAt: String(item.downloadedAt || item.downloaded_at || item.timestamp || '')
      }))
      .filter((book) => book.filename);
  }

  /**
   * 下载书籍文件到本地
   * @param filename 文件名
   * @param savePath 保存路径
   * @returns 保存后的完整路径
   */
  async downloadBook(filename: string, savePath: string): Promise<ArrayBuffer> {
    const response = await fetch(
      `${this.baseUrl}/book-download?filename=${encodeURIComponent(filename)}`
    );

    if (!response.ok) {
      throw new Error(`下载书籍失败: ${response.status} ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }

  /**
   * 检查 SoNovel 服务状态
   * 通过请求根路径来确认服务可用性
   * @returns 服务是否可用
   */
  async checkHealth(): Promise<boolean> {
    try {
      // 直接请求根路径，只要能收到响应就说明服务可用
      const response = await fetch(`${this.baseUrl}/`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      // 任何 HTTP 响应都说明服务可达（包括 404）
      return true;
    } catch {
      // 网络错误、超时、CORS 错误等
      return false;
    }
  }


  /**
   * 注册下载进度回调
   * @param filename 文件名
   * @param callback 进度回调函数
   */
  onDownloadProgress(filename: string, callback: (progress: DownloadProgress) => void): void {
    this.progressCallbacks.set(filename, callback);
    this.ensureProgressConnection();
  }

  /**
   * 移除下载进度回调
   * @param filename 文件名
   */
  removeProgressCallback(filename: string): void {
    this.progressCallbacks.delete(filename);
    if (this.progressCallbacks.size === 0) {
      this.closeProgressConnection();
    }
  }

  /**
   * 确保 SSE 连接已建立
   */
  private ensureProgressConnection(): void {
    if (this.eventSource) {
      return;
    }

    this.eventSource = new EventSource(`${this.baseUrl}/download-progress`);

    this.eventSource.onmessage = (event) => {
      try {
        const progress = this.parseProgressEvent(event.data);
        if (progress && this.progressCallbacks.has(progress.filename)) {
          const callback = this.progressCallbacks.get(progress.filename);
          callback?.(progress);

          // Auto-remove callback when download completes or fails
          if (progress.status === 'completed' || progress.status === 'failed') {
            this.progressCallbacks.delete(progress.filename);
          }
        }
      } catch {
        // Ignore parse errors
      }
    };

    this.eventSource.onerror = () => {
      this.closeProgressConnection();
    };
  }

  /**
   * 解析进度事件数据
   */
  private parseProgressEvent(data: string): DownloadProgress | null {
    try {
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      return {
        filename: String(parsed.filename || ''),
        progress: Number(parsed.progress) || 0,
        status: this.normalizeStatus(parsed.status),
        message: parsed.message ? String(parsed.message) : undefined
      };
    } catch {
      return null;
    }
  }

  /**
   * 标准化状态值
   */
  private normalizeStatus(status: unknown): DownloadProgress['status'] {
    if (status === 'completed' || status === 'failed' || status === 'downloading') {
      return status;
    }
    return 'downloading';
  }

  /**
   * 关闭 SSE 连接
   */
  private closeProgressConnection(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.closeProgressConnection();
    this.progressCallbacks.clear();
  }
}
