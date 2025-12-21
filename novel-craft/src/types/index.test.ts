import * as fc from 'fast-check';
import {
  DEFAULT_SETTINGS,
  DEFAULT_PROVIDERS,
  NovelCraftSettings,
  LLMProvider,
  AnalysisMode,
  NovelType
} from './index';

describe('NovelCraft Types', () => {
  describe('DEFAULT_SETTINGS', () => {
    it('should have valid default values', () => {
      expect(DEFAULT_SETTINGS.sonovelUrl).toBe('http://localhost:7765');
      expect(DEFAULT_SETTINGS.downloadPath).toBe('NovelCraft/downloads');
      expect(DEFAULT_SETTINGS.notesPath).toBe('NovelCraft/notes');
      expect(DEFAULT_SETTINGS.defaultAnalysisMode).toBe('standard');
      expect(DEFAULT_SETTINGS.defaultNovelType).toBe('fantasy');
      expect(DEFAULT_SETTINGS.llmProviders).toEqual([]);
      expect(DEFAULT_SETTINGS.defaultProviderId).toBe('');
    });
  });

  describe('DEFAULT_PROVIDERS', () => {
    it('should include Deepseek and OpenAI', () => {
      expect(DEFAULT_PROVIDERS).toHaveLength(2);
      
      const deepseek = DEFAULT_PROVIDERS.find(p => p.id === 'deepseek');
      expect(deepseek).toBeDefined();
      expect(deepseek?.name).toBe('Deepseek');
      expect(deepseek?.baseUrl).toBe('https://api.deepseek.com/v1');
      
      const openai = DEFAULT_PROVIDERS.find(p => p.id === 'openai');
      expect(openai).toBeDefined();
      expect(openai?.name).toBe('OpenAI');
      expect(openai?.baseUrl).toBe('https://api.openai.com/v1');
    });
  });

  describe('Property-based tests with fast-check', () => {
    it('should verify settings structure is consistent', () => {
      fc.assert(
        fc.property(
          fc.record({
            sonovelUrl: fc.webUrl(),
            downloadPath: fc.string({ minLength: 1 }),
            notesPath: fc.string({ minLength: 1 }),
            defaultAnalysisMode: fc.constantFrom<AnalysisMode>('quick', 'standard', 'deep'),
            defaultNovelType: fc.constantFrom<NovelType>('urban', 'alternate-history', 'fantasy', 'custom'),
            llmProviders: fc.array(
              fc.record({
                id: fc.string({ minLength: 1 }),
                name: fc.string({ minLength: 1 }),
                baseUrl: fc.webUrl(),
                apiKey: fc.string(),
                model: fc.string({ minLength: 1 })
              })
            ),
            defaultProviderId: fc.string(),
            customPrompts: fc.record({}),
            customTypePrompts: fc.record({}),
            tokenUsageRecords: fc.array(fc.record({
              timestamp: fc.nat(),
              stage: fc.string(),
              providerId: fc.string(),
              model: fc.string(),
              usage: fc.record({
                promptTokens: fc.nat(),
                completionTokens: fc.nat(),
                totalTokens: fc.nat()
              })
            }))
          }),
          (settings: NovelCraftSettings) => {
            // Verify all required fields exist
            expect(settings.sonovelUrl).toBeDefined();
            expect(settings.downloadPath).toBeDefined();
            expect(settings.notesPath).toBeDefined();
            expect(settings.defaultAnalysisMode).toBeDefined();
            expect(settings.defaultNovelType).toBeDefined();
            expect(settings.llmProviders).toBeDefined();
            expect(Array.isArray(settings.llmProviders)).toBe(true);
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
