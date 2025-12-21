/**
 * ConversationManager - 管理交互式追问的对话上下文
 * 
 * 功能：
 * - 创建新对话，使用分析上下文初始化
 * - 处理一般性追问
 * - 处理针对特定章节的追问
 * - 保持对话历史
 * - 将对话内容保存到笔记
 * 
 * 需求: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { App, TFile, TFolder } from 'obsidian';
import {
  Conversation,
  ChatMessage,
  AnalysisResult,
  ParsedBook,
  Chapter
} from '../types';
import { LLMService } from './LLMService';

/**
 * 对话系统提示词
 */
const CONVERSATION_SYSTEM_PROMPT = `你是一位专业的网络小说分析助手，正在帮助用户深入理解一本小说的写作技法。

你已经完成了对这本小说的初步分析，现在用户可能会：
1. 对分析结果进行追问，希望获得更详细的解读
2. 询问特定章节的内容和技法
3. 探讨某个写作技巧的具体应用
4. 比较不同章节或人物的处理方式

请基于已有的分析上下文和原文内容，给出专业、具体、有价值的回答。
回答时请：
- 引用具体的原文片段作为例证
- 从写作学习的角度给出可借鉴的建议
- 保持回答的条理性和可读性`;

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export class ConversationManager {
  private conversations: Map<string, ConversationContext> = new Map();
  private app: App;
  private llmService: LLMService;

  constructor(app: App, llmService: LLMService) {
    this.app = app;
    this.llmService = llmService;
  }

  /**
   * 创建新对话
   * @param bookPath 书籍文件路径
   * @param analysisResult 分析结果
   * @param parsedBook 可选的已解析书籍（用于章节追问）
   * @returns 新创建的对话
   */
  create(
    bookPath: string,
    analysisResult: AnalysisResult,
    parsedBook?: ParsedBook
  ): Conversation {
    const id = generateId();
    const now = new Date();

    const conversation: Conversation = {
      id,
      bookPath,
      analysisResult,
      messages: [],
      createdAt: now,
      updatedAt: now
    };

    // 构建分析上下文摘要
    const contextSummary = this.buildContextSummary(analysisResult);

    // 存储对话上下文
    const context: ConversationContext = {
      conversation,
      parsedBook,
      contextSummary
    };

    this.conversations.set(id, context);

    return conversation;
  }

  /**
   * 发送追问
   * @param conversationId 对话 ID
   * @param question 用户问题
   * @returns AI 回答
   */
  async ask(conversationId: string, question: string): Promise<string> {
    const context = this.getContext(conversationId);
    const { conversation, contextSummary } = context;

    // 添加用户消息
    const userMessage: ChatMessage = {
      role: 'user',
      content: question
    };
    conversation.messages.push(userMessage);

    // 构建完整的消息列表
    const messages = this.buildMessages(context, question);

    // 调用 LLM
    const response = await this.llmService.chat(messages);

    // 添加助手回复
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: response
    };
    conversation.messages.push(assistantMessage);

    // 更新时间戳
    conversation.updatedAt = new Date();

    return response;
  }

  /**
   * 针对特定章节追问
   * @param conversationId 对话 ID
   * @param chapterIndex 章节索引
   * @param question 用户问题
   * @returns AI 回答
   */
  async askAboutChapter(
    conversationId: string,
    chapterIndex: number,
    question: string
  ): Promise<string> {
    const context = this.getContext(conversationId);
    const { conversation, parsedBook } = context;

    // 获取章节内容
    const chapter = this.getChapterContent(context, chapterIndex);
    
    // 构建包含章节上下文的问题
    const enhancedQuestion = this.buildChapterQuestion(chapter, question);

    // 添加用户消息（记录原始问题和章节引用）
    const userMessage: ChatMessage = {
      role: 'user',
      content: `[关于第 ${chapterIndex + 1} 章: ${chapter?.title || '未知章节'}]\n\n${question}`
    };
    conversation.messages.push(userMessage);

    // 构建完整的消息列表
    const messages = this.buildMessages(context, enhancedQuestion, chapter);

    // 调用 LLM
    const response = await this.llmService.chat(messages);

    // 添加助手回复
    const assistantMessage: ChatMessage = {
      role: 'assistant',
      content: response
    };
    conversation.messages.push(assistantMessage);

    // 更新时间戳
    conversation.updatedAt = new Date();

    return response;
  }

  /**
   * 获取对话历史
   * @param conversationId 对话 ID
   * @returns 消息列表
   */
  getHistory(conversationId: string): ChatMessage[] {
    const context = this.conversations.get(conversationId);
    if (!context) {
      return [];
    }
    return [...context.conversation.messages];
  }

  /**
   * 获取对话对象
   * @param conversationId 对话 ID
   * @returns 对话对象或 undefined
   */
  getConversation(conversationId: string): Conversation | undefined {
    const context = this.conversations.get(conversationId);
    return context?.conversation;
  }

  /**
   * 保存对话内容到笔记
   * @param conversationId 对话 ID
   * @param selectedMessages 可选的消息索引列表，不指定则保存全部
   * @param notePath 可选的笔记路径，不指定则创建新笔记
   * @returns 保存的笔记路径
   */
  async saveToNote(
    conversationId: string,
    selectedMessages?: number[],
    notePath?: string
  ): Promise<string> {
    const context = this.getContext(conversationId);
    const { conversation } = context;

    // 选择要保存的消息
    const messagesToSave = selectedMessages
      ? selectedMessages.map(i => conversation.messages[i]).filter(Boolean)
      : conversation.messages;

    if (messagesToSave.length === 0) {
      throw new Error('没有可保存的消息');
    }

    // 生成笔记内容
    const noteContent = this.formatMessagesAsNote(
      conversation.analysisResult.bookInfo.title,
      messagesToSave
    );

    // 确定保存路径
    const finalPath = notePath || this.generateNotePath(conversation);

    // 保存或追加到笔记
    await this.writeToNote(finalPath, noteContent, !!notePath);

    return finalPath;
  }

  /**
   * 删除对话
   * @param conversationId 对话 ID
   */
  delete(conversationId: string): void {
    this.conversations.delete(conversationId);
  }

  /**
   * 清理所有对话
   */
  clear(): void {
    this.conversations.clear();
  }

  // ============ 私有方法 ============

  /**
   * 获取对话上下文，不存在则抛出错误
   */
  private getContext(conversationId: string): ConversationContext {
    const context = this.conversations.get(conversationId);
    if (!context) {
      throw new Error(`对话 "${conversationId}" 不存在`);
    }
    return context;
  }

  /**
   * 构建分析上下文摘要
   */
  private buildContextSummary(result: AnalysisResult): string {
    const parts: string[] = [];

    // 书籍信息
    parts.push(`## 书籍信息`);
    parts.push(`- 书名：《${result.bookInfo.title}》`);
    parts.push(`- 作者：${result.bookInfo.author}`);
    if (result.bookInfo.description) {
      parts.push(`- 简介：${result.bookInfo.description}`);
    }

    // 故事梗概
    if (result.synopsis) {
      parts.push(`\n## 故事梗概`);
      parts.push(result.synopsis);
    }

    // 主要人物
    if (result.characters.length > 0) {
      parts.push(`\n## 主要人物`);
      for (const char of result.characters) {
        parts.push(`- **${char.name}**（${char.role}）：${char.description}`);
        if (char.motivation) {
          parts.push(`  - 动机：${char.motivation}`);
        }
      }
    }

    // 写作技法
    if (result.writingTechniques.length > 0) {
      parts.push(`\n## 写作技法`);
      for (const tech of result.writingTechniques) {
        parts.push(`- **${tech.name}**：${tech.description}`);
      }
    }

    // 可借鉴清单
    if (result.takeaways.length > 0) {
      parts.push(`\n## 可借鉴清单`);
      for (const takeaway of result.takeaways) {
        parts.push(`- ${takeaway}`);
      }
    }

    return parts.join('\n');
  }

  /**
   * 构建发送给 LLM 的消息列表
   */
  private buildMessages(
    context: ConversationContext,
    currentQuestion: string,
    chapter?: Chapter | null
  ): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // 系统提示
    messages.push({
      role: 'system',
      content: CONVERSATION_SYSTEM_PROMPT
    });

    // 分析上下文
    messages.push({
      role: 'system',
      content: `以下是对这本小说的分析摘要：\n\n${context.contextSummary}`
    });

    // 如果有章节内容，添加到上下文
    if (chapter) {
      messages.push({
        role: 'system',
        content: `用户正在询问第 ${chapter.index + 1} 章「${chapter.title}」的内容。以下是该章节的原文：\n\n${chapter.content}`
      });
    }

    // 添加历史对话（最近 10 轮）
    const history = context.conversation.messages;
    const recentHistory = history.slice(-20); // 最近 20 条消息（10 轮对话）
    
    for (const msg of recentHistory) {
      // 跳过当前问题（会在最后添加）
      if (msg.role === 'user' && msg.content.includes(currentQuestion)) {
        continue;
      }
      messages.push({
        role: msg.role,
        content: msg.content
      });
    }

    // 添加当前问题
    messages.push({
      role: 'user',
      content: currentQuestion
    });

    return messages;
  }

  /**
   * 获取章节内容
   */
  private getChapterContent(
    context: ConversationContext,
    chapterIndex: number
  ): Chapter | null {
    const { parsedBook, conversation } = context;

    // 如果有完整的书籍数据
    if (parsedBook && chapterIndex >= 0 && chapterIndex < parsedBook.chapters.length) {
      return parsedBook.chapters[chapterIndex];
    }

    // 如果分析结果中有章节详情
    const chapterDetail = conversation.analysisResult.chapterDetails?.find(
      d => d.index === chapterIndex
    );
    
    if (chapterDetail) {
      return {
        index: chapterDetail.index,
        title: chapterDetail.title,
        content: chapterDetail.analysis, // 使用分析内容作为替代
        wordCount: 0
      };
    }

    // 如果有章节结构信息
    const chapterSummary = conversation.analysisResult.chapterStructure?.find(
      s => s.index === chapterIndex
    );

    if (chapterSummary) {
      return {
        index: chapterSummary.index,
        title: chapterSummary.title,
        content: `${chapterSummary.summary}\n\n关键事件：${chapterSummary.keyEvents.join('、')}`,
        wordCount: 0
      };
    }

    return null;
  }

  /**
   * 构建包含章节上下文的问题
   */
  private buildChapterQuestion(chapter: Chapter | null, question: string): string {
    if (!chapter) {
      return question;
    }

    return `关于第 ${chapter.index + 1} 章「${chapter.title}」：\n\n${question}`;
  }

  /**
   * 格式化消息为笔记内容
   */
  private formatMessagesAsNote(bookTitle: string, messages: ChatMessage[]): string {
    const parts: string[] = [];
    const timestamp = new Date().toLocaleString('zh-CN');

    parts.push(`## 追问记录 - ${timestamp}`);
    parts.push('');

    for (const msg of messages) {
      if (msg.role === 'user') {
        parts.push(`### 问题`);
        parts.push(msg.content);
        parts.push('');
      } else if (msg.role === 'assistant') {
        parts.push(`### 回答`);
        parts.push(msg.content);
        parts.push('');
        parts.push('---');
        parts.push('');
      }
    }

    return parts.join('\n');
  }

  /**
   * 生成笔记保存路径
   */
  private generateNotePath(conversation: Conversation): string {
    const bookTitle = conversation.analysisResult.bookInfo.title;
    const sanitizedTitle = this.sanitizeFileName(bookTitle);
    const timestamp = new Date().toISOString().split('T')[0];
    
    return `NovelCraft/notes/${sanitizedTitle}/追问记录-${timestamp}.md`;
  }

  /**
   * 清理文件名中的非法字符
   */
  private sanitizeFileName(name: string): string {
    return name.replace(/[\\/:*?"<>|]/g, '_').trim();
  }

  /**
   * 写入或追加到笔记文件
   */
  private async writeToNote(
    path: string,
    content: string,
    append: boolean
  ): Promise<void> {
    const { vault } = this.app;

    // 确保目录存在
    const dirPath = path.substring(0, path.lastIndexOf('/'));
    await this.ensureDirectory(dirPath);

    const file = vault.getAbstractFileByPath(path);

    if (file instanceof TFile) {
      if (append) {
        // 追加到现有文件
        const existingContent = await vault.read(file);
        await vault.modify(file, existingContent + '\n\n' + content);
      } else {
        // 覆盖现有文件
        await vault.modify(file, content);
      }
    } else {
      // 创建新文件
      await vault.create(path, content);
    }
  }

  /**
   * 确保目录存在
   */
  private async ensureDirectory(dirPath: string): Promise<void> {
    const { vault } = this.app;
    const parts = dirPath.split('/').filter(p => p);
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const folder = vault.getAbstractFileByPath(currentPath);
      
      if (!folder) {
        await vault.createFolder(currentPath);
      } else if (!(folder instanceof TFolder)) {
        throw new Error(`路径 "${currentPath}" 已存在但不是文件夹`);
      }
    }
  }
}

/**
 * 对话上下文（内部使用）
 */
interface ConversationContext {
  conversation: Conversation;
  parsedBook?: ParsedBook;
  contextSummary: string;
}

export { CONVERSATION_SYSTEM_PROMPT };
