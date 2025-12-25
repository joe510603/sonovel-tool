import { requestUrl } from 'obsidian';
import { BookSearchResult, LocalBook, DownloadProgress } from '../types';

/**
 * SoNovelService - 与 SoNovel API 交互的服务类
 * 提供小说搜索、下载和进度追踪功能
 * 使用 Obsidian 的 requestUrl API 绑过 CORS 限制
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

    const url = `${this.baseUrl}/search/aggregated?kw=${encodeURIComponent(keyword.trim())}`;
    
    try {
      const response = await requestUrl({ url, method: 'GET' });
      return this.normalizeSearchResults(response.json);
    } catch (error) {
      // 如果 requestUrl 失败，尝试使用 fetch 作为后备
      console.warn('requestUrl failed, trying fetch:', error);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`搜索失败: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      return this.normalizeSearchResults(data);
    }
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
    
    const url = `${this.baseUrl}/book-fetch?${params.toString()}`;
    
    try {
      const response = await requestUrl({ url, method: 'GET', throw: false });
      // 500 错误通常是书源问题，不一定是致命错误
      if (response.status >= 500) {
        console.warn(`SoNovel 服务器错误 ${response.status}，可能是书源问题，继续尝试...`);
      }
    } catch (error) {
      // 如果 requestUrl 失败，尝试使用 fetch 作为后备
      console.warn('requestUrl failed, trying fetch:', error);
      try {
        const response = await fetch(url);
        if (response.status >= 500) {
          console.warn(`SoNovel 服务器错误 ${response.status}，可能是书源问题`);
        }
      } catch (fetchError) {
        throw new Error(`无法连接到 SoNovel 服务器`);
      }
    }
  }

  /**
   * 获取已下载的本地书籍列表
   * @returns 本地书籍列表
   */
  async getLocalBooks(): Promise<LocalBook[]> {
    const url = `${this.baseUrl}/local-books`;
    
    try {
      const response = await requestUrl({ url, method: 'GET' });
      return this.normalizeLocalBooks(response.json);
    } catch (error) {
      // 如果 requestUrl 失败，尝试使用 fetch 作为后备
      console.warn('requestUrl failed, trying fetch:', error);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`获取本地书籍列表失败: ${response.status} ${response.statusText}`);
      }
      const data = await response.json();
      return this.normalizeLocalBooks(data);
    }
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
    const url = `${this.baseUrl}/book-download?filename=${encodeURIComponent(filename)}`;
    
    try {
      const response = await requestUrl({ url, method: 'GET' });
      return response.arrayBuffer;
    } catch (error) {
      // 如果 requestUrl 失败，尝试使用 fetch 作为后备
      console.warn('requestUrl failed, trying fetch:', error);
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`下载书籍失败: ${response.status} ${response.statusText}`);
      }
      return await response.arrayBuffer();
    }
  }

  /**
   * 检查 SoNovel 服务状态
   * 通过请求根路径来确认服务可用性
   * @returns 服务是否可用
   */
  async checkHealth(): Promise<boolean> {
    try {
      // 使用 requestUrl 检查服务状态
      await requestUrl({ 
        url: `${this.baseUrl}/`,
        method: 'GET',
        throw: false
      });
      return true;
    } catch {
      // 网络错误、超时等
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
   * 注册全局下载进度回调（用于监听任何下载进度）
   * @param callback 进度回调函数
   * @returns 取消监听的函数
   */
  onAnyDownloadProgress(callback: (progress: DownloadProgress) => void): () => void {
    const key = `__global_${Date.now()}`;
    this.progressCallbacks.set(key, callback);
    this.ensureProgressConnection();
    return () => {
      this.progressCallbacks.delete(key);
      if (this.progressCallbacks.size === 0) {
        this.closeProgressConnection();
      }
    };
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
        if (progress) {
          // 通知所有回调（包括全局回调）
          for (const [key, callback] of this.progressCallbacks) {
            // 全局回调或匹配文件名的回调
            if (key.startsWith('__global_') || key === progress.filename) {
              callback(progress);
            }
          }

          // Auto-remove callback when download completes or fails (非全局回调)
          if (progress.status === 'completed' || progress.status === 'failed') {
            if (progress.filename && this.progressCallbacks.has(progress.filename)) {
              this.progressCallbacks.delete(progress.filename);
            }
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
   * SoNovel SSE 格式: { type: "download-progress", index: 当前章节, total: 总章节数 }
   */
  private parseProgressEvent(data: string): DownloadProgress | null {
    try {
      const parsed = JSON.parse(data);
      if (!parsed || typeof parsed !== 'object') {
        return null;
      }

      // SoNovel 格式: { type: "download-progress", index: N, total: M }
      if (parsed.type === 'download-progress') {
        const index = Number(parsed.index) || 0;
        const total = Number(parsed.total) || 1;
        const progress = Math.round((index / total) * 100);
        
        return {
          filename: '', // SSE 不包含文件名，需要调用方自行关联
          progress,
          status: index >= total ? 'completed' : 'downloading',
          message: `${index} / ${total} 章`,
          index,
          total
        };
      }

      // 兼容旧格式
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
