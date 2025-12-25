/**
 * 书籍导入功能相关类型定义
 * 支持EPUB、DOCX、PDF、TXT等格式的导入和转换
 */

/**
 * 支持的文件格式枚举
 */
export enum SupportedFormat {
  /** EPUB电子书格式 */
  EPUB = 'epub',
  /** Word文档格式 */
  DOCX = 'docx',
  /** PDF文档格式 */
  PDF = 'pdf',
  /** 纯文本格式 */
  TXT = 'txt'
}

/**
 * 导入状态枚举
 */
export enum ImportStatus {
  /** 等待中 */
  PENDING = 'pending',
  /** 解析中 */
  PARSING = 'parsing',
  /** 转换中 */
  CONVERTING = 'converting',
  /** 生成文件中 */
  GENERATING = 'generating',
  /** 完成 */
  COMPLETED = 'completed',
  /** 失败 */
  FAILED = 'failed'
}

/**
 * 书籍基础信息接口（扩展现有数据）
 */
export interface BookInfo {
  /** 书籍唯一标识 */
  id: string;
  /** 书名 */
  title: string;
  /** 作者 */
  author: string;
  /** 出版信息（可选） */
  publishInfo?: string;
  /** 导入时间 */
  importTime: Date;
  /** 原始文件路径 */
  filePath: string;
  /** 封面图片路径（可选） */
  coverImage?: string;
  /** 书籍描述（可选） */
  description?: string;
  /** 总字数 */
  totalWordCount: number;
  /** 章节数量 */
  chapterCount: number;
  /** 时间线配置 */
  timelineConfig: {
    /** 轨道配置 */
    tracks: any[]; // 引用timeline.ts中的Track类型
    /** 是否启用过去事件区域 */
    pastEventArea: boolean;
  };
}

/**
 * 章节信息接口（扩展现有数据）
 */
export interface Chapter {
  /** 章节索引（从1开始） */
  index: number;
  /** 章节标题 */
  title: string;
  /** 章节内容 */
  content: string;
  /** 字数统计 */
  wordCount: number;
  /** 章节层级（用于处理嵌套章节） */
  level?: number;
  /** 原始HTML内容（EPUB解析时保留） */
  rawHtml?: string;
}

/**
 * 解析后的书籍数据
 */
export interface ParsedBook {
  /** 书籍元数据 */
  metadata: BookInfo;
  /** 章节列表 */
  chapters: Chapter[];
  /** 总字数 */
  totalWordCount: number;
  /** 解析统计信息 */
  parseStats: {
    /** 解析耗时（毫秒） */
    parseTime: number;
    /** 原始文件大小（字节） */
    originalSize: number;
    /** 解析后内容大小（字节） */
    parsedSize: number;
  };
}

/**
 * 导入进度信息
 */
export interface ImportProgress {
  /** 当前状态 */
  status: ImportStatus;
  /** 进度百分比（0-100） */
  progress: number;
  /** 当前步骤描述 */
  message: string;
  /** 当前处理的章节（如果适用） */
  currentChapter?: number;
  /** 总章节数 */
  totalChapters?: number;
  /** 错误信息（如果失败） */
  error?: string;
}

/**
 * 导入配置选项
 */
export interface ImportOptions {
  /** 目标目录路径 */
  targetPath: string;
  /** 是否保留原始格式 */
  preserveFormatting: boolean;
  /** 是否生成目录文件 */
  generateToc: boolean;
  /** 章节标题提取规则 */
  chapterTitlePattern?: RegExp;
  /** 最大章节长度（字符数，超过则分割） */
  maxChapterLength?: number;
  /** 是否自动检测章节分割 */
  autoDetectChapters: boolean;
  /** 编码格式（TXT文件） */
  encoding?: string;
}

/**
 * 文件转换结果
 */
export interface ConversionResult {
  /** 是否成功 */
  success: boolean;
  /** 生成的文件列表 */
  generatedFiles: string[];
  /** 书籍信息 */
  bookInfo: BookInfo;
  /** 转换统计 */
  stats: {
    /** 转换耗时（毫秒） */
    conversionTime: number;
    /** 生成的章节数 */
    chaptersGenerated: number;
    /** 总文件大小（字节） */
    totalFileSize: number;
  };
  /** 错误信息（如果失败） */
  error?: string;
  /** 警告信息列表 */
  warnings: string[];
}

/**
 * 文件解析器接口
 * 定义各种格式解析器的统一接口
 */
export interface FileParser {
  /** 支持的文件格式 */
  readonly supportedFormat: SupportedFormat;
  
  /**
   * 解析文件
   * @param filePath 文件路径
   * @param options 解析选项
   * @returns 解析结果
   */
  parse(filePath: string, options?: ImportOptions): Promise<ParsedBook>;
  
  /**
   * 验证文件格式
   * @param filePath 文件路径
   * @returns 是否为支持的格式
   */
  validateFormat(filePath: string): Promise<boolean>;
}

/**
 * Markdown转换器接口
 * 将解析后的内容转换为Markdown格式
 */
export interface MarkdownConverter {
  /**
   * 转换章节内容为Markdown
   * @param chapter 章节数据
   * @param options 转换选项
   * @returns Markdown内容
   */
  convertChapter(chapter: Chapter, options?: ConversionOptions): string;
  
  /**
   * 生成目录文件
   * @param chapters 章节列表
   * @param bookInfo 书籍信息
   * @returns 目录Markdown内容
   */
  generateToc(chapters: Chapter[], bookInfo: BookInfo): string;
  
  /**
   * 生成元数据文件
   * @param bookInfo 书籍信息
   * @returns 元数据JSON内容
   */
  generateMetadata(bookInfo: BookInfo): string;
}

/**
 * 转换选项
 */
export interface ConversionOptions {
  /** 是否保留HTML标签 */
  preserveHtml: boolean;
  /** 是否添加章节编号 */
  addChapterNumbers: boolean;
  /** 标题级别（Markdown中的#数量） */
  titleLevel: number;
  /** 是否添加分隔线 */
  addSeparators: boolean;
}

/**
 * 文件组织器接口
 * 负责创建目录结构和组织文件
 */
export interface FileOrganizer {
  /**
   * 创建书籍目录结构
   * @param bookInfo 书籍信息
   * @param targetPath 目标路径
   * @returns 创建的目录路径
   */
  createBookDirectory(bookInfo: BookInfo, targetPath: string): Promise<string>;
  
  /**
   * 保存章节文件
   * @param chapter 章节数据
   * @param bookPath 书籍目录路径
   * @param content Markdown内容
   * @returns 保存的文件路径
   */
  saveChapterFile(chapter: Chapter, bookPath: string, content: string): Promise<string>;
  
  /**
   * 保存元数据文件
   * @param bookInfo 书籍信息
   * @param bookPath 书籍目录路径
   * @returns 保存的文件路径
   */
  saveMetadataFile(bookInfo: BookInfo, bookPath: string): Promise<string>;
}

/**
 * 导入任务
 * 表示一个完整的导入操作
 */
export interface ImportTask {
  /** 任务ID */
  id: string;
  /** 源文件路径 */
  sourceFile: string;
  /** 文件格式 */
  format: SupportedFormat;
  /** 导入选项 */
  options: ImportOptions;
  /** 当前状态 */
  status: ImportStatus;
  /** 进度信息 */
  progress: ImportProgress;
  /** 开始时间 */
  startTime: Date;
  /** 完成时间（如果已完成） */
  endTime?: Date;
  /** 转换结果（如果成功） */
  result?: ConversionResult;
}

/**
 * 批量导入任务
 * 支持同时导入多个文件
 */
export interface BatchImportTask {
  /** 批量任务ID */
  id: string;
  /** 子任务列表 */
  tasks: ImportTask[];
  /** 整体状态 */
  status: ImportStatus;
  /** 整体进度（0-100） */
  overallProgress: number;
  /** 成功任务数 */
  successCount: number;
  /** 失败任务数 */
  failureCount: number;
  /** 开始时间 */
  startTime: Date;
  /** 完成时间（如果已完成） */
  endTime?: Date;
}