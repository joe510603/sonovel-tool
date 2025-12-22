/**
 * CheckpointService - 断点续传服务
 * 
 * 负责分析过程中的断点保存和恢复，支持中断后继续分析。
 * Requirements: 1.2.2.1, 1.2.2.2, 1.2.2.3, 1.2.2.4, 1.2.2.5
 */

import { App, TFile } from 'obsidian';
import { AnalysisConfig, AnalysisResult } from '../types';

/**
 * 断点文件名常量
 */
const CHECKPOINT_FILENAME = '.analysis-checkpoint.json';

/**
 * 分析断点接口
 * 记录分析过程中的状态，用于中断后恢复
 */
export interface AnalysisCheckpoint {
  /** 书籍文件路径 */
  bookPath: string;
  /** 书籍标题 */
  bookTitle: string;
  /** 分析配置 */
  config: AnalysisConfig;
  /** 章节范围 */
  chapterRange: { start: number; end: number };
  /** 当前正在执行的阶段 */
  currentStage: string;
  /** 已完成的阶段列表 */
  completedStages: string[];
  /** 部分分析结果 */
  partialResults: Partial<AnalysisResult>;
  /** 断点创建时间 */
  createdAt: string;
  /** 断点更新时间 */
  updatedAt: string;
}

/**
 * CheckpointService 类
 * 管理分析断点的创建、更新和恢复
 */
export class CheckpointService {
  private app: App;

  constructor(app: App) {
    this.app = app;
  }

  /**
   * 清理文件名，移除不合法字符
   * @param name 原始文件名
   * @returns 清理后的文件名
   */
  private sanitizeFileName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 100);
  }


  /**
   * 获取断点文件路径
   * @param bookTitle 书籍标题
   * @param notesPath 笔记根路径
   * @returns 断点文件完整路径
   */
  getCheckpointPath(bookTitle: string, notesPath: string): string {
    const sanitizedTitle = this.sanitizeFileName(bookTitle);
    return `${notesPath}/${sanitizedTitle}/${CHECKPOINT_FILENAME}`;
  }

  /**
   * 创建断点
   * Requirements: 1.2.2.1
   * 
   * @param bookPath 书籍文件路径
   * @param bookTitle 书籍标题
   * @param config 分析配置
   * @param chapterRange 章节范围
   * @param notesPath 笔记根路径
   */
  async createCheckpoint(
    bookPath: string,
    bookTitle: string,
    config: AnalysisConfig,
    chapterRange: { start: number; end: number },
    notesPath: string
  ): Promise<void> {
    const now = new Date().toISOString();
    
    const checkpoint: AnalysisCheckpoint = {
      bookPath,
      bookTitle,
      config,
      chapterRange,
      currentStage: '',
      completedStages: [],
      partialResults: {},
      createdAt: now,
      updatedAt: now
    };

    await this.saveCheckpoint(checkpoint, notesPath);
  }

  /**
   * 更新断点
   * Requirements: 1.2.2.2, 1.2.2.3
   * 
   * @param bookTitle 书籍标题
   * @param stage 当前完成的阶段
   * @param result 该阶段的分析结果
   * @param notesPath 笔记根路径
   */
  async updateCheckpoint(
    bookTitle: string,
    stage: string,
    result: Partial<AnalysisResult>,
    notesPath: string
  ): Promise<void> {
    const checkpoint = await this.getCheckpoint(bookTitle, notesPath);
    
    if (!checkpoint) {
      // 断点可能尚未创建或已被删除，这是正常情况，静默处理
      return;
    }

    // 将阶段添加到已完成列表
    if (!checkpoint.completedStages.includes(stage)) {
      checkpoint.completedStages.push(stage);
    }

    // 合并部分结果
    checkpoint.partialResults = {
      ...checkpoint.partialResults,
      ...result
    };

    // 更新时间戳
    checkpoint.updatedAt = new Date().toISOString();

    await this.saveCheckpoint(checkpoint, notesPath);
  }


  /**
   * 设置当前正在执行的阶段
   * Requirements: 1.2.2.2
   * 
   * @param bookTitle 书籍标题
   * @param stage 当前阶段
   * @param notesPath 笔记根路径
   */
  async setCurrentStage(
    bookTitle: string,
    stage: string,
    notesPath: string
  ): Promise<void> {
    const checkpoint = await this.getCheckpoint(bookTitle, notesPath);
    
    if (!checkpoint) {
      // 断点可能尚未创建或已被删除，这是正常情况，静默处理
      return;
    }

    checkpoint.currentStage = stage;
    checkpoint.updatedAt = new Date().toISOString();

    await this.saveCheckpoint(checkpoint, notesPath);
  }

  /**
   * 获取断点
   * Requirements: 1.2.2.4
   * 
   * @param bookTitle 书籍标题
   * @param notesPath 笔记根路径
   * @returns 断点数据，如果不存在则返回 null
   */
  async getCheckpoint(
    bookTitle: string,
    notesPath: string
  ): Promise<AnalysisCheckpoint | null> {
    const checkpointPath = this.getCheckpointPath(bookTitle, notesPath);
    
    try {
      const file = this.app.vault.getAbstractFileByPath(checkpointPath);
      if (!file || !(file instanceof TFile)) {
        return null;
      }

      const content = await this.app.vault.read(file);
      const checkpoint = JSON.parse(content) as AnalysisCheckpoint;
      
      // 验证基本结构
      if (!checkpoint.bookTitle || !checkpoint.completedStages || !Array.isArray(checkpoint.completedStages)) {
        console.warn('Invalid checkpoint structure, returning null');
        return null;
      }

      return checkpoint;
    } catch (error) {
      console.error('Failed to read checkpoint:', error);
      return null;
    }
  }

  /**
   * 检查是否有未完成的断点
   * Requirements: 1.2.2.4
   * 
   * @param bookTitle 书籍标题
   * @param notesPath 笔记根路径
   * @returns 是否存在断点
   */
  async hasCheckpoint(
    bookTitle: string,
    notesPath: string
  ): Promise<boolean> {
    const checkpoint = await this.getCheckpoint(bookTitle, notesPath);
    return checkpoint !== null;
  }


  /**
   * 删除断点
   * 分析完成后调用，清理断点文件
   * 
   * @param bookTitle 书籍标题
   * @param notesPath 笔记根路径
   */
  async deleteCheckpoint(
    bookTitle: string,
    notesPath: string
  ): Promise<void> {
    const checkpointPath = this.getCheckpointPath(bookTitle, notesPath);
    
    try {
      const file = this.app.vault.getAbstractFileByPath(checkpointPath);
      if (file && file instanceof TFile) {
        await this.app.vault.delete(file);
      }
    } catch (error) {
      console.error('Failed to delete checkpoint:', error);
    }
  }

  /**
   * 获取需要跳过的阶段列表
   * Requirements: 1.2.2.5
   * 
   * @param checkpoint 断点数据
   * @returns 已完成的阶段列表
   */
  getCompletedStages(checkpoint: AnalysisCheckpoint): string[] {
    return checkpoint.completedStages;
  }

  /**
   * 检查阶段是否已完成
   * Requirements: 1.2.2.5
   * 
   * @param checkpoint 断点数据
   * @param stage 阶段名称
   * @returns 是否已完成
   */
  isStageCompleted(checkpoint: AnalysisCheckpoint, stage: string): boolean {
    return checkpoint.completedStages.includes(stage);
  }

  /**
   * 获取断点的部分结果
   * 
   * @param checkpoint 断点数据
   * @returns 部分分析结果
   */
  getPartialResults(checkpoint: AnalysisCheckpoint): Partial<AnalysisResult> {
    return checkpoint.partialResults;
  }

  /**
   * 保存断点到文件
   * 
   * @param checkpoint 断点数据
   * @param notesPath 笔记根路径
   */
  private async saveCheckpoint(
    checkpoint: AnalysisCheckpoint,
    notesPath: string
  ): Promise<void> {
    const checkpointPath = this.getCheckpointPath(checkpoint.bookTitle, notesPath);
    
    // 确保目录存在
    const folderPath = checkpointPath.substring(0, checkpointPath.lastIndexOf('/'));
    await this.ensureFolderExists(folderPath);

    const content = JSON.stringify(checkpoint, null, 2);
    
    const existingFile = this.app.vault.getAbstractFileByPath(checkpointPath);
    if (existingFile && existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, content);
    } else {
      try {
        await this.app.vault.create(checkpointPath, content);
      } catch (e) {
        // 文件可能已存在，尝试修改
        const file = this.app.vault.getAbstractFileByPath(checkpointPath);
        if (file instanceof TFile) {
          await this.app.vault.modify(file, content);
        }
      }
    }
  }

  /**
   * 确保文件夹存在
   * 
   * @param folderPath 文件夹路径
   */
  private async ensureFolderExists(folderPath: string): Promise<void> {
    const folder = this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder) {
      try {
        await this.app.vault.createFolder(folderPath);
      } catch (e) {
        // 忽略文件夹已存在错误
      }
    }
  }

  /**
   * 格式化断点状态显示
   * 
   * @param checkpoint 断点数据
   * @returns 格式化的状态字符串
   */
  formatCheckpointStatus(checkpoint: AnalysisCheckpoint): string {
    const completedCount = checkpoint.completedStages.length;
    const date = new Date(checkpoint.updatedAt);
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    
    const rangeStr = `${checkpoint.chapterRange.start}-${checkpoint.chapterRange.end}章`;
    
    return `断点: ${rangeStr}，已完成 ${completedCount} 个阶段 (${dateStr})`;
  }
}
