import { App } from 'obsidian';
import { UserGuidanceService, GuideStepType, GuideFlow, GuideStep, TipConfig } from './UserGuidanceService';
import { showInfo, showSuccess } from '../ui/NotificationUtils';

// Mock Obsidian App
const mockApp = {
  vault: {
    adapter: {
      write: jest.fn(),
      remove: jest.fn()
    }
  }
} as unknown as App;

// Mock the notification utilities
jest.mock('../ui/NotificationUtils', () => ({
  showInfo: jest.fn(),
  showSuccess: jest.fn(),
  showWarning: jest.fn(),
  showError: jest.fn()
}));

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn()
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock DOM methods
Object.defineProperty(document, 'querySelector', {
  value: jest.fn(),
  writable: true
});

Object.defineProperty(document, 'querySelectorAll', {
  value: jest.fn(() => []),
  writable: true
});

describe('UserGuidanceService', () => {
  let guidanceService: UserGuidanceService;

  beforeEach(() => {
    guidanceService = new UserGuidanceService(mockApp);
    jest.clearAllMocks();
    localStorageMock.getItem.mockReturnValue(null);
  });

  afterEach(() => {
    guidanceService.destroy();
  });

  describe('Guide Flow Management', () => {
    it('should register guide flows correctly', () => {
      const testFlow: GuideFlow = {
        id: 'test-flow',
        name: 'Test Flow',
        description: 'A test guide flow',
        steps: [
          {
            id: 'step1',
            type: GuideStepType.MODAL,
            title: 'Step 1',
            content: 'First step content'
          }
        ]
      };

      guidanceService.registerGuideFlow(testFlow);
      
      const availableGuides = guidanceService.getAvailableGuides();
      expect(availableGuides).toHaveLength(3); // 2 default + 1 test
      expect(availableGuides.some(g => g.id === 'test-flow')).toBe(true);
    });

    it('should not start completed guide flows', async () => {
      // Mock completed flow
      localStorageMock.getItem.mockReturnValue(JSON.stringify({
        completedFlows: ['interactive-marking-intro'],
        skippedFlows: [],
        preferences: { showTips: true, autoStartGuides: true, skipAnimations: false }
      }));

      const newService = new UserGuidanceService(mockApp);
      await newService.startGuideFlow('interactive-marking-intro');
      
      // Should not start because it's completed
      expect(showSuccess).not.toHaveBeenCalled();
      
      newService.destroy();
    });

    it('should not start skipped guide flows', async () => {
      // Mock skipped flow
      localStorageMock.getItem.mockReturnValue(JSON.stringify({
        completedFlows: [],
        skippedFlows: ['interactive-marking-intro'],
        preferences: { showTips: true, autoStartGuides: true, skipAnimations: false }
      }));

      const newService = new UserGuidanceService(mockApp);
      await newService.startGuideFlow('interactive-marking-intro');
      
      // Should not start because it's skipped
      expect(showSuccess).not.toHaveBeenCalled();
      
      newService.destroy();
    });

    it('should skip guide flow correctly', async () => {
      const testFlow: GuideFlow = {
        id: 'test-flow',
        name: 'Test Flow',
        description: 'A test guide flow',
        steps: [
          {
            id: 'step1',
            type: GuideStepType.MODAL,
            title: 'Step 1',
            content: 'First step content'
          }
        ],
        onSkip: jest.fn()
      };

      guidanceService.registerGuideFlow(testFlow);
      await guidanceService.startGuideFlow('test-flow');
      await guidanceService.skipGuideFlow();
      
      expect(testFlow.onSkip).toHaveBeenCalled();
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should complete guide flow correctly', async () => {
      const testFlow: GuideFlow = {
        id: 'test-flow',
        name: 'Test Flow',
        description: 'A test guide flow',
        steps: [], // Empty steps to trigger completion
        onComplete: jest.fn()
      };

      guidanceService.registerGuideFlow(testFlow);
      await guidanceService.startGuideFlow('test-flow');
      
      expect(testFlow.onComplete).toHaveBeenCalled();
      expect(showSuccess).toHaveBeenCalledWith(expect.stringContaining('完成引导'));
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe('Guide Step Handling', () => {
    it('should handle modal steps', async () => {
      const testFlow: GuideFlow = {
        id: 'test-flow',
        name: 'Test Flow',
        description: 'A test guide flow',
        steps: [
          {
            id: 'modal-step',
            type: GuideStepType.MODAL,
            title: 'Modal Step',
            content: 'Modal content'
          }
        ]
      };

      guidanceService.registerGuideFlow(testFlow);
      await guidanceService.startGuideFlow('test-flow');
      
      // Modal should be created - verify by checking if the guide is active
      // The flow is started and modal step is shown
      // We can verify by completing the flow and checking localStorage is called
      await guidanceService.nextStep(); // Complete the modal step
      
      // After completing all steps, localStorage should be called
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should handle tooltip steps with target element', async () => {
      // Mock target element
      const mockElement = document.createElement('div');
      mockElement.getBoundingClientRect = jest.fn().mockReturnValue({
        left: 100,
        top: 100,
        width: 200,
        height: 50,
        right: 300,
        bottom: 150
      });
      
      (document.querySelector as jest.Mock).mockReturnValue(mockElement);

      const testFlow: GuideFlow = {
        id: 'test-flow',
        name: 'Test Flow',
        description: 'A test guide flow',
        steps: [
          {
            id: 'tooltip-step',
            type: GuideStepType.TOOLTIP,
            title: 'Tooltip Step',
            content: 'Tooltip content',
            targetSelector: '.test-target'
          }
        ]
      };

      guidanceService.registerGuideFlow(testFlow);
      await guidanceService.startGuideFlow('test-flow');
      
      expect(document.querySelector).toHaveBeenCalledWith('.test-target');
    });

    it('should skip steps when target element not found', async () => {
      (document.querySelector as jest.Mock).mockReturnValue(null);

      const testFlow: GuideFlow = {
        id: 'test-flow',
        name: 'Test Flow',
        description: 'A test guide flow',
        steps: [
          {
            id: 'tooltip-step',
            type: GuideStepType.TOOLTIP,
            title: 'Tooltip Step',
            content: 'Tooltip content',
            targetSelector: '.non-existent-target'
          }
        ]
      };

      guidanceService.registerGuideFlow(testFlow);
      await guidanceService.startGuideFlow('test-flow');
      
      // Should complete the flow since step was skipped
      expect(showSuccess).toHaveBeenCalledWith(expect.stringContaining('完成引导'));
    });

    it('should skip steps when condition is not met', async () => {
      const testFlow: GuideFlow = {
        id: 'test-flow',
        name: 'Test Flow',
        description: 'A test guide flow',
        steps: [
          {
            id: 'conditional-step',
            type: GuideStepType.MODAL,
            title: 'Conditional Step',
            content: 'This step should be skipped',
            condition: () => false // Condition not met
          }
        ]
      };

      guidanceService.registerGuideFlow(testFlow);
      await guidanceService.startGuideFlow('test-flow');
      
      // Should complete the flow since step was skipped
      expect(showSuccess).toHaveBeenCalledWith(expect.stringContaining('完成引导'));
    });
  });

  describe('Tip System', () => {
    it('should register tips correctly', () => {
      const testTip: TipConfig = {
        id: 'test-tip',
        message: 'Test tip message',
        type: 'info',
        condition: () => true,
        dismissible: true,
        showOnce: false
      };

      guidanceService.registerTip(testTip);
      guidanceService.checkAndShowTips();
      
      expect(showInfo).toHaveBeenCalledWith('Test tip message');
    });

    it('should not show tips when preferences disabled', () => {
      guidanceService.updatePreferences({ showTips: false });
      
      const testTip: TipConfig = {
        id: 'test-tip',
        message: 'Test tip message',
        type: 'info',
        condition: () => true,
        dismissible: true,
        showOnce: false
      };

      guidanceService.registerTip(testTip);
      guidanceService.checkAndShowTips();
      
      expect(showInfo).not.toHaveBeenCalled();
    });

    it('should show tips only once when showOnce is true', () => {
      const testTip: TipConfig = {
        id: 'test-tip',
        message: 'Test tip message',
        type: 'info',
        condition: () => true,
        dismissible: true,
        showOnce: true
      };

      guidanceService.registerTip(testTip);
      
      // First call should show tip
      guidanceService.checkAndShowTips();
      expect(showInfo).toHaveBeenCalledWith('Test tip message');
      
      // Second call should not show tip
      jest.clearAllMocks();
      guidanceService.checkAndShowTips();
      expect(showInfo).not.toHaveBeenCalled();
    });

    it('should not show tips when condition is false', () => {
      const testTip: TipConfig = {
        id: 'test-tip',
        message: 'Test tip message',
        type: 'info',
        condition: () => false, // Condition not met
        dismissible: true,
        showOnce: false
      };

      guidanceService.registerTip(testTip);
      guidanceService.checkAndShowTips();
      
      expect(showInfo).not.toHaveBeenCalled();
    });

    it('should handle tips with actions', () => {
      const actionCallback = jest.fn();
      const testTip: TipConfig = {
        id: 'test-tip',
        message: 'Test tip message',
        type: 'info',
        condition: () => true,
        action: {
          text: '立即执行',
          callback: actionCallback
        },
        dismissible: true,
        showOnce: false
      };

      guidanceService.registerTip(testTip);
      guidanceService.checkAndShowTips();
      
      expect(showInfo).toHaveBeenCalledWith('Test tip message 立即执行');
    });
  });

  describe('User Preferences', () => {
    it('should update preferences correctly', () => {
      const newPreferences = {
        showTips: false,
        autoStartGuides: false,
        skipAnimations: true
      };

      guidanceService.updatePreferences(newPreferences);
      
      const preferences = guidanceService.getPreferences();
      expect(preferences.showTips).toBe(false);
      expect(preferences.autoStartGuides).toBe(false);
      expect(preferences.skipAnimations).toBe(true);
      
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });

    it('should return current preferences', () => {
      const preferences = guidanceService.getPreferences();
      
      expect(preferences).toHaveProperty('showTips');
      expect(preferences).toHaveProperty('autoStartGuides');
      expect(preferences).toHaveProperty('skipAnimations');
    });

    it('should reset progress correctly', () => {
      guidanceService.resetProgress();
      
      const preferences = guidanceService.getPreferences();
      expect(preferences.showTips).toBe(true);
      expect(preferences.autoStartGuides).toBe(true);
      expect(preferences.skipAnimations).toBe(false);
      
      expect(localStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe('Auto-Start Functionality', () => {
    it('should respect auto-start preference', () => {
      guidanceService.updatePreferences({ autoStartGuides: false });
      
      expect(guidanceService.shouldAutoStartGuides()).toBe(false);
    });

    it('should trigger guide check when auto-start enabled', () => {
      guidanceService.updatePreferences({ autoStartGuides: true });
      
      expect(guidanceService.shouldAutoStartGuides()).toBe(true);
      
      // triggerGuideCheck should not throw errors
      expect(() => guidanceService.triggerGuideCheck()).not.toThrow();
    });

    it('should get available guides correctly', () => {
      const availableGuides = guidanceService.getAvailableGuides();
      
      expect(Array.isArray(availableGuides)).toBe(true);
      expect(availableGuides.length).toBeGreaterThan(0);
      
      // Should include default guides
      expect(availableGuides.some(g => g.id === 'interactive-marking-intro')).toBe(true);
      expect(availableGuides.some(g => g.id === 'ai-analysis-intro')).toBe(true);
    });
  });

  describe('Data Persistence', () => {
    it('should save user progress to localStorage', async () => {
      const testFlow: GuideFlow = {
        id: 'test-flow',
        name: 'Test Flow',
        description: 'A test guide flow',
        steps: []
      };

      guidanceService.registerGuideFlow(testFlow);
      await guidanceService.startGuideFlow('test-flow');
      
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'novelcraft-user-guidance',
        expect.stringContaining('test-flow')
      );
    });

    it('should load user progress from localStorage', () => {
      const mockData = {
        completedFlows: ['flow1', 'flow2'],
        skippedFlows: ['flow3'],
        preferences: {
          showTips: false,
          autoStartGuides: false,
          skipAnimations: true
        }
      };

      localStorageMock.getItem.mockReturnValue(JSON.stringify(mockData));
      
      const newService = new UserGuidanceService(mockApp);
      const preferences = newService.getPreferences();
      
      expect(preferences.showTips).toBe(false);
      expect(preferences.autoStartGuides).toBe(false);
      expect(preferences.skipAnimations).toBe(true);
      
      newService.destroy();
    });

    it('should handle corrupted localStorage data gracefully', () => {
      localStorageMock.getItem.mockReturnValue('invalid json');
      
      expect(() => new UserGuidanceService(mockApp)).not.toThrow();
      
      const service = new UserGuidanceService(mockApp);
      const preferences = service.getPreferences();
      
      // Should use default preferences
      expect(preferences.showTips).toBe(true);
      expect(preferences.autoStartGuides).toBe(true);
      expect(preferences.skipAnimations).toBe(false);
      
      service.destroy();
    });
  });

  describe('Default Guides and Tips', () => {
    it('should initialize with default guides', () => {
      const availableGuides = guidanceService.getAvailableGuides();
      
      expect(availableGuides.some(g => g.id === 'interactive-marking-intro')).toBe(true);
      expect(availableGuides.some(g => g.id === 'ai-analysis-intro')).toBe(true);
    });

    it('should have proper guide structure', () => {
      const availableGuides = guidanceService.getAvailableGuides();
      const markingGuide = availableGuides.find(g => g.id === 'interactive-marking-intro');
      
      expect(markingGuide).toBeDefined();
      expect(markingGuide!.name).toBe('交互式标记入门');
      expect(markingGuide!.steps.length).toBeGreaterThan(0);
      expect(markingGuide!.steps[0].type).toBe(GuideStepType.MODAL);
    });

    it('should register default tips', () => {
      // Mock DOM elements for tip conditions
      const mockPanel = document.createElement('div');
      mockPanel.style.display = 'block';
      (document.querySelector as jest.Mock).mockReturnValue(mockPanel);
      
      guidanceService.checkAndShowTips();
      
      // Should not throw errors even if tips don't trigger
      expect(() => guidanceService.checkAndShowTips()).not.toThrow();
    });
  });

  describe('Cleanup and Destruction', () => {
    it('should clean up DOM elements on destroy', () => {
      const mockElements = [
        document.createElement('div'),
        document.createElement('div')
      ];
      
      (document.querySelectorAll as jest.Mock).mockReturnValue(mockElements);
      mockElements.forEach(el => {
        el.remove = jest.fn();
      });
      
      guidanceService.destroy();
      
      expect(document.querySelectorAll).toHaveBeenCalledWith(
        '.nc-guide-tooltip, .nc-guide-highlight, .nc-guide-overlay'
      );
    });

    it('should clear internal state on destroy', () => {
      guidanceService.destroy();
      
      // Should not throw errors after destruction
      expect(() => guidanceService.checkAndShowTips()).not.toThrow();
      expect(() => guidanceService.triggerGuideCheck()).not.toThrow();
    });
  });
});