/**
 * Frontmatter 解析和生成工具
 * 
 * 提供 MD 文件 Frontmatter 的解析、生成和更新功能
 * 
 * Requirements: 12.3
 */

import { ChapterFrontmatter } from '../types/database';

/**
 * Frontmatter 分隔符
 */
const FRONTMATTER_DELIMITER = '---';

/**
 * 解析结果
 */
export interface ParsedFrontmatter<T = Record<string, unknown>> {
  /** 解析出的 Frontmatter 数据 */
  data: T;
  /** 文件正文内容（不含 Frontmatter） */
  content: string;
  /** 是否存在 Frontmatter */
  hasFrontmatter: boolean;
}

/**
 * 解析 MD 文件的 Frontmatter
 * 
 * @param fileContent - MD 文件的完整内容
 * @returns 解析结果，包含 Frontmatter 数据和正文内容
 */
export function parseFrontmatter<T = Record<string, unknown>>(
  fileContent: string
): ParsedFrontmatter<T> {
  const trimmedContent = fileContent.trim();
  
  // 检查是否以 --- 开头
  if (!trimmedContent.startsWith(FRONTMATTER_DELIMITER)) {
    return {
      data: {} as T,
      content: fileContent,
      hasFrontmatter: false,
    };
  }
  
  // 查找第二个 ---
  const secondDelimiterIndex = trimmedContent.indexOf(
    FRONTMATTER_DELIMITER,
    FRONTMATTER_DELIMITER.length
  );
  
  if (secondDelimiterIndex === -1) {
    return {
      data: {} as T,
      content: fileContent,
      hasFrontmatter: false,
    };
  }
  
  // 提取 Frontmatter 部分
  const frontmatterStr = trimmedContent.slice(
    FRONTMATTER_DELIMITER.length,
    secondDelimiterIndex
  ).trim();
  
  // 提取正文内容
  const content = trimmedContent.slice(
    secondDelimiterIndex + FRONTMATTER_DELIMITER.length
  ).trim();
  
  // 解析 YAML 格式的 Frontmatter
  const data = parseYamlLike<T>(frontmatterStr);
  
  return {
    data,
    content,
    hasFrontmatter: true,
  };
}

/**
 * 生成 Frontmatter 字符串
 * 
 * @param data - Frontmatter 数据对象
 * @returns 格式化的 Frontmatter 字符串（包含分隔符）
 */
export function generateFrontmatter(data: Record<string, unknown>): string {
  const lines: string[] = [FRONTMATTER_DELIMITER];
  
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) {
      continue;
    }
    
    const formattedValue = formatYamlValue(value);
    lines.push(`${key}: ${formattedValue}`);
  }
  
  lines.push(FRONTMATTER_DELIMITER);
  
  return lines.join('\n');
}

/**
 * 更新现有文件的 Frontmatter
 * 
 * @param fileContent - 原始文件内容
 * @param updates - 要更新的字段
 * @returns 更新后的完整文件内容
 */
export function updateFrontmatter(
  fileContent: string,
  updates: Record<string, unknown>
): string {
  const parsed = parseFrontmatter(fileContent);
  
  // 合并现有数据和更新
  const mergedData = {
    ...parsed.data,
    ...updates,
  };
  
  // 生成新的 Frontmatter
  const newFrontmatter = generateFrontmatter(mergedData);
  
  // 组合新的文件内容
  if (parsed.content) {
    return `${newFrontmatter}\n\n${parsed.content}`;
  }
  
  return newFrontmatter;
}

/**
 * 为章节文件添加或更新 Frontmatter
 * 
 * @param fileContent - 原始文件内容
 * @param frontmatter - 章节 Frontmatter 数据
 * @returns 更新后的完整文件内容
 */
export function setChapterFrontmatter(
  fileContent: string,
  frontmatter: ChapterFrontmatter
): string {
  // 转换为 snake_case 格式（Dataview 兼容）
  const data: Record<string, unknown> = {
    book_id: frontmatter.bookId,
    chapter_id: frontmatter.chapterId,
    chapter_num: frontmatter.chapterNum,
    title: frontmatter.title,
    word_count: frontmatter.wordCount,
    read_status: frontmatter.readStatus,
  };
  
  // 添加可选字段
  if (frontmatter.aiSummary) {
    data.ai_summary = frontmatter.aiSummary;
  }
  if (frontmatter.aiKeyEvents && frontmatter.aiKeyEvents.length > 0) {
    data.ai_key_events = frontmatter.aiKeyEvents;
  }
  if (frontmatter.readAt) {
    data.read_at = frontmatter.readAt;
  }
  
  return updateFrontmatter(fileContent, data);
}

/**
 * 从章节文件解析 Frontmatter
 * 
 * @param fileContent - 文件内容
 * @returns 章节 Frontmatter 数据（如果存在）
 */
export function parseChapterFrontmatter(
  fileContent: string
): ChapterFrontmatter | null {
  const parsed = parseFrontmatter(fileContent);
  
  if (!parsed.hasFrontmatter) {
    return null;
  }
  
  const data = parsed.data as Record<string, unknown>;
  
  // 检查必需字段
  if (!data.book_id || !data.chapter_id) {
    return null;
  }
  
  return {
    bookId: String(data.book_id),
    chapterId: String(data.chapter_id),
    chapterNum: Number(data.chapter_num) || 0,
    title: String(data.title || ''),
    wordCount: Number(data.word_count) || 0,
    readStatus: (data.read_status as ChapterFrontmatter['readStatus']) || 'unread',
    aiSummary: data.ai_summary ? String(data.ai_summary) : undefined,
    aiKeyEvents: Array.isArray(data.ai_key_events) 
      ? data.ai_key_events.map(String) 
      : undefined,
    readAt: data.read_at ? String(data.read_at) : undefined,
  };
}

// ============ 内部辅助函数 ============

/**
 * 简单的 YAML-like 解析器
 * 支持基本的键值对、数组和嵌套对象
 */
function parseYamlLike<T = Record<string, unknown>>(yamlStr: string): T {
  const result: Record<string, unknown> = {};
  const lines = yamlStr.split('\n');
  
  let currentKey = '';
  let currentArray: unknown[] | null = null;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // 跳过空行和注释
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }
    
    // 检查是否是数组项
    if (trimmedLine.startsWith('- ')) {
      if (currentArray !== null) {
        currentArray.push(parseValue(trimmedLine.slice(2).trim()));
      }
      continue;
    }
    
    // 如果之前在收集数组，保存它
    if (currentArray !== null && currentKey) {
      result[currentKey] = currentArray;
      currentArray = null;
    }
    
    // 解析键值对
    const colonIndex = trimmedLine.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }
    
    const key = trimmedLine.slice(0, colonIndex).trim();
    const valueStr = trimmedLine.slice(colonIndex + 1).trim();
    
    if (!valueStr) {
      // 可能是数组的开始
      currentKey = key;
      currentArray = [];
    } else {
      result[key] = parseValue(valueStr);
    }
  }
  
  // 保存最后一个数组
  if (currentArray !== null && currentKey) {
    result[currentKey] = currentArray;
  }
  
  return result as T;
}

/**
 * 解析单个值
 */
function parseValue(valueStr: string): unknown {
  // 去除引号
  if ((valueStr.startsWith('"') && valueStr.endsWith('"')) ||
      (valueStr.startsWith("'") && valueStr.endsWith("'"))) {
    return valueStr.slice(1, -1);
  }
  
  // 布尔值
  if (valueStr === 'true') return true;
  if (valueStr === 'false') return false;
  
  // null
  if (valueStr === 'null' || valueStr === '~') return null;
  
  // 数字
  const num = Number(valueStr);
  if (!isNaN(num) && valueStr !== '') {
    return num;
  }
  
  // 内联数组 [a, b, c]
  if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
    const inner = valueStr.slice(1, -1);
    if (!inner.trim()) return [];
    return inner.split(',').map(item => parseValue(item.trim()));
  }
  
  // 字符串
  return valueStr;
}

/**
 * 格式化值为 YAML 格式
 */
function formatYamlValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }
  
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  
  if (typeof value === 'number') {
    return String(value);
  }
  
  if (typeof value === 'string') {
    // 如果包含特殊字符，使用引号
    if (value.includes(':') || value.includes('#') || 
        value.includes('\n') || value.includes('"') ||
        value.startsWith(' ') || value.endsWith(' ')) {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return value;
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    // 简单数组使用内联格式
    if (value.every(item => typeof item === 'string' || typeof item === 'number')) {
      return `[${value.map(item => formatYamlValue(item)).join(', ')}]`;
    }
    // 复杂数组需要多行格式，这里简化处理
    return `[${value.map(item => formatYamlValue(item)).join(', ')}]`;
  }
  
  if (typeof value === 'object') {
    // 对象转为 JSON 字符串
    return JSON.stringify(value);
  }
  
  return String(value);
}

/**
 * 验证 Frontmatter 数据是否有效
 */
export function validateFrontmatter(
  data: Record<string, unknown>,
  requiredFields: string[]
): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = [];
  
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      missingFields.push(field);
    }
  }
  
  return {
    valid: missingFields.length === 0,
    missingFields,
  };
}

/**
 * 从文件内容中移除 Frontmatter
 */
export function removeFrontmatter(fileContent: string): string {
  const parsed = parseFrontmatter(fileContent);
  return parsed.content;
}

/**
 * 检查文件是否包含 Frontmatter
 */
export function hasFrontmatter(fileContent: string): boolean {
  return parseFrontmatter(fileContent).hasFrontmatter;
}
