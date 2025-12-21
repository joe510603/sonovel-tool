/**
 * ChatView - 追问对话视图（侧边栏）
 * 
 * 功能：
 * - 作为侧边栏视图，不阻塞文档操作
 * - 支持选择已有的分析结果文件夹
 * - 显示对话历史
 * - 流式响应显示
 * - 章节选择器
 * - 保存到笔记
 */

import { ItemView, WorkspaceLeaf, TFolder, TFile } from 'obsidian';
import {
  ChatMessage,
  AnalysisResult,
  ParsedBook,
  NovelCraftSettings
} from '../types';
import { LLMService } from '../services/LLMService';
import { showSuccess, showWarning, handleError } from './NotificationUtils';
import { getSystemPrompt } from '../services/PromptTemplates';

export const CHAT_VIEW_TYPE = 'novel-craft-chat-view';

/**
 * 从笔记文件加载的分析摘要
 */
interface LoadedAnalysisSummary {
  title: string;
  folderPath: string;
  synopsis: string;
  characters: string;
  techniques: string;
  takeaways: string;
}

export class ChatView extends ItemView {
  private settings: NovelCraftSettings;
  private llmService: LLMService;
  private analysisResult: AnalysisResult | null = null;
  private loadedSummary: LoadedAnalysisSummary | null = null;
  private parsedBook: ParsedBook | null = null;
  private bookPath: string = '';
  
  // 对话状态
  private messages: ChatMessage[] = [];
  private isLoading = false;
  private selectedChapter: number = -1;
  
  // UI 元素
  private mainContent: HTMLElement;
  private welcomeSection: HTMLElement;
  private chatSection: HTMLElement;
  private messagesContainer: HTMLElement;
  private inputTextarea: HTMLTextAreaElement;
  private sendButton: HTMLButtonElement;
  private statusEl: HTMLElement;

  constructor(
    leaf: WorkspaceLeaf,
    settings: NovelCraftSettings,
    llmService: LLMService
  ) {
    super(leaf);
    this.settings = settings;
    this.llmService = llmService;
  }

  getViewType(): string {
    return CHAT_VIEW_TYPE;
  }

  getDisplayText(): string {
    return '追问对话';
  }

  getIcon(): string {
    return 'message-circle';
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('nc-chat-view');

    this.mainContent = container.createDiv({ cls: 'nc-chat-content' });
    
    // 欢迎界面（包含分析结果选择器）
    this.welcomeSection = this.mainContent.createDiv({ cls: 'nc-welcome-section' });
    await this.createWelcomeSection();
    
    // 对话界面
    this.chatSection = this.mainContent.createDiv({ cls: 'nc-chat-section' });
    this.chatSection.style.display = 'none';
  }

  /**
   * 创建欢迎界面（包含分析结果选择器）
   */
  private async createWelcomeSection(): Promise<void> {
    this.welcomeSection.empty();
    
    this.welcomeSection.createEl('div', { text: '💬', cls: 'nc-welcome-icon' });
    this.welcomeSection.createEl('h3', { text: '追问对话', cls: 'nc-welcome-title' });
    
    // 获取已有的分析文件夹
    const analysisFolders = await this.getAnalysisFolders();
    
    if (analysisFolders.length > 0) {
      this.welcomeSection.createEl('p', { 
        text: '选择一本已分析的书籍开始对话：', 
        cls: 'nc-welcome-hint' 
      });
      
      // 创建选择列表
      const listContainer = this.welcomeSection.createDiv({ cls: 'nc-analysis-list' });
      
      for (const folder of analysisFolders) {
        const item = listContainer.createDiv({ cls: 'nc-analysis-item' });
        item.createSpan({ text: `📚 ${folder.name}`, cls: 'nc-analysis-name' });
        
        const selectBtn = item.createEl('button', {
          text: '选择',
          cls: 'nc-btn nc-btn-small nc-btn-primary'
        });
        selectBtn.addEventListener('click', () => this.loadAnalysisFromFolder(folder));
      }
      
      // 刷新按钮
      const refreshBtn = this.welcomeSection.createEl('button', {
        text: '🔄 刷新列表',
        cls: 'nc-btn nc-btn-small'
      });
      refreshBtn.style.marginTop = '12px';
      refreshBtn.addEventListener('click', () => this.createWelcomeSection());
    } else {
      this.welcomeSection.createEl('p', { 
        text: '暂无已分析的书籍，请先进行分析', 
        cls: 'nc-welcome-hint' 
      });
    }
  }


  /**
   * 获取已有的分析文件夹列表
   */
  private async getAnalysisFolders(): Promise<TFolder[]> {
    const folders: TFolder[] = [];
    const notesPath = this.settings.notesPath;
    
    const notesFolder = this.app.vault.getAbstractFileByPath(notesPath);
    if (!notesFolder || !(notesFolder instanceof TFolder)) {
      return folders;
    }
    
    // 遍历笔记目录下的子文件夹
    for (const child of notesFolder.children) {
      if (child instanceof TFolder) {
        // 检查是否包含分析笔记文件
        const hasOverview = child.children.some(
          f => f instanceof TFile && f.name === '00-概览.md'
        );
        if (hasOverview) {
          folders.push(child);
        }
      }
    }
    
    return folders;
  }

  /**
   * 从分析文件夹加载分析结果
   */
  private async loadAnalysisFromFolder(folder: TFolder): Promise<void> {
    try {
      const summary: LoadedAnalysisSummary = {
        title: folder.name,
        folderPath: folder.path,
        synopsis: '',
        characters: '',
        techniques: '',
        takeaways: ''
      };
      
      // 读取概览文件
      const overviewFile = this.app.vault.getAbstractFileByPath(`${folder.path}/00-概览.md`);
      if (overviewFile instanceof TFile) {
        const content = await this.app.vault.read(overviewFile);
        summary.synopsis = this.extractSection(content, '## 故事梗概', '##');
        summary.takeaways = this.extractSection(content, '## 可借鉴清单', '##');
      }
      
      // 读取人物图谱
      const characterFile = this.app.vault.getAbstractFileByPath(`${folder.path}/01-人物图谱.md`);
      if (characterFile instanceof TFile) {
        const content = await this.app.vault.read(characterFile);
        summary.characters = this.extractMainContent(content);
      }
      
      // 读取写作技法
      const techniqueFile = this.app.vault.getAbstractFileByPath(`${folder.path}/03-写作技法.md`);
      if (techniqueFile instanceof TFile) {
        const content = await this.app.vault.read(techniqueFile);
        summary.techniques = this.extractMainContent(content);
      }
      
      this.loadedSummary = summary;
      this.analysisResult = null; // 清除之前的分析结果
      this.parsedBook = null;
      this.messages = [];
      this.selectedChapter = -1;
      
      // 显示对话界面
      this.welcomeSection.style.display = 'none';
      this.chatSection.style.display = 'flex';
      
      // 重建对话界面
      this.chatSection.empty();
      this.createChatInterfaceFromSummary();
      
      showSuccess(`已加载《${folder.name}》的分析结果`);
    } catch (error) {
      handleError(error, '加载分析结果');
    }
  }


  /**
   * 从内容中提取指定章节
   */
  private extractSection(content: string, startMarker: string, endMarker: string): string {
    const startIndex = content.indexOf(startMarker);
    if (startIndex === -1) return '';
    
    const contentStart = startIndex + startMarker.length;
    const endIndex = content.indexOf(endMarker, contentStart);
    
    if (endIndex === -1) {
      return content.slice(contentStart).trim();
    }
    
    return content.slice(contentStart, endIndex).trim();
  }

  /**
   * 提取主要内容（跳过标题）
   */
  private extractMainContent(content: string): string {
    const lines = content.split('\n');
    // 跳过第一行标题
    const contentLines = lines.slice(1).filter(line => line.trim());
    // 限制长度
    return contentLines.slice(0, 50).join('\n');
  }

  /**
   * 设置分析结果以开始对话（从新分析）
   */
  setAnalysisResult(
    analysisResult: AnalysisResult,
    bookPath: string,
    parsedBook?: ParsedBook
  ): void {
    this.analysisResult = analysisResult;
    this.bookPath = bookPath;
    this.parsedBook = parsedBook || null;
    this.loadedSummary = null; // 清除加载的摘要
    this.messages = [];
    this.selectedChapter = -1;
    
    // 显示对话界面
    this.welcomeSection.style.display = 'none';
    this.chatSection.style.display = 'flex';
    
    // 重建对话界面
    this.chatSection.empty();
    this.createChatInterface();
  }

  /**
   * 检查是否有分析结果
   */
  hasAnalysisResult(): boolean {
    return this.analysisResult !== null || this.loadedSummary !== null;
  }

  /**
   * 创建对话界面（从新分析结果）
   */
  private createChatInterface(): void {
    if (!this.analysisResult) return;
    
    // 标题
    const header = this.chatSection.createDiv({ cls: 'nc-chat-header' });
    
    const titleRow = header.createDiv({ cls: 'nc-chat-title-row' });
    titleRow.createEl('h3', { 
      text: `💬 《${this.analysisResult.bookInfo.title}》`,
      cls: 'nc-chat-title'
    });
    
    // 返回按钮
    const backBtn = titleRow.createEl('button', {
      text: '← 返回',
      cls: 'nc-btn nc-btn-small'
    });
    backBtn.addEventListener('click', () => this.backToWelcome());
    
    // 工具栏
    this.createToolbar();
    
    // 消息区域
    this.messagesContainer = this.chatSection.createDiv({ cls: 'nc-chat-messages' });
    this.addWelcomeMessage();
    
    // 状态显示
    this.statusEl = this.chatSection.createDiv({ cls: 'nc-chat-status' });
    this.statusEl.style.display = 'none';
    
    // 输入区域
    this.createInputArea();
  }


  /**
   * 创建对话界面（从加载的摘要）
   */
  private createChatInterfaceFromSummary(): void {
    if (!this.loadedSummary) return;
    
    // 标题
    const header = this.chatSection.createDiv({ cls: 'nc-chat-header' });
    
    const titleRow = header.createDiv({ cls: 'nc-chat-title-row' });
    titleRow.createEl('h3', { 
      text: `💬 《${this.loadedSummary.title}》`,
      cls: 'nc-chat-title'
    });
    
    // 返回按钮
    const backBtn = titleRow.createEl('button', {
      text: '← 返回',
      cls: 'nc-btn nc-btn-small'
    });
    backBtn.addEventListener('click', () => this.backToWelcome());
    
    // 工具栏（简化版，无章节选择）
    this.createToolbarSimple();
    
    // 消息区域
    this.messagesContainer = this.chatSection.createDiv({ cls: 'nc-chat-messages' });
    this.addWelcomeMessageFromSummary();
    
    // 状态显示
    this.statusEl = this.chatSection.createDiv({ cls: 'nc-chat-status' });
    this.statusEl.style.display = 'none';
    
    // 输入区域
    this.createInputArea();
  }

  /**
   * 返回欢迎界面
   */
  private async backToWelcome(): Promise<void> {
    this.analysisResult = null;
    this.loadedSummary = null;
    this.parsedBook = null;
    this.messages = [];
    
    this.chatSection.style.display = 'none';
    this.welcomeSection.style.display = 'flex';
    
    await this.createWelcomeSection();
  }

  /**
   * 创建工具栏
   */
  private createToolbar(): void {
    const toolbar = this.chatSection.createDiv({ cls: 'nc-chat-toolbar' });
    
    // 章节选择
    const chapterSelect = toolbar.createDiv({ cls: 'nc-chapter-select' });
    chapterSelect.createSpan({ text: '章节：', cls: 'nc-select-label' });
    
    const select = chapterSelect.createEl('select', { cls: 'nc-select' }) as HTMLSelectElement;
    select.createEl('option', { value: '-1', text: '不限定' });
    
    if (this.parsedBook) {
      this.parsedBook.chapters.forEach((ch, i) => {
        select.createEl('option', { 
          value: i.toString(), 
          text: `第${i + 1}章: ${ch.title.slice(0, 15)}${ch.title.length > 15 ? '...' : ''}`
        });
      });
    }
    
    select.addEventListener('change', () => {
      this.selectedChapter = parseInt(select.value);
    });
    
    // 保存按钮
    const saveBtn = toolbar.createEl('button', { 
      text: '💾 保存', 
      cls: 'nc-btn nc-btn-small' 
    });
    saveBtn.addEventListener('click', () => this.saveToNote());
    
    // 清空按钮
    const clearBtn = toolbar.createEl('button', { 
      text: '🗑️ 清空', 
      cls: 'nc-btn nc-btn-small' 
    });
    clearBtn.addEventListener('click', () => this.clearChat());
  }

  /**
   * 创建简化工具栏（无章节选择）
   */
  private createToolbarSimple(): void {
    const toolbar = this.chatSection.createDiv({ cls: 'nc-chat-toolbar' });
    
    toolbar.createSpan({ text: '📖 基于已保存的分析结果', cls: 'nc-toolbar-hint' });
    
    // 保存按钮
    const saveBtn = toolbar.createEl('button', { 
      text: '💾 保存', 
      cls: 'nc-btn nc-btn-small' 
    });
    saveBtn.addEventListener('click', () => this.saveToNote());
    
    // 清空按钮
    const clearBtn = toolbar.createEl('button', { 
      text: '🗑️ 清空', 
      cls: 'nc-btn nc-btn-small' 
    });
    clearBtn.addEventListener('click', () => this.clearChat());
  }


  /**
   * 添加欢迎消息
   */
  private addWelcomeMessage(): void {
    const welcome = this.messagesContainer.createDiv({ cls: 'nc-chat-welcome-msg' });
    welcome.innerHTML = `
      <p>👋 分析已完成！您可以在这里对分析结果进行追问。</p>
      <p class="nc-hint">💡 提示：选择特定章节可以获得更精准的回答。</p>
      <p class="nc-hint">示例问题：</p>
      <ul class="nc-example-questions">
        <li>这本书的开局设计有什么特点？</li>
        <li>主角的人物弧光是如何设计的？</li>
        <li>有哪些值得学习的写作技法？</li>
      </ul>
    `;
  }

  /**
   * 添加欢迎消息（从加载的摘要）
   */
  private addWelcomeMessageFromSummary(): void {
    const welcome = this.messagesContainer.createDiv({ cls: 'nc-chat-welcome-msg' });
    welcome.innerHTML = `
      <p>👋 已加载《${this.loadedSummary?.title}》的分析结果！</p>
      <p class="nc-hint">💡 您可以基于之前的分析进行追问。</p>
      <p class="nc-hint">示例问题：</p>
      <ul class="nc-example-questions">
        <li>这本书的开局设计有什么特点？</li>
        <li>主角的人物弧光是如何设计的？</li>
        <li>有哪些值得学习的写作技法？</li>
      </ul>
    `;
  }

  /**
   * 创建输入区域
   */
  private createInputArea(): void {
    const inputArea = this.chatSection.createDiv({ cls: 'nc-chat-input-area' });
    
    this.inputTextarea = inputArea.createEl('textarea', {
      cls: 'nc-chat-textarea',
      attr: { placeholder: '输入您的问题...', rows: '3' }
    });
    
    this.inputTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    const btnArea = inputArea.createDiv({ cls: 'nc-chat-btn-area' });
    this.sendButton = btnArea.createEl('button', {
      text: '发送',
      cls: 'nc-btn nc-btn-primary'
    });
    this.sendButton.addEventListener('click', () => this.sendMessage());
  }

  /**
   * 发送消息
   */
  private async sendMessage(): Promise<void> {
    const question = this.inputTextarea.value.trim();
    if (!question || this.isLoading) return;
    if (!this.analysisResult && !this.loadedSummary) return;
    
    this.isLoading = true;
    this.sendButton.disabled = true;
    this.sendButton.textContent = '发送中...';
    this.inputTextarea.value = '';
    
    // 清除欢迎消息
    const welcomeMsg = this.messagesContainer.querySelector('.nc-chat-welcome-msg');
    if (welcomeMsg) welcomeMsg.remove();
    
    // 构建用户消息
    const userContent = this.selectedChapter >= 0
      ? `[关于第 ${this.selectedChapter + 1} 章]\n\n${question}`
      : question;
    
    const userMessage: ChatMessage = { role: 'user', content: userContent };
    this.messages.push(userMessage);
    this.renderMessage(userMessage);
    
    // 显示状态
    this.showStatus('🤔 正在思考...');
    
    // 创建助手消息占位
    const assistantMessage: ChatMessage = { role: 'assistant', content: '' };
    this.messages.push(assistantMessage);
    const assistantEl = this.renderMessage(assistantMessage);
    const contentEl = assistantEl.querySelector('.nc-message-content') as HTMLElement;
    
    try {
      // 构建上下文
      const contextMessages = this.buildContextMessages();
      
      // 使用流式响应
      let fullResponse = '';
      let charCount = 0;
      
      this.showStatus('📝 正在生成回答...');
      
      await this.llmService.chatStream(
        contextMessages,
        (chunk) => {
          fullResponse += chunk;
          charCount += chunk.length;
          assistantMessage.content = fullResponse;
          contentEl.innerHTML = this.formatMessageContent(fullResponse);
          this.scrollToBottom();
          this.showStatus(`📝 正在生成... (${charCount} 字)`);
        }
      );
      
      this.hideStatus();
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      assistantMessage.content = `❌ 发生错误: ${errorMsg}`;
      contentEl.innerHTML = this.formatMessageContent(assistantMessage.content);
      handleError(error, '发送消息');
      this.hideStatus();
    } finally {
      this.isLoading = false;
      this.sendButton.disabled = false;
      this.sendButton.textContent = '发送';
    }
  }


  /**
   * 构建上下文消息
   */
  private buildContextMessages(): ChatMessage[] {
    const systemPrompt = getSystemPrompt(this.settings.customPrompts);
    
    let analysisSummary: string;
    let bookTitle: string;
    
    if (this.analysisResult) {
      // 从新分析结果构建
      analysisSummary = this.buildAnalysisSummary();
      bookTitle = this.analysisResult.bookInfo.title;
    } else if (this.loadedSummary) {
      // 从加载的摘要构建
      analysisSummary = this.buildSummaryFromLoaded();
      bookTitle = this.loadedSummary.title;
    } else {
      return [];
    }
    
    // 章节内容（如果选择了特定章节且有书籍数据）
    let chapterContext = '';
    if (this.selectedChapter >= 0 && this.parsedBook) {
      const chapter = this.parsedBook.chapters[this.selectedChapter];
      if (chapter) {
        chapterContext = `\n\n【第 ${this.selectedChapter + 1} 章内容】\n${chapter.content.slice(0, 5000)}${chapter.content.length > 5000 ? '...(内容已截断)' : ''}`;
      }
    }
    
    const contextMessage: ChatMessage = {
      role: 'system',
      content: `${systemPrompt}\n\n你正在帮助用户分析小说《${bookTitle}》。\n\n【分析结果摘要】\n${analysisSummary}${chapterContext}\n\n请基于以上分析结果回答用户的问题。`
    };
    
    // 包含历史对话（最近5轮）
    const recentMessages = this.messages.slice(-10);
    
    return [contextMessage, ...recentMessages];
  }

  /**
   * 构建分析结果摘要（从新分析）
   */
  private buildAnalysisSummary(): string {
    if (!this.analysisResult) return '';
    
    const parts: string[] = [];
    
    if (this.analysisResult.synopsis) {
      parts.push(`【故事梗概】\n${this.analysisResult.synopsis.slice(0, 500)}...`);
    }
    
    if (this.analysisResult.characters.length > 0) {
      const chars = this.analysisResult.characters.slice(0, 5)
        .map(c => `- ${c.name}(${c.role}): ${c.description}`)
        .join('\n');
      parts.push(`【主要人物】\n${chars}`);
    }
    
    if (this.analysisResult.writingTechniques.length > 0) {
      const techs = this.analysisResult.writingTechniques.slice(0, 5)
        .map(t => `- ${t.name}: ${t.description}`)
        .join('\n');
      parts.push(`【写作技法】\n${techs}`);
    }
    
    if (this.analysisResult.takeaways.length > 0) {
      const takeaways = this.analysisResult.takeaways.slice(0, 5)
        .map((t, i) => `${i + 1}. ${t}`)
        .join('\n');
      parts.push(`【可借鉴清单】\n${takeaways}`);
    }
    
    return parts.join('\n\n');
  }

  /**
   * 从加载的摘要构建上下文
   */
  private buildSummaryFromLoaded(): string {
    if (!this.loadedSummary) return '';
    
    const parts: string[] = [];
    
    if (this.loadedSummary.synopsis) {
      parts.push(`【故事梗概】\n${this.loadedSummary.synopsis.slice(0, 1000)}`);
    }
    
    if (this.loadedSummary.characters) {
      parts.push(`【人物分析】\n${this.loadedSummary.characters.slice(0, 1500)}`);
    }
    
    if (this.loadedSummary.techniques) {
      parts.push(`【写作技法】\n${this.loadedSummary.techniques.slice(0, 1500)}`);
    }
    
    if (this.loadedSummary.takeaways) {
      parts.push(`【可借鉴清单】\n${this.loadedSummary.takeaways}`);
    }
    
    return parts.join('\n\n');
  }


  /**
   * 渲染消息
   */
  private renderMessage(message: ChatMessage): HTMLElement {
    const msgEl = this.messagesContainer.createDiv({
      cls: `nc-message nc-message-${message.role}`
    });
    
    const header = msgEl.createDiv({ cls: 'nc-message-header' });
    const roleLabel = message.role === 'user' ? '🙋 您' : '🤖 助手';
    header.createSpan({ text: roleLabel, cls: 'nc-message-role' });
    
    const content = msgEl.createDiv({ cls: 'nc-message-content' });
    content.innerHTML = this.formatMessageContent(message.content);
    
    this.scrollToBottom();
    return msgEl;
  }

  /**
   * 格式化消息内容
   */
  private formatMessageContent(content: string): string {
    if (!content) return '<span class="nc-typing">▊</span>';
    
    let formatted = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Markdown 格式化
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/\*(.+?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/`(.+?)`/g, '<code>$1</code>');
    formatted = formatted.replace(/\n/g, '<br>');
    
    return formatted;
  }

  /**
   * 显示状态
   */
  private showStatus(text: string): void {
    this.statusEl.textContent = text;
    this.statusEl.style.display = 'block';
  }

  /**
   * 隐藏状态
   */
  private hideStatus(): void {
    this.statusEl.style.display = 'none';
  }

  /**
   * 滚动到底部
   */
  private scrollToBottom(): void {
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /**
   * 清空对话
   */
  private clearChat(): void {
    this.messages = [];
    this.messagesContainer.empty();
    if (this.analysisResult) {
      this.addWelcomeMessage();
    } else if (this.loadedSummary) {
      this.addWelcomeMessageFromSummary();
    }
  }

  /**
   * 保存到笔记
   */
  private async saveToNote(): Promise<void> {
    if (this.messages.length === 0) {
      showWarning('没有可保存的对话内容');
      return;
    }
    
    try {
      const title = this.analysisResult?.bookInfo.title || this.loadedSummary?.title || '未知书籍';
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const fileName = `${this.settings.notesPath}/${title}/对话记录-${timestamp}.md`;
      
      // 构建内容
      let content = `# 《${title}》追问对话\n\n`;
      content += `> 保存时间: ${new Date().toLocaleString()}\n\n`;
      content += `---\n\n`;
      
      for (const msg of this.messages) {
        const role = msg.role === 'user' ? '**🙋 您**' : '**🤖 助手**';
        content += `${role}\n\n${msg.content}\n\n---\n\n`;
      }
      
      // 确保目录存在
      const folderPath = fileName.substring(0, fileName.lastIndexOf('/'));
      const folder = this.app.vault.getAbstractFileByPath(folderPath);
      if (!folder) {
        await this.app.vault.createFolder(folderPath);
      }
      
      // 创建文件
      await this.app.vault.create(fileName, content);
      showSuccess(`对话已保存到: ${fileName}`);
      
    } catch (error) {
      handleError(error, '保存对话');
    }
  }

  async onClose(): Promise<void> {
    // 清理
  }
}
