/**
 * 轨道服务
 * 提供时间线轨道的 CRUD 操作和管理
 * 
 * Requirements: 3.1, 3.2
 */

import { databaseService } from './DatabaseService';
import { TrackRecord } from '../types/database';

/**
 * 轨道创建配置
 */
export interface TrackCreateConfig {
  /** 书籍ID */
  bookId: string;
  /** 轨道类型 */
  type: 'main' | 'side';
  /** 轨道名称 */
  name: string;
  /** 轨道颜色 */
  color?: string;
  /** 显示顺序 */
  order?: number;
}

/**
 * 轨道更新配置
 */
export interface TrackUpdateConfig {
  /** 轨道名称 */
  name?: string;
  /** 轨道颜色 */
  color?: string;
  /** 显示顺序 */
  order?: number;
}

/**
 * 默认轨道颜色
 */
const DEFAULT_TRACK_COLORS = {
  main: '#4a90d9',
  side: '#7c8a99'
};

/**
 * 默认轨道配置
 */
const DEFAULT_TRACKS: Omit<TrackCreateConfig, 'bookId'>[] = [
  { type: 'main', name: '主线', color: '#4a90d9' },
  { type: 'side', name: '支线A', color: '#50c878' },
  { type: 'side', name: '支线B', color: '#daa520' }
];

/**
 * 轨道服务类
 */
export class TrackService {
  /**
   * 创建轨道
   */
  async createTrack(config: TrackCreateConfig): Promise<string> {
    const { bookId, type, name, color, order } = config;

    // 如果没有指定顺序，获取当前最大顺序 + 1
    let trackOrder = order;
    if (trackOrder === undefined) {
      const existingTracks = await this.getTracksByBook(bookId);
      trackOrder = existingTracks.length > 0 
        ? Math.max(...existingTracks.map(t => t.order)) + 1 
        : 0;
    }

    const id = await databaseService.tracks.create({
      book_id: bookId,
      type,
      name,
      color: color || DEFAULT_TRACK_COLORS[type],
      order: trackOrder
    });

    return id;
  }

  /**
   * 获取轨道
   */
  async getTrack(id: string): Promise<TrackRecord | null> {
    return await databaseService.tracks.getById(id);
  }

  /**
   * 获取书籍的所有轨道
   */
  async getTracksByBook(bookId: string): Promise<TrackRecord[]> {
    const tracks = await databaseService.tracks.query({ book_id: bookId });
    return tracks.sort((a, b) => a.order - b.order);
  }

  /**
   * 获取书籍的主线轨道
   */
  async getMainTrack(bookId: string): Promise<TrackRecord | null> {
    const tracks = await databaseService.tracks.query({ book_id: bookId, type: 'main' });
    return tracks[0] || null;
  }

  /**
   * 获取书籍的支线轨道
   */
  async getSideTracks(bookId: string): Promise<TrackRecord[]> {
    const tracks = await databaseService.tracks.query({ book_id: bookId, type: 'side' });
    return tracks.sort((a, b) => a.order - b.order);
  }

  /**
   * 更新轨道
   */
  async updateTrack(id: string, updates: TrackUpdateConfig): Promise<boolean> {
    const updateData: Partial<TrackRecord> = {};

    if (updates.name !== undefined) {
      updateData.name = updates.name;
    }
    if (updates.color !== undefined) {
      updateData.color = updates.color;
    }
    if (updates.order !== undefined) {
      updateData.order = updates.order;
    }

    return await databaseService.tracks.update(id, updateData);
  }

  /**
   * 删除轨道
   */
  async deleteTrack(id: string): Promise<boolean> {
    // 检查轨道是否有故事单元
    const units = await databaseService.storyUnits.query({ track_id: id });
    if (units.length > 0) {
      throw new Error(`无法删除轨道：该轨道包含 ${units.length} 个故事单元`);
    }

    return await databaseService.tracks.delete(id);
  }

  /**
   * 初始化书籍的默认轨道
   */
  async initializeDefaultTracks(bookId: string): Promise<TrackRecord[]> {
    const existingTracks = await this.getTracksByBook(bookId);
    if (existingTracks.length > 0) {
      return existingTracks;
    }

    const createdTracks: TrackRecord[] = [];
    
    for (let i = 0; i < DEFAULT_TRACKS.length; i++) {
      const config = DEFAULT_TRACKS[i];
      const id = await this.createTrack({
        bookId,
        type: config.type,
        name: config.name,
        color: config.color,
        order: i
      });
      
      const track = await this.getTrack(id);
      if (track) {
        createdTracks.push(track);
      }
    }

    return createdTracks;
  }

  /**
   * 重新排序轨道
   */
  async reorderTracks(bookId: string, trackIds: string[]): Promise<boolean> {
    for (let i = 0; i < trackIds.length; i++) {
      await this.updateTrack(trackIds[i], { order: i });
    }
    return true;
  }

  /**
   * 添加支线轨道
   */
  async addSideTrack(bookId: string, name?: string): Promise<string> {
    const sideTracks = await this.getSideTracks(bookId);
    const trackName = name || `支线${String.fromCharCode(65 + sideTracks.length)}`;
    
    // 生成不同的颜色
    const colors = ['#50c878', '#daa520', '#9370db', '#ff6b6b', '#4ecdc4', '#45b7d1'];
    const colorIndex = sideTracks.length % colors.length;
    
    return await this.createTrack({
      bookId,
      type: 'side',
      name: trackName,
      color: colors[colorIndex]
    });
  }

  /**
   * 获取轨道统计信息
   */
  async getTrackStats(trackId: string): Promise<{ unitCount: number; totalChapters: number }> {
    const units = await databaseService.storyUnits.query({ track_id: trackId });
    
    let totalChapters = 0;
    for (const unit of units) {
      totalChapters += unit.chapter_end - unit.chapter_start + 1;
    }

    return {
      unitCount: units.length,
      totalChapters
    };
  }
}
