import { LLMProvider, ChatMessage, NovelCraftSettings, TokenUsage } from '../types';

/**
 * LLM 响应结果（包含 Token 使用信息）
 */
export interface LLMResponse {
  content: string;
  usage?: TokenUsage;
}

/**
 * LLMService - 统一的 LLM 调用接口
 * 支持多种 API 服务（Deepseek、OpenAI 等兼容 OpenAI API 格式的服务）
 */
export class LLMService {
  private providers: LLMProvider[] = [];
  private defaultProviderId: string = '';
  private onSettingsChange?: (providers: LLMProvider[], defaultId: string) => void;
  private onTokenUsage?: (usage: TokenUsage, providerId: string, model: string) => void;

  constructor(settings?: NovelCraftSettings) {
    if (settings) {
      this.providers = [...settings.llmProviders];
      this.defaultProviderId = settings.defaultProviderId;
    }
  }

  /**
   * 设置配置变更回调
   */
  setOnSettingsChange(callback: (providers: LLMProvider[], defaultId: string) => void): void {
    this.onSettingsChange = callback;
  }

  /**
   * 设置 Token 使用回调
   */
  setOnTokenUsage(callback: (usage: TokenUsage, providerId: string, model: string) => void): void {
    this.onTokenUsage = callback;
  }

  /**
   * 从设置加载 providers
   */
  loadFromSettings(settings: NovelCraftSettings): void {
    this.providers = [...settings.llmProviders];
    this.defaultProviderId = settings.defaultProviderId;
  }

  /**
   * 获取所有已配置的 provider
   */
  getProviders(): LLMProvider[] {
    return [...this.providers];
  }

  /**
   * 根据 ID 获取 provider
   */
  getProvider(id: string): LLMProvider | undefined {
    return this.providers.find(p => p.id === id);
  }

  /**
   * 获取默认 provider
   */
  getDefaultProvider(): LLMProvider | undefined {
    if (!this.defaultProviderId) {
      return this.providers[0];
    }
    return this.providers.find(p => p.id === this.defaultProviderId) || this.providers[0];
  }

  /**
   * 获取默认 provider ID
   */
  getDefaultProviderId(): string {
    return this.defaultProviderId;
  }

  /**
   * 添加新的 provider
   */
  addProvider(provider: LLMProvider): void {
    // 验证必需字段
    if (!provider.id || !provider.name || !provider.baseUrl || !provider.model) {
      throw new Error('Provider 配置不完整：需要 id、name、baseUrl 和 model');
    }

    // 检查 ID 是否已存在
    if (this.providers.some(p => p.id === provider.id)) {
      throw new Error(`Provider ID "${provider.id}" 已存在`);
    }

    this.providers.push({ ...provider });
    
    // 如果是第一个 provider，设为默认
    if (this.providers.length === 1) {
      this.defaultProviderId = provider.id;
    }

    this.notifySettingsChange();
  }

  /**
   * 更新已有的 provider
   */
  updateProvider(id: string, updates: Partial<LLMProvider>): void {
    const index = this.providers.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error(`Provider "${id}" 不存在`);
    }

    // 如果更新了 ID，检查新 ID 是否冲突
    if (updates.id && updates.id !== id && this.providers.some(p => p.id === updates.id)) {
      throw new Error(`Provider ID "${updates.id}" 已存在`);
    }

    this.providers[index] = { ...this.providers[index], ...updates };

    // 如果更新了默认 provider 的 ID，同步更新 defaultProviderId
    if (updates.id && this.defaultProviderId === id) {
      this.defaultProviderId = updates.id;
    }

    this.notifySettingsChange();
  }

  /**
   * 删除 provider
   */
  removeProvider(id: string): void {
    const index = this.providers.findIndex(p => p.id === id);
    if (index === -1) {
      throw new Error(`Provider "${id}" 不存在`);
    }

    this.providers.splice(index, 1);

    // 如果删除的是默认 provider，重新设置默认
    if (this.defaultProviderId === id) {
      this.defaultProviderId = this.providers[0]?.id || '';
    }

    this.notifySettingsChange();
  }

  /**
   * 设置默认 provider
   */
  setDefaultProvider(id: string): void {
    if (!this.providers.some(p => p.id === id)) {
      throw new Error(`Provider "${id}" 不存在`);
    }

    this.defaultProviderId = id;
    this.notifySettingsChange();
  }


  /**
   * 验证 provider 配置是否有效
   * 通过发送测试请求验证 API 连接
   */
  async validateProvider(provider: LLMProvider): Promise<boolean> {
    // 基本字段验证
    if (!provider.apiKey || provider.apiKey.trim() === '') {
      return false;
    }

    if (!provider.baseUrl || provider.baseUrl.trim() === '') {
      return false;
    }

    if (!provider.model || provider.model.trim() === '') {
      return false;
    }

    try {
      // 发送简单的测试请求
      const response = await fetch(`${this.normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${provider.apiKey}`
        },
        body: JSON.stringify({
          model: provider.model,
          messages: [{ role: 'user', content: 'Hi' }],
          max_tokens: 5
        }),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * 发送聊天请求
   * @param messages 消息列表
   * @param providerId 可选的 provider ID，不指定则使用默认
   * @returns 响应内容
   */
  async chat(messages: ChatMessage[], providerId?: string): Promise<string> {
    const result = await this.chatWithUsage(messages, providerId);
    return result.content;
  }

  /**
   * 发送聊天请求（返回包含 Token 使用信息）
   * @param messages 消息列表
   * @param providerId 可选的 provider ID，不指定则使用默认
   * @returns 响应内容和 Token 使用信息
   */
  async chatWithUsage(messages: ChatMessage[], providerId?: string): Promise<LLMResponse> {
    const provider = this.resolveProvider(providerId);
    
    const response = await fetch(`${this.normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`LLM 请求失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
    }

    const data = await response.json();
    const content = this.extractResponseContent(data);
    const usage = this.extractTokenUsage(data);
    
    // 触发 Token 使用回调
    if (usage && this.onTokenUsage) {
      this.onTokenUsage(usage, provider.id, provider.model);
    }
    
    return { content, usage };
  }

  /**
   * 从响应中提取 Token 使用信息
   */
  private extractTokenUsage(data: unknown): TokenUsage | undefined {
    if (!data || typeof data !== 'object') return undefined;
    
    const response = data as Record<string, unknown>;
    const usage = response.usage as Record<string, number> | undefined;
    
    if (!usage) return undefined;
    
    return {
      promptTokens: usage.prompt_tokens || 0,
      completionTokens: usage.completion_tokens || 0,
      totalTokens: usage.total_tokens || 0
    };
  }

  /**
   * 流式聊天请求
   * @param messages 消息列表
   * @param onChunk 收到数据块时的回调
   * @param providerId 可选的 provider ID
   */
  async chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
    providerId?: string
  ): Promise<void> {
    const provider = this.resolveProvider(providerId);

    const response = await fetch(`${this.normalizeBaseUrl(provider.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${provider.apiKey}`
      },
      body: JSON.stringify({
        model: provider.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      throw new Error(`LLM 流式请求失败: ${response.status} ${response.statusText}${errorText ? ` - ${errorText}` : ''}`);
    }

    if (!response.body) {
      throw new Error('响应体为空');
    }

    await this.processStreamResponse(response.body, onChunk);
  }

  /**
   * 处理流式响应
   */
  private async processStreamResponse(
    body: ReadableStream<Uint8Array>,
    onChunk: (chunk: string) => void
  ): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              onChunk(content);
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 解析 provider，如果未指定则使用默认
   */
  private resolveProvider(providerId?: string): LLMProvider {
    let provider: LLMProvider | undefined;

    if (providerId) {
      provider = this.getProvider(providerId);
      if (!provider) {
        throw new Error(`Provider "${providerId}" 不存在`);
      }
    } else {
      provider = this.getDefaultProvider();
      if (!provider) {
        throw new Error('没有配置任何 LLM 服务');
      }
    }

    if (!provider.apiKey) {
      throw new Error(`Provider "${provider.name}" 未配置 API Key`);
    }

    return provider;
  }

  /**
   * 标准化 base URL
   */
  private normalizeBaseUrl(url: string): string {
    return url.replace(/\/+$/, '');
  }

  /**
   * 从响应中提取内容
   */
  private extractResponseContent(data: unknown): string {
    if (!data || typeof data !== 'object') {
      throw new Error('无效的响应格式');
    }

    const response = data as Record<string, unknown>;
    const choices = response.choices;

    if (!Array.isArray(choices) || choices.length === 0) {
      throw new Error('响应中没有 choices');
    }

    const firstChoice = choices[0] as Record<string, unknown>;
    const message = firstChoice.message as Record<string, unknown> | undefined;

    if (!message || typeof message.content !== 'string') {
      throw new Error('无法提取响应内容');
    }

    return message.content;
  }

  /**
   * 通知设置变更
   */
  private notifySettingsChange(): void {
    this.onSettingsChange?.(this.getProviders(), this.defaultProviderId);
  }

  /**
   * 清理资源
   */
  destroy(): void {
    this.providers = [];
    this.defaultProviderId = '';
    this.onSettingsChange = undefined;
  }
}
