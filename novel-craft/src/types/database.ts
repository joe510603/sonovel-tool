/**
 * 数据库存储层相关类型定义
 * 定义IndexedDB数据表结构和CRUD操作接口
 */

/**
 * 数据库表名枚举
 */
export enum TableName {
  /** 书籍表 */
  BOOKS = 'books',
  /** AI分析结果表 */
  AI_ANALYSIS = 'ai_analysis',
  /** 故事单元表 */
  STORY_UNITS = 'story_units',
  /** 关联关系表 */
  RELATIONS = 'relations',
  /** 人物表 */
  CHARACTERS = 'characters',
  /** 人物关系表 */
  CHARACTER_RELATIONS = 'character_relations',
  /** 轨道表 */
  TRACKS = 'tracks',
  /** 时间线配置表 */
  TIMELINE_CONFIGS = 'timeline_configs'
}

/**
 * 数据库版本信息
 */
export interface DatabaseVersion {
  /** 版本号 */
  version: number;
  /** 版本描述 */
  description: string;
  /** 升级脚本 */
  upgradeScript?: (db: IDBDatabase) => void;
}

/**
 * 书籍数据库记录
 */
export interface BookRecord {
  /** 主键：书籍ID */
  id: string;
  /** 书名 */
  title: string;
  /** 作者 */
  author: string;
  /** 出版信息 */
  publish_info?: string;
  /** 导入时间 */
  import_time: number; // 时间戳
  /** 文件路径 */
  file_path: string;
  /** 封面图片路径 */
  cover_image?: string;
  /** 书籍描述 */
  description?: string;
  /** 总字数 */
  total_word_count: number;
  /** 章节数量 */
  chapter_count: number;
  /** 创建时间 */
  create_time: number;
  /** 更新时间 */
  update_time: number;
}

/**
 * AI分析结果数据库记录
 */
export interface AIAnalysisRecord {
  /** 主键：分析ID */
  id: string;
  /** 外键：书籍ID */
  book_id: string;
  /** 模板类型 */
  template_type: string;
  /** 分析结果（JSON字符串） */
  analysis_result: string;
  /** 编辑状态（JSON字符串） */
  edit_status: string;
  /** 分析状态 */
  status: 'pending' | 'analyzing' | 'completed' | 'failed';
  /** 错误信息 */
  error_message?: string;
  /** 创建时间 */
  create_time: number;
  /** 更新时间 */
  update_time: number;
}

/**
 * 故事单元数据库记录
 */
export interface StoryUnitRecord {
  /** 主键：故事单元ID */
  id: string;
  /** 外键：书籍ID */
  book_id: string;
  /** 故事单元标题 */
  title: string;
  /** 章节范围起始 */
  chapter_start: number;
  /** 章节范围结束 */
  chapter_end: number;
  /** 外键：轨道ID */
  track_id: string;
  /** 外键：AI分析结果ID */
  ai_analysis_id?: string;
  /** 时间位置起始点 */
  time_position_start: number;
  /** 时间位置时长 */
  time_position_duration: number;
  /** 是否为过去事件 */
  is_past_event: boolean;
  /** 涉及人物ID列表（JSON字符串） */
  character_ids: string;
  /** 段落级精细标记 - 起始段落位置 (1-based) */
  paragraph_start?: number;
  /** 段落级精细标记 - 结束段落位置 (1-based) */
  paragraph_end?: number;
  /** 段落级精细标记 - 文本锚点（选中文本的前30字符，用于精确定位） */
  text_anchor?: string;
  /** 用户备注 */
  notes?: string;
  /** 创建时间 */
  create_time: number;
  /** 更新时间 */
  update_time: number;
}

/**
 * 关联关系数据库记录
 */
export interface RelationRecord {
  /** 主键：关联关系ID */
  id: string;
  /** 外键：源故事单元ID */
  source_unit_id: string;
  /** 外键：目标故事单元ID */
  target_unit_id: string;
  /** 关联类型 */
  relation_type: string;
  /** 自定义标签 */
  custom_label?: string;
  /** 关联描述 */
  description?: string;
  /** 关联线颜色 */
  line_color: string;
  /** 创建时间 */
  create_time: number;
  /** 更新时间 */
  update_time: number;
}

/**
 * 人物数据库记录
 */
export interface CharacterRecord {
  /** 主键：人物ID */
  id: string;
  /** 外键：书籍ID */
  book_id: string;
  /** 人物姓名 */
  name: string;
  /** 性别 */
  gender?: string;
  /** 人物角色 */
  role: string;
  /** 人物描述 */
  description?: string;
  /** 人物动机 */
  motivation?: string;
  /** 成长轨迹 */
  growth_arc?: string;
  /** 出场章节（JSON字符串） */
  appearances: string;
  /** 重要事件（JSON字符串） */
  important_events: string;
  /** 戏份权重 */
  screen_time_weight: number;
  /** 创建时间 */
  create_time: number;
  /** 更新时间 */
  update_time: number;
}

/**
 * 人物关系数据库记录
 */
export interface CharacterRelationRecord {
  /** 主键：关系ID */
  id: string;
  /** 外键：书籍ID */
  book_id: string;
  /** 外键：人物A的ID */
  character_a_id: string;
  /** 外键：人物B的ID */
  character_b_id: string;
  /** 关系类型 */
  relation_type: string;
  /** 关系描述 */
  description?: string;
  /** 涉及的故事单元ID列表（JSON字符串） */
  story_unit_ids: string;
  /** 关系强度 */
  intensity: string;
  /** 是否有临时关系变化 */
  is_temporary_change: boolean;
  /** 变化节点 */
  change_node?: string;
  /** 是否为单向关系 */
  is_directional: boolean;
  /** 创建时间 */
  create_time: number;
  /** 更新时间 */
  update_time: number;
}

/**
 * 轨道数据库记录
 */
export interface TrackRecord {
  /** 主键：轨道ID */
  id: string;
  /** 外键：书籍ID */
  book_id: string;
  /** 轨道类型 */
  type: 'main' | 'side';
  /** 轨道名称 */
  name: string;
  /** 轨道颜色 */
  color: string;
  /** 显示顺序 */
  order: number;
  /** 创建时间 */
  create_time: number;
  /** 更新时间 */
  update_time: number;
}

/**
 * 时间线配置数据库记录
 */
export interface TimelineConfigRecord {
  /** 主键：配置ID（通常等于书籍ID） */
  id: string;
  /** 外键：书籍ID */
  book_id: string;
  /** 是否启用过去事件区域 */
  past_event_area: boolean;
  /** 缩放级别 */
  zoom_level: number;
  /** 章节单位宽度 */
  chapter_width: number;
  /** 轨道高度 */
  track_height: number;
  /** 轨道间距 */
  track_spacing: number;
  /** 创建时间 */
  create_time: number;
  /** 更新时间 */
  update_time: number;
}

/**
 * 数据库CRUD操作接口
 */
export interface DatabaseCRUD<T> {
  /**
   * 创建记录
   * @param data 记录数据
   * @returns 创建的记录ID
   */
  create(data: Omit<T, 'id' | 'create_time' | 'update_time'>): Promise<string>;
  
  /**
   * 根据ID获取记录
   * @param id 记录ID
   * @returns 记录数据或null
   */
  getById(id: string): Promise<T | null>;
  
  /**
   * 获取所有记录
   * @returns 记录列表
   */
  getAll(): Promise<T[]>;
  
  /**
   * 根据条件查询记录
   * @param condition 查询条件
   * @returns 匹配的记录列表
   */
  query(condition: Partial<T>): Promise<T[]>;
  
  /**
   * 更新记录
   * @param id 记录ID
   * @param updates 更新数据
   * @returns 是否更新成功
   */
  update(id: string, updates: Partial<T>): Promise<boolean>;
  
  /**
   * 删除记录
   * @param id 记录ID
   * @returns 是否删除成功
   */
  delete(id: string): Promise<boolean>;
  
  /**
   * 批量删除记录
   * @param condition 删除条件
   * @returns 删除的记录数量
   */
  deleteWhere(condition: Partial<T>): Promise<number>;
}

/**
 * 数据库服务接口
 */
export interface DatabaseService {
  /**
   * 初始化数据库
   * @returns 是否初始化成功
   */
  initialize(): Promise<boolean>;
  
  /**
   * 获取数据库连接
   * @returns 数据库实例
   */
  getDatabase(): Promise<IDBDatabase>;
  
  /**
   * 关闭数据库连接
   */
  close(): void;
  
  /**
   * 清空所有数据
   * @returns 是否清空成功
   */
  clearAll(): Promise<boolean>;
  
  /**
   * 获取数据库统计信息
   * @returns 统计信息
   */
  getStats(): Promise<DatabaseStats>;
  
  /**
   * 导出数据库数据
   * @returns 导出的JSON数据
   */
  exportData(): Promise<string>;
  
  /**
   * 导入数据库数据
   * @param jsonData JSON格式的数据
   * @returns 是否导入成功
   */
  importData(jsonData: string): Promise<boolean>;
}

/**
 * 数据库统计信息
 */
export interface DatabaseStats {
  /** 书籍数量 */
  bookCount: number;
  /** 故事单元数量 */
  storyUnitCount: number;
  /** 人物数量 */
  characterCount: number;
  /** 关联关系数量 */
  relationCount: number;
  /** 数据库大小（估算，字节） */
  estimatedSize: number;
  /** 最后更新时间 */
  lastUpdated: number;
}

/**
 * 查询选项
 */
export interface QueryOptions {
  /** 排序字段 */
  orderBy?: string;
  /** 排序方向 */
  orderDirection?: 'asc' | 'desc';
  /** 限制返回数量 */
  limit?: number;
  /** 跳过记录数量 */
  offset?: number;
}

/**
 * 事务操作接口
 */
export interface TransactionOperation<T> {
  /**
   * 在事务中执行操作
   * @param transaction 事务对象
   * @returns 操作结果
   */
  execute(transaction: IDBTransaction): Promise<T>;
}

/**
 * 数据库迁移接口
 */
export interface DatabaseMigration {
  /** 迁移版本号 */
  version: number;
  /** 迁移描述 */
  description: string;
  
  /**
   * 执行迁移
   * @param db 数据库实例
   * @param transaction 事务对象
   */
  migrate(db: IDBDatabase, transaction: IDBTransaction): Promise<void>;
}


// ============ Frontmatter 类型 ============

/**
 * 章节 Frontmatter 数据结构
 * 用于 MD 文件的元数据管理
 */
export interface ChapterFrontmatter {
  /** 书籍ID */
  bookId: string;
  /** 章节ID */
  chapterId: string;
  /** 章节序号 */
  chapterNum: number;
  /** 章节标题 */
  title: string;
  /** 字数 */
  wordCount: number;
  /** 阅读状态 */
  readStatus: 'unread' | 'reading' | 'finished';
  /** AI 摘要 */
  aiSummary?: string;
  /** AI 关键事件 */
  aiKeyEvents?: string[];
  /** 阅读时间 */
  readAt?: string;
}

// ============ 数据库文件路径常量 ============

/**
 * 数据库文件名常量
 * 用于书库管理和阅读进度功能
 */
export const DATABASE_FILES = {
  /** 书籍元数据文件 */
  BOOK_META: '_book_meta.md',
  /** 人物表文件 */
  CHARACTERS: '_characters.md',
  /** 故事单元表文件 */
  STORY_UNITS: '_story_units.md',
  /** 事件表文件 */
  EVENTS: '_events.md',
  /** Canvas 文件夹 */
  CANVAS_FOLDER: '_canvas',
} as const;
