/**
 * 文件操作工具函数
 * 提供文件读写、路径处理等通用功能
 */

import { TFile, TFolder, Vault } from 'obsidian';
import { FileSystemError } from '../types/errors';

/**
 * 生成唯一ID
 * @returns 唯一标识符
 */
export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

/**
 * 文件操作工具类
 */
export class FileUtils {
  constructor(private vault: Vault) {}

  /**
   * 确保目录存在，如果不存在则创建
   * @param path 目录路径
   * @returns 是否成功创建或已存在
   */
  async ensureDirectoryExists(path: string): Promise<boolean> {
    try {
      const folder = this.vault.getAbstractFileByPath(path);
      if (folder && folder instanceof TFolder) {
        return true;
      }
      
      await this.vault.createFolder(path);
      return true;
    } catch (error) {
      throw new FileSystemError(
        `无法创建目录: ${path}`,
        path,
        'createFolder',
        { path },
        error as Error
      );
    }
  }

  /**
   * 安全地写入文件内容
   * @param path 文件路径
   * @param content 文件内容
   * @returns 是否写入成功
   */
  async writeFile(path: string, content: string): Promise<boolean> {
    try {
      // 确保父目录存在
      const parentPath = this.getParentPath(path);
      if (parentPath) {
        await this.ensureDirectoryExists(parentPath);
      }

      const file = this.vault.getAbstractFileByPath(path);
      if (file && file instanceof TFile) {
        // 文件已存在，修改内容
        await this.vault.modify(file, content);
      } else {
        // 文件不存在，创建新文件
        await this.vault.create(path, content);
      }
      
      return true;
    } catch (error) {
      throw new FileSystemError(
        `无法写入文件: ${path}`,
        path,
        'writeFile',
        { path, contentLength: content.length },
        error as Error
      );
    }
  }

  /**
   * 安全地读取文件内容
   * @param path 文件路径
   * @returns 文件内容，如果文件不存在返回null
   */
  async readFile(path: string): Promise<string | null> {
    try {
      const file = this.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof TFile)) {
        return null;
      }
      
      return await this.vault.read(file);
    } catch (error) {
      throw new FileSystemError(
        `无法读取文件: ${path}`,
        path,
        'readFile',
        { path },
        error as Error
      );
    }
  }

  /**
   * 检查文件是否存在
   * @param path 文件路径
   * @returns 文件是否存在
   */
  fileExists(path: string): boolean {
    const file = this.vault.getAbstractFileByPath(path);
    return file instanceof TFile;
  }

  /**
   * 检查目录是否存在
   * @param path 目录路径
   * @returns 目录是否存在
   */
  directoryExists(path: string): boolean {
    const folder = this.vault.getAbstractFileByPath(path);
    return folder instanceof TFolder;
  }

  /**
   * 删除文件
   * @param path 文件路径
   * @returns 是否删除成功
   */
  async deleteFile(path: string): Promise<boolean> {
    try {
      const file = this.vault.getAbstractFileByPath(path);
      if (!file || !(file instanceof TFile)) {
        return false; // 文件不存在，视为删除成功
      }
      
      await this.vault.delete(file);
      return true;
    } catch (error) {
      throw new FileSystemError(
        `无法删除文件: ${path}`,
        path,
        'deleteFile',
        { path },
        error as Error
      );
    }
  }

  /**
   * 获取目录下的所有文件
   * @param path 目录路径
   * @param recursive 是否递归查找
   * @returns 文件路径列表
   */
  async getFilesInDirectory(path: string, recursive: boolean = false): Promise<string[]> {
    try {
      const folder = this.vault.getAbstractFileByPath(path);
      if (!folder || !(folder instanceof TFolder)) {
        return [];
      }
      
      const files: string[] = [];
      
      for (const child of folder.children) {
        if (child instanceof TFile) {
          files.push(child.path);
        } else if (recursive && child instanceof TFolder) {
          const subFiles = await this.getFilesInDirectory(child.path, true);
          files.push(...subFiles);
        }
      }
      
      return files;
    } catch (error) {
      throw new FileSystemError(
        `无法读取目录: ${path}`,
        path,
        'getFilesInDirectory',
        { path, recursive },
        error as Error
      );
    }
  }

  /**
   * 获取文件的父目录路径
   * @param filePath 文件路径
   * @returns 父目录路径，如果是根目录则返回null
   */
  getParentPath(filePath: string): string | null {
    const lastSlashIndex = filePath.lastIndexOf('/');
    if (lastSlashIndex === -1) {
      return null; // 根目录文件
    }
    return filePath.substring(0, lastSlashIndex);
  }

  /**
   * 获取文件名（不含路径）
   * @param filePath 文件路径
   * @returns 文件名
   */
  getFileName(filePath: string): string {
    const lastSlashIndex = filePath.lastIndexOf('/');
    return filePath.substring(lastSlashIndex + 1);
  }

  /**
   * 获取文件扩展名
   * @param filePath 文件路径
   * @returns 扩展名（不含点号），如果没有扩展名返回空字符串
   */
  getFileExtension(filePath: string): string {
    const fileName = this.getFileName(filePath);
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex === -1) {
      return '';
    }
    return fileName.substring(lastDotIndex + 1).toLowerCase();
  }

  /**
   * 生成唯一的文件路径（如果文件已存在，添加数字后缀）
   * @param basePath 基础路径
   * @returns 唯一的文件路径
   */
  generateUniqueFilePath(basePath: string): string {
    if (!this.fileExists(basePath)) {
      return basePath;
    }
    
    const extension = this.getFileExtension(basePath);
    const nameWithoutExt = basePath.substring(0, basePath.lastIndexOf('.'));
    
    let counter = 1;
    let uniquePath: string;
    
    do {
      uniquePath = `${nameWithoutExt} (${counter}).${extension}`;
      counter++;
    } while (this.fileExists(uniquePath));
    
    return uniquePath;
  }

  /**
   * 规范化路径（处理路径分隔符和相对路径）
   * @param path 原始路径
   * @returns 规范化后的路径
   */
  normalizePath(path: string): string {
    // 将反斜杠转换为正斜杠
    let normalized = path.replace(/\\/g, '/');
    
    // 移除开头的斜杠
    if (normalized.startsWith('/')) {
      normalized = normalized.substring(1);
    }
    
    // 移除结尾的斜杠
    if (normalized.endsWith('/')) {
      normalized = normalized.substring(0, normalized.length - 1);
    }
    
    return normalized;
  }

  /**
   * 连接路径
   * @param paths 路径片段
   * @returns 连接后的路径
   */
  joinPath(...paths: string[]): string {
    const normalizedPaths = paths
      .filter(path => path && path.length > 0)
      .map(path => this.normalizePath(path));
    
    return normalizedPaths.join('/');
  }

  /**
   * 检查路径是否安全（防止路径遍历攻击）
   * @param path 要检查的路径
   * @returns 路径是否安全
   */
  isPathSafe(path: string): boolean {
    const normalized = this.normalizePath(path);
    
    // 检查是否包含危险的路径片段
    const dangerousPatterns = ['..', './', '~/', '\\'];
    return !dangerousPatterns.some(pattern => normalized.includes(pattern));
  }
}

/**
 * 文件大小格式化工具
 */
export class FileSizeFormatter {
  /**
   * 将字节数格式化为人类可读的格式
   * @param bytes 字节数
   * @param decimals 小数位数
   * @returns 格式化后的字符串
   */
  static formatBytes(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * 解析人类可读的文件大小为字节数
   * @param sizeStr 大小字符串（如 "1.5 MB"）
   * @returns 字节数
   */
  static parseSize(sizeStr: string): number {
    const units: Record<string, number> = {
      'B': 1,
      'BYTES': 1,
      'KB': 1024,
      'MB': 1024 * 1024,
      'GB': 1024 * 1024 * 1024,
      'TB': 1024 * 1024 * 1024 * 1024
    };

    const match = sizeStr.trim().match(/^(\d+(?:\.\d+)?)\s*([A-Z]+)$/i);
    if (!match) {
      throw new Error(`无效的文件大小格式: ${sizeStr}`);
    }

    const [, numberStr, unitStr] = match;
    const number = parseFloat(numberStr);
    const unit = unitStr.toUpperCase();

    if (!(unit in units)) {
      throw new Error(`不支持的文件大小单位: ${unit}`);
    }

    return Math.round(number * units[unit]);
  }
}