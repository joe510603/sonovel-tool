/**
 * ChatPanel - 追问对话面板组件
 * 
 * 功能：
 * - 显示对话历史
 * - 添加新问题输入框
 * - 添加章节选择器用于针对特定章节追问
 * - 添加保存到笔记按钮
 * 
 * 需求: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { App, Modal, Notice, Setting, DropdownComponent, TextAreaComponent } from 'obsidian';
import {
  ChatMessage,
  AnalysisResult,
  ParsedBook,
  Conversation,
  NovelCraftSettings
} from '../types';
import { ConversationManager } from '../services/ConversationManager';
import { LLMService } from '../services/LLMService';
import { showSuccess, showError, showWarning, handleError } from './NotificationUtils';

export class ChatPanel extends Modal {
  private settings: NovelCraftSettings;
  private conversationManager: ConversationManager;
  private conversation: Conversation;
  private parsedBook?: ParsedBook;

  // UI 状态
  private isLoading = false;
  private selectedChapter: number = -1; // -1 表示不针对特定章节
  private selectedMessages: Set<number> = new Set();

  // UI 元素
  private messagesContainer: HTMLElement;
  private inputContainer: HTMLElement;
  private inputTextarea: HTMLTextAreaElement;
  private chapterDropdown: DropdownComponent;
  private sendButton: HTMLButtonElement;
  private saveButton: HTMLButtonElement;

  constructor(
    app: App,
    settings: NovelCraftSettings,
    llmService: LLMService,
    analysisResult: AnalysisResult,
    bookPath: string,
    parsedBook?: ParsedBook
  ) {
    super(app);
    this.settings = settings;
    this.parsedBook = parsedBook;
    this.conversationManager = new ConversationManager(app, llmService);
    
    // 创建对话
    this.conversation = this.conversationManager.create(bookPath, analysisResult, parsedBook);
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('novel-craft-chat-panel');

    // 标题
    const bookTitle = this.conversation.analysisResult.bookInfo.title;
    contentEl.createEl('h2', { text: `💬 追问 - 《${bookTitle}》` });

    // 工具栏
    this.createToolbar(contentEl);

    // 消息列表
    this.createMessagesContainer(contentEl);

    // 输入区域
    this.createInputArea(contentEl);

    // 渲染初始消息
    this.renderMessages();
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  /**
   * 创建工具栏
   */
  private createToolbar(container: HTMLElement): void {
    const toolbar = container.createDiv({ cls: 'novel-craft-chat-toolbar' });

    // 章节选择器
    const chapterSelector = toolbar.createDiv({ cls: 'novel-craft-chapter-selector' });
    chapterSelector.createSpan({ text: '针对章节：', cls: 'novel-craft-chapter-label' });
    
    const dropdownContainer = chapterSelector.createDiv();
    new Setting(dropdownContainer)
      .addDropdown((dropdown: DropdownComponent) => {
        this.chapterDropdown = dropdown;
        dropdown.addOption('-1', '不限定章节');
        
        // 添加章节选项
        if (this.parsedBook) {
          for (const chapter of this.parsedBook.chapters) {
            dropdown.addOption(
              chapter.index.toString(),
              `第 ${chapter.index + 1} 章: ${this.truncateText(chapter.title, 20)}`
            );
          }
        } else if (this.conversation.analysisResult.chapterStructure) {
          for (const chapter of this.conversation.analysisResult.chapterStructure) {
            dropdown.addOption(
              chapter.index.toString(),
              `第 ${chapter.index + 1} 章: ${this.truncateText(chapter.title, 20)}`
            );
          }
        }

        dropdown.setValue('-1');
        dropdown.onChange((value: string) => {
          this.selectedChapter = parseInt(value, 10);
        });
      });

    // 保存按钮
    this.saveButton = toolbar.createEl('button', {
      text: '💾 保存到笔记',
      cls: 'novel-craft-save-button'
    });
    this.saveButton.addEventListener('click', () => this.saveToNote());
  }

  /**
   * 创建消息容器
   */
  private createMessagesContainer(container: HTMLElement): void {
    this.messagesContainer = container.createDiv({ cls: 'novel-craft-chat-messages' });
    
    // 添加欢迎消息
    if (this.conversation.messages.length === 0) {
      const welcomeDiv = this.messagesContainer.createDiv({ cls: 'novel-craft-chat-welcome' });
      welcomeDiv.createEl('p', { 
        text: '👋 分析已完成！您可以在这里对分析结果进行追问。'
      });
      welcomeDiv.createEl('p', { 
        text: '💡 提示：选择特定章节可以获得更精准的回答。',
        cls: 'novel-craft-chat-tip'
      });
    }
  }

  /**
   * 创建输入区域
   */
  private createInputArea(container: HTMLElement): void {
    this.inputContainer = container.createDiv({ cls: 'novel-craft-chat-input' });

    // 文本输入框
    this.inputTextarea = this.inputContainer.createEl('textarea', {
      cls: 'novel-craft-chat-textarea',
      attr: {
        placeholder: '输入您的问题...',
        rows: '3'
      }
    });

    // 监听 Enter 键发送（Shift+Enter 换行）
    this.inputTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });

    // 发送按钮
    const buttonContainer = this.inputContainer.createDiv({ cls: 'novel-craft-chat-buttons' });
    
    this.sendButton = buttonContainer.createEl('button', {
      text: '发送',
      cls: 'novel-craft-send-button mod-cta'
    });
    this.sendButton.addEventListener('click', () => this.sendMessage());
  }

  /**
   * 渲染消息列表
   */
  private renderMessages(): void {
    // 清除欢迎消息（如果有消息的话）
    if (this.conversation.messages.length > 0) {
      const welcome = this.messagesContainer.querySelector('.novel-craft-chat-welcome');
      if (welcome) {
        welcome.remove();
      }
    }

    // 清除现有消息
    const existingMessages = this.messagesContainer.querySelectorAll('.novel-craft-message');
    existingMessages.forEach(el => el.remove());

    // 渲染所有消息
    this.conversation.messages.forEach((msg, index) => {
      this.renderMessage(msg, index);
    });

    // 滚动到底部
    this.scrollToBottom();
  }

  /**
   * 渲染单条消息
   */
  private renderMessage(message: ChatMessage, index: number): void {
    const messageEl = this.messagesContainer.createDiv({
      cls: `novel-craft-message novel-craft-message-${message.role}`
    });

    // 消息头部
    const header = messageEl.createDiv({ cls: 'novel-craft-message-header' });
    
    // 选择框（用于保存）
    const checkbox = header.createEl('input', {
      type: 'checkbox',
      cls: 'novel-craft-message-checkbox'
    });
    checkbox.checked = this.selectedMessages.has(index);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        this.selectedMessages.add(index);
      } else {
        this.selectedMessages.delete(index);
      }
    });

    // 角色标签
    const roleLabel = message.role === 'user' ? '🙋 您' : '🤖 助手';
    header.createSpan({ text: roleLabel, cls: 'novel-craft-message-role' });

    // 消息内容
    const content = messageEl.createDiv({ cls: 'novel-craft-message-content' });
    content.innerHTML = this.formatMessageContent(message.content);
  }

  /**
   * 格式化消息内容（简单的 Markdown 支持）
   */
  private formatMessageContent(content: string): string {
    // 转义 HTML
    let formatted = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // 简单的 Markdown 格式化
    // 粗体
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 斜体
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
    // 代码
    formatted = formatted.replace(/`(.+?)`/g, '<code>$1</code>');
    // 换行
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  /**
   * 发送消息
   */
  private async sendMessage(): Promise<void> {
    const question = this.inputTextarea.value.trim();
    if (!question || this.isLoading) {
      return;
    }

    this.isLoading = true;
    this.sendButton.disabled = true;
    this.sendButton.textContent = '发送中...';
    this.inputTextarea.value = '';

    // 显示用户消息
    const userMessage: ChatMessage = {
      role: 'user',
      content: this.selectedChapter >= 0 
        ? `[关于第 ${this.selectedChapter + 1} 章]\n\n${question}`
        : question
    };
    
    // 临时添加用户消息到 UI
    const tempUserIndex = this.conversation.messages.length;
    this.conversation.messages.push(userMessage);
    this.renderMessage(userMessage, tempUserIndex);
    this.scrollToBottom();

    // 显示加载指示器
    const loadingEl = this.showLoadingIndicator();

    try {
      let response: string;
      
      if (this.selectedChapter >= 0) {
        // 针对特定章节追问
        // 移除临时添加的消息（ask 方法会自己添加）
        this.conversation.messages.pop();
        response = await this.conversationManager.askAboutChapter(
          this.conversation.id,
          this.selectedChapter,
          question
        );
      } else {
        // 一般追问
        // 移除临时添加的消息（ask 方法会自己添加）
        this.conversation.messages.pop();
        response = await this.conversationManager.ask(this.conversation.id, question);
      }

      // 更新对话引用
      this.conversation = this.conversationManager.getConversation(this.conversation.id)!;

      // 重新渲染消息
      this.renderMessages();

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '未知错误';
      handleError(error, '发送消息');

      // 移除临时添加的用户消息
      this.conversation.messages.pop();
      this.renderMessages();
    } finally {
      // 移除加载指示器
      loadingEl.remove();
      
      this.isLoading = false;
      this.sendButton.disabled = false;
      this.sendButton.textContent = '发送';
    }
  }

  /**
   * 显示加载指示器
   */
  private showLoadingIndicator(): HTMLElement {
    const loadingEl = this.messagesContainer.createDiv({ cls: 'novel-craft-message-loading' });
    loadingEl.createSpan({ text: '🤔 思考中...' });
    this.scrollToBottom();
    return loadingEl;
  }

  /**
   * 滚动到底部
   */
  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * 保存到笔记
   */
  private async saveToNote(): Promise<void> {
    try {
      // 获取选中的消息索引
      const selectedIndices = this.selectedMessages.size > 0
        ? Array.from(this.selectedMessages).sort((a, b) => a - b)
        : undefined;

      if (this.conversation.messages.length === 0) {
        showWarning('没有可保存的对话内容');
        return;
      }

      const savedPath = await this.conversationManager.saveToNote(
        this.conversation.id,
        selectedIndices
      );

      showSuccess(`对话已保存到: ${savedPath}`);
      
      // 清除选择
      this.selectedMessages.clear();
      this.renderMessages();

    } catch (error) {
      handleError(error, '保存对话');
    }
  }

  /**
   * 截断文本
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength) + '...';
  }

  /**
   * 获取对话 ID
   */
  getConversationId(): string {
    return this.conversation.id;
  }

  /**
   * 获取对话历史
   */
  getHistory(): ChatMessage[] {
    return this.conversationManager.getHistory(this.conversation.id);
  }
}
