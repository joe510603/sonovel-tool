/**
 * 性能优化工具函数
 * 提供防抖、节流、虚拟列表、缓存等性能优化功能
 */

/**
 * 防抖函数
 * @param func 要防抖的函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的函数
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * 节流函数
 * @param func 要节流的函数
 * @param delay 节流间隔（毫秒）
 * @returns 节流后的函数
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      func(...args);
    }
  };
}

/**
 * 异步防抖函数
 * @param func 要防抖的异步函数
 * @param delay 延迟时间（毫秒）
 * @returns 防抖后的异步函数
 */
export function debounceAsync<T extends (...args: any[]) => Promise<any>>(
  func: T,
  delay: number
): (...args: Parameters<T>) => Promise<ReturnType<T>> {
  let timeoutId: NodeJS.Timeout;
  let latestResolve: (value: ReturnType<T>) => void;
  let latestReject: (reason: any) => void;
  
  return (...args: Parameters<T>): Promise<ReturnType<T>> => {
    return new Promise((resolve, reject) => {
      latestResolve = resolve;
      latestReject = reject;
      
      clearTimeout(timeoutId);
      timeoutId = setTimeout(async () => {
        try {
          const result = await func(...args);
          latestResolve(result);
        } catch (error) {
          latestReject(error);
        }
      }, delay);
    });
  };
}

/**
 * LRU缓存实现
 */
export class LRUCache<K, V> {
  private cache = new Map<K, V>();
  private maxSize: number;

  constructor(maxSize: number = 100) {
    this.maxSize = maxSize;
  }

  /**
   * 获取缓存值
   * @param key 缓存键
   * @returns 缓存值或undefined
   */
  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // 重新设置以更新访问顺序
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value;
  }

  /**
   * 设置缓存值
   * @param key 缓存键
   * @param value 缓存值
   */
  set(key: K, value: V): void {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // 删除最久未使用的项（Map的第一个项）
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  /**
   * 删除缓存项
   * @param key 缓存键
   * @returns 是否删除成功
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   * @returns 缓存项数量
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * 检查是否包含指定键
   * @param key 缓存键
   * @returns 是否包含
   */
  has(key: K): boolean {
    return this.cache.has(key);
  }

  /**
   * 获取所有键
   * @returns 键的数组
   */
  keys(): K[] {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取所有值
   * @returns 值的数组
   */
  values(): V[] {
    return Array.from(this.cache.values());
  }
}

/**
 * 虚拟列表项接口
 */
export interface VirtualListItem {
  id: string | number;
  height?: number;
}

/**
 * 虚拟列表配置
 */
export interface VirtualListConfig {
  /** 容器高度 */
  containerHeight: number;
  /** 默认项高度 */
  itemHeight: number;
  /** 缓冲区大小（在可视区域外渲染的项数） */
  bufferSize?: number;
  /** 是否启用动态高度 */
  dynamicHeight?: boolean;
}

/**
 * 虚拟列表渲染结果
 */
export interface VirtualListRenderResult {
  /** 可视区域内的项 */
  visibleItems: VirtualListItem[];
  /** 开始索引 */
  startIndex: number;
  /** 结束索引 */
  endIndex: number;
  /** 总高度 */
  totalHeight: number;
  /** 偏移量 */
  offsetY: number;
}

/**
 * 虚拟列表管理器
 */
export class VirtualListManager<T extends VirtualListItem> {
  private config: VirtualListConfig;
  private items: T[] = [];
  private itemHeights = new Map<string | number, number>();
  private scrollTop = 0;

  constructor(config: VirtualListConfig) {
    this.config = config;
  }

  /**
   * 设置数据项
   * @param items 数据项列表
   */
  setItems(items: T[]): void {
    this.items = items;
  }

  /**
   * 更新滚动位置
   * @param scrollTop 滚动位置
   */
  updateScrollTop(scrollTop: number): void {
    this.scrollTop = scrollTop;
  }

  /**
   * 设置项高度（用于动态高度）
   * @param itemId 项ID
   * @param height 高度
   */
  setItemHeight(itemId: string | number, height: number): void {
    this.itemHeights.set(itemId, height);
  }

  /**
   * 获取项高度
   * @param item 数据项
   * @returns 项高度
   */
  private getItemHeight(item: T): number {
    if (this.config.dynamicHeight && this.itemHeights.has(item.id)) {
      return this.itemHeights.get(item.id)!;
    }
    return item.height || this.config.itemHeight;
  }

  /**
   * 计算渲染结果
   * @returns 虚拟列表渲染结果
   */
  calculateRenderResult(): VirtualListRenderResult {
    const bufferSize = this.config.bufferSize || 5;
    const containerHeight = this.config.containerHeight;
    
    let totalHeight = 0;
    let startIndex = 0;
    let endIndex = 0;
    let offsetY = 0;
    
    // 计算总高度和可视区域
    for (let i = 0; i < this.items.length; i++) {
      const itemHeight = this.getItemHeight(this.items[i]);
      
      if (totalHeight + itemHeight < this.scrollTop && startIndex === i) {
        startIndex = i + 1;
        offsetY = totalHeight + itemHeight;
      }
      
      if (totalHeight < this.scrollTop + containerHeight) {
        endIndex = i;
      }
      
      totalHeight += itemHeight;
    }
    
    // 添加缓冲区
    startIndex = Math.max(0, startIndex - bufferSize);
    endIndex = Math.min(this.items.length - 1, endIndex + bufferSize);
    
    // 重新计算偏移量
    offsetY = 0;
    for (let i = 0; i < startIndex; i++) {
      offsetY += this.getItemHeight(this.items[i]);
    }
    
    const visibleItems = this.items.slice(startIndex, endIndex + 1);
    
    return {
      visibleItems,
      startIndex,
      endIndex,
      totalHeight,
      offsetY
    };
  }

  /**
   * 获取项在列表中的位置
   * @param itemId 项ID
   * @returns 项的Y坐标，如果未找到返回-1
   */
  getItemPosition(itemId: string | number): number {
    let position = 0;
    
    for (const item of this.items) {
      if (item.id === itemId) {
        return position;
      }
      position += this.getItemHeight(item);
    }
    
    return -1;
  }

  /**
   * 滚动到指定项
   * @param itemId 项ID
   * @returns 目标滚动位置，如果未找到返回null
   */
  scrollToItem(itemId: string | number): number | null {
    const position = this.getItemPosition(itemId);
    return position >= 0 ? position : null;
  }
}

/**
 * 性能监控器
 */
export class PerformanceMonitor {
  private measurements = new Map<string, number>();
  private marks = new Map<string, number>();

  /**
   * 开始性能测量
   * @param name 测量名称
   */
  start(name: string): void {
    this.marks.set(name, performance.now());
  }

  /**
   * 结束性能测量
   * @param name 测量名称
   * @returns 耗时（毫秒）
   */
  end(name: string): number {
    const startTime = this.marks.get(name);
    if (startTime === undefined) {
      console.warn(`性能测量 "${name}" 未找到开始标记`);
      return 0;
    }
    
    const duration = performance.now() - startTime;
    this.measurements.set(name, duration);
    this.marks.delete(name);
    
    return duration;
  }

  /**
   * 获取测量结果
   * @param name 测量名称
   * @returns 耗时（毫秒）或undefined
   */
  getMeasurement(name: string): number | undefined {
    return this.measurements.get(name);
  }

  /**
   * 获取所有测量结果
   * @returns 测量结果对象
   */
  getAllMeasurements(): Record<string, number> {
    return Object.fromEntries(this.measurements);
  }

  /**
   * 清空所有测量结果
   */
  clear(): void {
    this.measurements.clear();
    this.marks.clear();
  }

  /**
   * 记录性能日志
   * @param name 测量名称
   * @param threshold 阈值（毫秒），超过阈值时输出警告
   */
  log(name: string, threshold: number = 100): void {
    const duration = this.getMeasurement(name);
    if (duration !== undefined) {
      const message = `性能测量 "${name}": ${duration.toFixed(2)}ms`;
      if (duration > threshold) {
        console.warn(`⚠️ ${message} (超过阈值 ${threshold}ms)`);
      } else {
        console.log(`✅ ${message}`);
      }
    }
  }
}

/**
 * 批处理管理器
 */
export class BatchProcessor<T> {
  private queue: T[] = [];
  private processing = false;
  private batchSize: number;
  private delay: number;
  private processor: (batch: T[]) => Promise<void>;

  constructor(
    processor: (batch: T[]) => Promise<void>,
    batchSize: number = 10,
    delay: number = 100
  ) {
    this.processor = processor;
    this.batchSize = batchSize;
    this.delay = delay;
  }

  /**
   * 添加项到处理队列
   * @param item 要处理的项
   */
  add(item: T): void {
    this.queue.push(item);
    this.scheduleProcess();
  }

  /**
   * 批量添加项到处理队列
   * @param items 要处理的项列表
   */
  addBatch(items: T[]): void {
    this.queue.push(...items);
    this.scheduleProcess();
  }

  /**
   * 调度处理
   */
  private scheduleProcess(): void {
    if (this.processing) return;
    
    setTimeout(() => {
      this.process();
    }, this.delay);
  }

  /**
   * 处理队列中的项
   */
  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    
    this.processing = true;
    
    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.batchSize);
        await this.processor(batch);
      }
    } catch (error) {
      console.error('批处理失败:', error);
    } finally {
      this.processing = false;
    }
  }

  /**
   * 清空队列
   */
  clear(): void {
    this.queue.length = 0;
  }

  /**
   * 获取队列长度
   * @returns 队列中的项数量
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * 是否正在处理
   * @returns 是否正在处理
   */
  isProcessing(): boolean {
    return this.processing;
  }
}

/**
 * 内存使用监控
 */
export class MemoryMonitor {
  /**
   * 获取内存使用信息
   * @returns 内存使用信息或null（如果不支持）
   */
  static getMemoryUsage(): MemoryUsage | null {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        usedJSHeapSize: memory.usedJSHeapSize,
        totalJSHeapSize: memory.totalJSHeapSize,
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        usagePercentage: (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
      };
    }
    return null;
  }

  /**
   * 检查内存使用是否过高
   * @param threshold 阈值百分比（默认80%）
   * @returns 是否内存使用过高
   */
  static isMemoryUsageHigh(threshold: number = 80): boolean {
    const usage = this.getMemoryUsage();
    return usage ? usage.usagePercentage > threshold : false;
  }

  /**
   * 记录内存使用日志
   */
  static logMemoryUsage(): void {
    const usage = this.getMemoryUsage();
    if (usage) {
      console.log(`内存使用: ${(usage.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB / ${(usage.totalJSHeapSize / 1024 / 1024).toFixed(2)}MB (${usage.usagePercentage.toFixed(1)}%)`);
    }
  }
}

/**
 * 内存使用信息接口
 */
export interface MemoryUsage {
  /** 已使用的JS堆大小（字节） */
  usedJSHeapSize: number;
  /** 总JS堆大小（字节） */
  totalJSHeapSize: number;
  /** JS堆大小限制（字节） */
  jsHeapSizeLimit: number;
  /** 使用百分比 */
  usagePercentage: number;
}