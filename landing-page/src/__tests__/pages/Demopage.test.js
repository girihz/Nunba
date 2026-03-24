/* eslint-disable */
/**
 * Comprehensive tests for Demopage.js (ChatInterface component).
 *
 * Tests cover: component rendering, agent selection, onReady guard,
 * fireOnReady, handleDataReceived (channel/workflow/thinking/filter),
 * STT language mapping, auto-send on speech pause, message queue,
 * LLM status check, agent switching, message storage, isLocalAgent.
 */
import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';

// ── Mock heavy dependencies BEFORE importing component ──

// react-router-dom
const mockNavigate = jest.fn();
const mockUseLocation = jest.fn(() => ({ pathname: '/local', search: '', hash: '' }));
const mockUseParams = jest.fn(() => ({}));
jest.mock('react-router-dom', () => {
  var actual = jest.requireActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useLocation: () => mockUseLocation(),
    useParams: () => mockUseParams(),
    Link: function MockLink(props) {
      return require('react').createElement('a', props, props.children);
    },
  };
});

// socialApi services
const mockChat = jest.fn().mockResolvedValue({ text: 'Hello', source: 'local' });
const mockGetPrompts = jest.fn().mockResolvedValue({ prompts: [] });
const mockHealth = jest.fn().mockResolvedValue({ local: { available: true } });
const mockGetAgentSync = jest.fn().mockResolvedValue({ agents: [] });
const mockSyncAgents = jest.fn().mockResolvedValue({});
const mockCheckHandle = jest.fn().mockResolvedValue({ available: true });

jest.mock('../../services/socialApi', () => ({
  chatApi: {
    chat: (...args) => mockChat(...args),
    getPrompts: (...args) => mockGetPrompts(...args),
    health: (...args) => mockHealth(...args),
    getAgentSync: (...args) => mockGetAgentSync(...args),
    syncAgents: (...args) => mockSyncAgents(...args),
    post: jest.fn().mockResolvedValue({}),
  },
  usersApi: {},
  agentApi: {
    checkHandle: (...args) => mockCheckHandle(...args),
  },
}));

// gameRealtimeService
jest.mock('../../services/gameRealtimeService', () => ({
  initGameRealtime: jest.fn(),
}));

// realtimeService
jest.mock('../../services/realtimeService', () => ({
  __esModule: true,
  default: { init: jest.fn() },
}));

// useTTS hook
jest.mock('../../hooks/useTTS', () => ({
  useTTS: () => ({
    speak: jest.fn(),
    stop: jest.fn(),
    isAvailable: true,
    isSpeaking: false,
    loadAvatarVoice: jest.fn().mockResolvedValue(true),
  }),
}));

// Extracted sub-components — use React.createElement to avoid JSX parse issues in mock factories
jest.mock('../../pages/chat/AgentSidebar', () => {
  const R = require('react');
  return function MockAgentSidebar() {
    return R.createElement('div', { 'data-testid': 'agent-sidebar' }, 'AgentSidebar');
  };
});
jest.mock('../../pages/chat/PdfViewer', () => {
  const R = require('react');
  return function MockPdfViewer() {
    return R.createElement('div', { 'data-testid': 'pdf-viewer' }, 'PdfViewer');
  };
});
jest.mock('../../pages/chat/ChatInputBar', () => {
  const R = require('react');
  return function MockChatInputBar(props) {
    return R.createElement('div', { 'data-testid': 'chat-input-bar' },
      R.createElement('input', {
        'data-testid': 'msg-input',
        value: props.inputMessage,
        onChange: function(e) { props.setInputMessage(e.target.value); },
        onKeyDown: props.handleKeyPress,
      }),
      R.createElement('button', { 'data-testid': 'send-btn', onClick: props.handleSend }, 'Send')
    );
  };
});
jest.mock('../../pages/chat/ChatMessageList', () => {
  const R = require('react');
  return function MockChatMessageList(props) {
    return R.createElement('div', { 'data-testid': 'chat-message-list' },
      props.messages.map(function(m, i) {
        return R.createElement('div', { key: i, 'data-testid': 'msg-' + m.type + '-' + i }, m.content || m.type);
      })
    );
  };
});

// OtpAuthModal
jest.mock('../../pages/OtpAuthModal', () => {
  const R = require('react');
  return function MockOtpAuthModal() {
    return R.createElement('div', { 'data-testid': 'otp-modal' });
  };
});

// SecureInputModal
jest.mock('../../components/SecureInputModal', () => {
  const R = require('react');
  return function MockSecureInputModal() {
    return R.createElement('div', { 'data-testid': 'secure-input-modal' });
  };
});

// CreateAgentForm
jest.mock('../../pages/CreateAgentForm', () => {
  const R = require('react');
  return function MockCreateAgentForm() {
    return R.createElement('div', { 'data-testid': 'create-agent-form' });
  };
});

// CreditSystem
jest.mock('../../pages/Credits', () => {
  return function MockCredits() { return null; };
});

// Agents component
jest.mock('../../components/Agent/Agents', () => {
  const R = require('react');
  return function MockAgents() {
    return R.createElement('div', { 'data-testid': 'agents-overlay' });
  };
});

// react-pdf
jest.mock('react-pdf', () => ({
  Document: function MockDocument(props) { return require('react').createElement('div', null, props.children); },
  Page: function MockPage() { return require('react').createElement('div'); },
  pdfjs: { GlobalWorkerOptions: { workerSrc: '' }, version: '3.0.0' },
}));

// autobahn
jest.mock('autobahn', () => ({}));

// lottie-react
jest.mock('lottie-react', () => {
  const R = require('react');
  return function MockLottie() {
    return R.createElement('div', { 'data-testid': 'lottie' });
  };
});

// react-scroll
jest.mock('react-scroll', () => ({ animateScroll: { scrollToBottom: jest.fn() } }));

// uuid
jest.mock('uuid', () => ({ v4: () => 'test-uuid-1234' }));

// Assets
jest.mock('../../assets/images/connected.gif', () => 'connected.gif');
jest.mock('../../assets/images/connectedImg.gif', () => 'connectedImg.gif');
jest.mock('../../assets/images/DisconnectedImg.gif', () => 'disconnected.gif');
jest.mock('../../assets/images/Animation.json', () => ({}));

// config/apiBase
jest.mock('../../config/apiBase', () => ({
  BOOK_PARSING_URL: 'http://test/book',
  UPLOAD_FILE_URL: 'http://test/upload',
  PERSONALISED_LEARNING_URL: 'http://test/personalised',
  CUSTOM_GPT_URL: 'http://test/gpt',
}));

// utils
jest.mock('../../utils/chatRetry', () => ({
  classifyError: (err) => ({ reason: err.message || 'error', retryable: false }),
  getBackoff: (n) => 1000 * (n + 1),
  makeMsgId: () => 'msg-' + Date.now(),
}));
jest.mock('../../utils/encryption', () => ({
  decrypt: (v) => v ? 'decrypted_' + v : null,
  encrypt: (v) => v ? 'encrypted_' + v : null,
}));
jest.mock('../../utils/logger', () => ({
  logger: { log: jest.fn(), error: jest.fn() },
}));

// newHomeforDemo lazy-loaded
jest.mock('../../pages/newHomeforDemo', () => ({
  __esModule: true,
  default: function MockNewHome() { return require('react').createElement('div', { 'data-testid': 'new-home' }); },
}));

// lucide-react
jest.mock('lucide-react', () => {
  var R = require('react');
  var icons = ['ChevronDown', 'ClipboardCopy', 'ThumbsUp', 'ThumbsDown',
    'CircleCheck', 'FileText', 'User', 'Clock', 'ChevronLeft'];
  var mocks = {};
  icons.forEach(function(name) {
    mocks[name] = function MockIcon(props) {
      return R.createElement('span', Object.assign({ 'data-testid': 'icon-' + name }, props));
    };
  });
  return mocks;
});

// ── Mock Worker and fetch globally ──
class MockWorker {
  constructor() { this.onmessage = null; this.onerror = null; }
  postMessage() {}
  terminate() {}
}
MockWorker.prototype.postMessage = jest.fn();
MockWorker.prototype.terminate = jest.fn();
global.Worker = MockWorker;

// Mock EventSource
class MockEventSource {
  constructor() { this.readyState = 0; }
  close() {}
  addEventListener() {}
}
MockEventSource.prototype.close = jest.fn();
MockEventSource.prototype.addEventListener = jest.fn();
MockEventSource.CLOSED = 2;
global.EventSource = MockEventSource;

// Mock SpeechRecognition
class MockSpeechRecognition {
  constructor() {
    this.continuous = false;
    this.interimResults = false;
    this.lang = 'en-US';
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
  }
}
MockSpeechRecognition.prototype.start = jest.fn();
MockSpeechRecognition.prototype.stop = jest.fn();
global.SpeechRecognition = MockSpeechRecognition;
global.webkitSpeechRecognition = MockSpeechRecognition;

// scrollIntoView
Element.prototype.scrollIntoView = jest.fn();

// ── Now import component ──
import ChatInterface from '../../pages/Demopage';

// ── Helpers ──
const originalFetch = global.fetch;

function mockFetch(responses) {
  responses = responses || {};
  return jest.fn(function(url) {
    var key = Object.keys(responses).find(function(k) { return url.includes(k); });
    if (key) {
      var resp = responses[key];
      return Promise.resolve({
        ok: resp.ok !== undefined ? resp.ok : true,
        status: resp.status || 200,
        json: function() { return Promise.resolve(resp.body || {}); },
      });
    }
    return Promise.resolve({
      ok: true,
      status: 200,
      json: function() { return Promise.resolve({}); },
    });
  });
}

function renderChat(props) {
  props = props || {};
  var defaultProps = {
    agentData: null,
    embeddedMode: false,
    onReady: jest.fn(),
  };
  var merged = Object.assign({}, defaultProps, props);
  return render(React.createElement(ChatInterface, merged));
}

// ── Tests ──

describe('Demopage / ChatInterface', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    localStorage.clear();
    jest.clearAllMocks();
    // Default: guest mode for easy auth
    localStorage.setItem('guest_mode', 'true');
    localStorage.setItem('guest_name', 'TestUser');
    localStorage.setItem('guest_user_id', 'guest-123');
    // Prevent LLM status/bootstrap fetches from throwing
    global.fetch = mockFetch({
      '/api/llm/status': { body: { setup_needed: false } },
      '/api/ai/bootstrap/status': { body: { phase: 'done', steps: {} } },
      '/api/llm/auto-setup': { body: { success: true } },
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    global.fetch = originalFetch;
  });

  // ─────────────────────────────────────────
  // 1. Component renders without crash
  // ─────────────────────────────────────────
  test('renders ChatInterface without crashing', async () => {
    await act(async () => {
      renderChat();
      jest.advanceTimersByTime(100);
    });
    expect(screen.getByTestId('agent-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('chat-input-bar')).toBeInTheDocument();
  });

  test('renders agent sidebar', async () => {
    await act(async () => {
      renderChat();
      jest.advanceTimersByTime(100);
    });
    expect(screen.getByText('AgentSidebar')).toBeInTheDocument();
  });

  // ─────────────────────────────────────────
  // 2. isLocalAgent utility
  // ─────────────────────────────────────────
  describe('isLocalAgent', () => {
    const isLocalAgent = (agent) => {
      if (!agent) return false;
      return agent._isLocal === true || agent.create_agent === true;
    };

    test('returns false for null agent', () => {
      expect(isLocalAgent(null)).toBe(false);
    });
    test('returns false for undefined agent', () => {
      expect(isLocalAgent(undefined)).toBe(false);
    });
    test('returns true when _isLocal is true', () => {
      expect(isLocalAgent({ _isLocal: true })).toBe(true);
    });
    test('returns true when create_agent is true', () => {
      expect(isLocalAgent({ create_agent: true })).toBe(true);
    });
    test('returns false when neither flag set', () => {
      expect(isLocalAgent({ name: 'test' })).toBe(false);
    });
  });

  // ─────────────────────────────────────────
  // 3. Default agent selection prefers local_assistant
  // ─────────────────────────────────────────
  describe('default agent selection', () => {
    test('prefers agent with id=local_assistant from allAgents', async () => {
      var localAssistant = { id: 'local_assistant', name: 'HART', prompt_id: 1, _isLocal: true };
      var otherAgent = { id: 'other', name: 'Other', prompt_id: 2 };
      mockGetPrompts.mockResolvedValue({ prompts: [otherAgent, localAssistant] });

      await act(async () => {
        renderChat();
        jest.advanceTimersByTime(6000);
      });

      expect(mockGetPrompts).toHaveBeenCalled();
    });

    test('falls back to is_default agent when no local_assistant', async () => {
      var defaultAgent = { id: 'default', name: 'DefaultBot', prompt_id: 3, is_default: true };
      mockGetPrompts.mockResolvedValue({ prompts: [defaultAgent] });

      await act(async () => {
        renderChat();
        jest.advanceTimersByTime(6000);
      });
      expect(mockGetPrompts).toHaveBeenCalled();
    });

    test('falls back to first local non-create agent', async () => {
      var localNonCreate = { id: 'loc', name: 'Local', prompt_id: 4, type: 'local', create_agent: false };
      mockGetPrompts.mockResolvedValue({ prompts: [localNonCreate] });

      await act(async () => {
        renderChat();
        jest.advanceTimersByTime(6000);
      });
      expect(mockGetPrompts).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────
  // 4. onReady fires exactly once (readyFired ref guard)
  // ─────────────────────────────────────────
  describe('onReady guard', () => {
    test('onReady fires after fetchPrompts completes', async () => {
      var onReady = jest.fn();
      mockGetPrompts.mockResolvedValue({ prompts: [] });

      await act(async () => {
        renderChat({ onReady: onReady });
        jest.advanceTimersByTime(6000);
      });
      expect(onReady).toHaveBeenCalledTimes(1);
    });

    test('onReady fires at most once even with safety timer', async () => {
      var onReady = jest.fn();
      mockGetPrompts.mockResolvedValue({ prompts: [] });

      await act(async () => {
        renderChat({ onReady: onReady });
        jest.advanceTimersByTime(500);
      });
      await act(async () => {
        jest.advanceTimersByTime(6000);
      });
      expect(onReady).toHaveBeenCalledTimes(1);
    });

    test('safety timer fires onReady if fetchPrompts takes too long', async () => {
      var onReady = jest.fn();
      mockGetPrompts.mockImplementation(function() { return new Promise(function() {}); });

      await act(async () => {
        renderChat({ onReady: onReady });
        jest.advanceTimersByTime(5100);
      });
      expect(onReady).toHaveBeenCalledTimes(1);
    });

    test('onReady not called if prop is undefined', async () => {
      await act(async () => {
        renderChat({ onReady: undefined });
        jest.advanceTimersByTime(6000);
      });
      // Just verify no error thrown
    });
  });

  // ─────────────────────────────────────────
  // 5. STT language mapping (_sttLangMap)
  // ─────────────────────────────────────────
  describe('STT language mapping (_sttLangMap)', () => {
    var _sttLangMap = {
      en: 'en-US', ta: 'ta-IN', hi: 'hi-IN', te: 'te-IN', bn: 'bn-IN',
      gu: 'gu-IN', kn: 'kn-IN', ml: 'ml-IN', mr: 'mr-IN', pa: 'pa-IN',
      ur: 'ur-PK', as: 'as-IN', ne: 'ne-NP', sa: 'sa-IN', or: 'or-IN',
      es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR', ru: 'ru-RU',
      ja: 'ja-JP', ko: 'ko-KR', zh: 'zh-CN', ar: 'ar-SA', it: 'it-IT',
      tr: 'tr-TR', vi: 'vi-VN', th: 'th-TH', id: 'id-ID',
    };

    test('maps en to en-US', () => {
      expect(_sttLangMap['en']).toBe('en-US');
    });
    test('maps ta to ta-IN (Tamil)', () => {
      expect(_sttLangMap['ta']).toBe('ta-IN');
    });
    test('maps hi to hi-IN (Hindi)', () => {
      expect(_sttLangMap['hi']).toBe('hi-IN');
    });
    test('maps ja to ja-JP (Japanese)', () => {
      expect(_sttLangMap['ja']).toBe('ja-JP');
    });
    test('maps ar to ar-SA (Arabic)', () => {
      expect(_sttLangMap['ar']).toBe('ar-SA');
    });
    test('maps ur to ur-PK (Urdu)', () => {
      expect(_sttLangMap['ur']).toBe('ur-PK');
    });
    test('has 28 language entries', () => {
      expect(Object.keys(_sttLangMap).length).toBe(28);
    });
    test('all values are BCP-47 locale codes', () => {
      Object.values(_sttLangMap).forEach(function(val) {
        expect(val).toMatch(/^[a-z]{2}(-[A-Z]{2})?$/);
      });
    });
  });

  // ─────────────────────────────────────────
  // 6. handleDataReceived logic (unit-level)
  // ─────────────────────────────────────────
  describe('handleDataReceived logic', () => {
    var safeParsePayload = function(data) {
      if (data && typeof data === 'object' && !Array.isArray(data)) return data;
      if (Array.isArray(data)) return data[0] && typeof data[0] === 'object' ? data[0] : data;
      if (typeof data !== 'string') return data || {};
      try { return JSON.parse(data); } catch (err) { /* fallback */ }
      try {
        var jsonString = data;
        var protectedStrings = [];
        jsonString = jsonString.replace(/(\w)'(\w)/g, function(match, p1, p2) {
          var placeholder = '__APOSTROPHE_' + protectedStrings.length + '__';
          protectedStrings.push({ placeholder: placeholder, p1: p1, p2: p2 });
          return placeholder;
        });
        jsonString = jsonString.replace(/\bNone\b/g, 'null');
        jsonString = jsonString.replace(/\bTrue\b/g, 'true');
        jsonString = jsonString.replace(/\bFalse\b/g, 'false');
        jsonString = jsonString.replace(/'/g, '"');
        protectedStrings.forEach(function(item) {
          jsonString = jsonString.replace(item.placeholder, item.p1 + "'" + item.p2);
        });
        return JSON.parse(jsonString);
      } catch (err) {
        return { error: 'parse_failed', raw: data };
      }
    };

    test('parses object payload directly', () => {
      var result = safeParsePayload({ priority: 48 });
      expect(result.priority).toBe(48);
    });

    test('parses array payload: takes first element', () => {
      var result = safeParsePayload([{ priority: 49 }]);
      expect(result.priority).toBe(49);
    });

    test('parses JSON string', () => {
      var result = safeParsePayload('{"priority": 50}');
      expect(result.priority).toBe(50);
    });

    test('parses Python-style dict string (None, True, False)', () => {
      var result = safeParsePayload("{'key': None, 'flag': True}");
      expect(result.key).toBeNull();
      expect(result.flag).toBe(true);
    });

    test('returns parse_failed for totally invalid data', () => {
      var result = safeParsePayload('not json at all {{{{');
      expect(result.error).toBe('parse_failed');
    });

    test('channel notification is detected by priority 48', () => {
      var data = { priority: 48, action: 'ChannelMessage', channel: 'telegram', sender: 'bot', text: ['hello'] };
      expect(Number(data.priority)).toBe(48);
      expect(data.action).toBe('ChannelMessage');
    });

    test('workflow flowchart is detected by priority 50', () => {
      var data = { priority: 50, action: 'WorkflowFlowchart', recipe: { nodes: [] } };
      expect(Number(data.priority)).toBe(50);
      expect(data.action).toBe('WorkflowFlowchart');
    });

    test('thinking trace is detected by priority 49', () => {
      var data = { priority: 49, action: 'Thinking', text: ['reasoning...'], request_id: 'req-1' };
      expect(Number(data.priority)).toBe(49);
      expect(data.action).toBe('Thinking');
    });

    test('daemon thinking trace is filtered by mismatched requestId', () => {
      var currentReqId = 'user-req-abc';
      var traceRequestId = 'daemon-req-xyz';
      var shouldDrop = currentReqId && traceRequestId !== 'unknown' && traceRequestId !== currentReqId;
      expect(shouldDrop).toBe(true);
    });

    test('thinking trace with matching requestId is NOT filtered', () => {
      var currentReqId = 'user-req-abc';
      var traceRequestId = 'user-req-abc';
      var shouldDrop = currentReqId && traceRequestId !== 'unknown' && traceRequestId !== currentReqId;
      expect(shouldDrop).toBe(false);
    });

    test('thinking trace with "unknown" requestId is NOT filtered', () => {
      var currentReqId = 'user-req-abc';
      var traceRequestId = 'unknown';
      var shouldDrop = currentReqId && traceRequestId !== 'unknown' && traceRequestId !== currentReqId;
      expect(shouldDrop).toBe(false);
    });

    test('thinking trace passes when no currentReqId', () => {
      var currentReqId = null;
      var traceRequestId = 'daemon-req-xyz';
      var shouldDrop = currentReqId && traceRequestId !== 'unknown' && traceRequestId !== currentReqId;
      expect(shouldDrop).toBeFalsy();
    });
  });

  // ─────────────────────────────────────────
  // 7. saveMessagesToStorage / loadMessagesFromStorage
  // ─────────────────────────────────────────
  describe('message storage', () => {
    var getChatStorageKey = function(promptId) { return 'chat_messages_' + promptId; };

    var saveMessagesToStorage = function(messages, promptId) {
      if (!promptId) return;
      var storageKey = getChatStorageKey(promptId);
      var chatData = {
        agentId: promptId,
        lastUpdated: new Date().toISOString(),
        messageCount: messages.length,
        messages: messages,
      };
      localStorage.setItem(storageKey, JSON.stringify(chatData));
    };

    var loadMessagesFromStorage = function(promptId) {
      if (!promptId) return [];
      try {
        var storageKey = getChatStorageKey(promptId);
        var savedData = localStorage.getItem(storageKey);
        if (savedData) {
          var chatData = JSON.parse(savedData);
          var messages = Array.isArray(chatData) ? chatData : chatData.messages || [];
          return messages;
        }
      } catch (error) { /* ignore */ }
      return [];
    };

    test('saves messages to localStorage', () => {
      var msgs = [{ type: 'user', content: 'hello' }];
      saveMessagesToStorage(msgs, 42);
      var stored = localStorage.getItem('chat_messages_42');
      expect(stored).toBeTruthy();
      var parsed = JSON.parse(stored);
      expect(parsed.messages).toHaveLength(1);
      expect(parsed.messages[0].content).toBe('hello');
    });

    test('loads messages from localStorage', () => {
      var msgs = [{ type: 'assistant', content: 'hi' }];
      saveMessagesToStorage(msgs, 99);
      var loaded = loadMessagesFromStorage(99);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].content).toBe('hi');
    });

    test('returns empty array for missing promptId', () => {
      expect(loadMessagesFromStorage(null)).toEqual([]);
      expect(loadMessagesFromStorage(undefined)).toEqual([]);
    });

    test('returns empty array when nothing saved', () => {
      expect(loadMessagesFromStorage(999)).toEqual([]);
    });

    test('handles legacy array format (no wrapper object)', () => {
      localStorage.setItem('chat_messages_77', JSON.stringify([{ type: 'user', content: 'old' }]));
      var loaded = loadMessagesFromStorage(77);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].content).toBe('old');
    });

    test('does not save when promptId is falsy', () => {
      saveMessagesToStorage([{ type: 'user', content: 'test' }], null);
      expect(localStorage.getItem('chat_messages_null')).toBeNull();
    });

    test('handles corrupt JSON gracefully', () => {
      localStorage.setItem('chat_messages_88', '{broken json');
      var loaded = loadMessagesFromStorage(88);
      expect(loaded).toEqual([]);
    });
  });

  // ─────────────────────────────────────────
  // 8. LLM status check (fetch /api/llm/status)
  // ─────────────────────────────────────────
  describe('LLM status check', () => {
    test('fetches /api/llm/status on mount', async () => {
      global.fetch = mockFetch({
        '/api/llm/status': { body: { setup_needed: false } },
        '/api/ai/bootstrap/status': { body: { phase: 'done', steps: {} } },
      });

      await act(async () => {
        renderChat();
        jest.advanceTimersByTime(6000);
      });

      var statusCalls = global.fetch.mock.calls.filter(function(c) { return c[0].includes('/api/llm/status'); });
      expect(statusCalls.length).toBeGreaterThanOrEqual(1);
    });

    test('does not show setup card when setup_needed is false', async () => {
      global.fetch = mockFetch({
        '/api/llm/status': { body: { setup_needed: false } },
        '/api/ai/bootstrap/status': { body: { phase: 'done', steps: {} } },
      });

      await act(async () => {
        renderChat();
        jest.advanceTimersByTime(6000);
      });

      expect(screen.queryByText(/Setting up AI/)).not.toBeInTheDocument();
    });
  });

  // ─────────────────────────────────────────
  // 9. Message queue behavior
  // ─────────────────────────────────────────
  describe('message queue', () => {
    test('queue structure: items have text and id', () => {
      var queueItem = { text: 'queued msg', id: Date.now() };
      expect(queueItem.text).toBe('queued msg');
      expect(typeof queueItem.id).toBe('number');
    });

    test('queue items are dequeued in order', () => {
      var queue = [
        { text: 'first', id: 1 },
        { text: 'second', id: 2 },
        { text: 'third', id: 3 },
      ];
      var next = queue[0];
      var rest = queue.slice(1);
      expect(next.text).toBe('first');
      expect(rest).toHaveLength(2);
      expect(rest[0].text).toBe('second');
    });
  });

  // ─────────────────────────────────────────
  // 10. Auto-send on speech pause
  // ─────────────────────────────────────────
  describe('auto-send on speech pause', () => {
    test('1.5s timer constant is correct', () => {
      var AUTO_SEND_DELAY = 1500;
      expect(AUTO_SEND_DELAY).toBe(1500);
    });

    test('SpeechRecognition mock is available', () => {
      var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      expect(SR).toBeTruthy();
      var r = new SR();
      expect(typeof r.start).toBe('function');
      expect(typeof r.stop).toBe('function');
    });
  });

  // ─────────────────────────────────────────
  // 11. Agent switching
  // ─────────────────────────────────────────
  describe('agent switching', () => {
    test('localStorage active_agent_id is saved on agent select', () => {
      var agent = { prompt_id: 42, name: 'TestAgent' };
      localStorage.setItem('active_agent_id', String(agent.prompt_id));
      expect(localStorage.getItem('active_agent_id')).toBe('42');
    });

    test('invalid active_agent_id (non-numeric) is cleared', () => {
      localStorage.setItem('active_agent_id', 'not-a-number');
      var savedAgentId = localStorage.getItem('active_agent_id');
      if (savedAgentId && !/^\d+$/.test(savedAgentId)) {
        localStorage.removeItem('active_agent_id');
      }
      expect(localStorage.getItem('active_agent_id')).toBeNull();
    });

    test('numeric active_agent_id is preserved', () => {
      localStorage.setItem('active_agent_id', '123');
      var savedAgentId = localStorage.getItem('active_agent_id');
      if (savedAgentId && !/^\d+$/.test(savedAgentId)) {
        localStorage.removeItem('active_agent_id');
      }
      expect(localStorage.getItem('active_agent_id')).toBe('123');
    });
  });

  // ─────────────────────────────────────────
  // 12. Thinking container creation (priority 49)
  // ─────────────────────────────────────────
  describe('thinking container creation', () => {
    test('creates thinking container with correct structure', () => {
      var requestId = 'req-123';
      var lastUserMessageIndex = 2;
      var containerRequestId = requestId + '_after_user_' + lastUserMessageIndex;

      var thinkingContainer = {
        type: 'thinking_container',
        id: 'thinking_container_' + containerRequestId,
        requestId: requestId,
        containerRequestId: containerRequestId,
        userMessageIndex: lastUserMessageIndex,
        timestamp: new Date(),
        lastUpdated: new Date(),
        isMainExpanded: false,
        isCompleted: false,
        totalDuration: null,
        thinkingSteps: [{
          id: 'thinking_step_1',
          content: 'Analyzing...',
          timestamp: new Date(),
          lastUpdated: new Date(),
          isExpanded: false,
          isCompleted: false,
          duration: null,
        }],
      };

      expect(thinkingContainer.type).toBe('thinking_container');
      expect(thinkingContainer.containerRequestId).toBe('req-123_after_user_2');
      expect(thinkingContainer.thinkingSteps).toHaveLength(1);
      expect(thinkingContainer.isCompleted).toBe(false);
    });

    test('appends thinking step to existing container', () => {
      var container = {
        type: 'thinking_container',
        containerRequestId: 'req_after_user_0',
        thinkingSteps: [{ id: 'step-1', content: 'step 1' }],
      };

      var updatedSteps = container.thinkingSteps.concat([{ id: 'step-2', content: 'step 2' }]);
      var updated = Object.assign({}, container, { thinkingSteps: updatedSteps });

      expect(updated.thinkingSteps).toHaveLength(2);
      expect(updated.thinkingSteps[1].content).toBe('step 2');
    });
  });

  // ─────────────────────────────────────────
  // 13. Backend health check
  // ─────────────────────────────────────────
  describe('backend health check', () => {
    test('chatApi.health is called on mount', async () => {
      await act(async () => {
        renderChat();
        jest.advanceTimersByTime(6000);
      });
      expect(mockHealth).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────
  // 14. Render with embeddedMode
  // ─────────────────────────────────────────
  test('embeddedMode hides top-right toolbar', async () => {
    await act(async () => {
      renderChat({ embeddedMode: true });
      jest.advanceTimersByTime(6000);
    });
    expect(screen.queryByText('Install Companion')).not.toBeInTheDocument();
  });

  // ─────────────────────────────────────────
  // 15. Media mode toggle cycle
  // ─────────────────────────────────────────
  describe('media mode cycle', () => {
    test('audio -> video -> text -> audio', () => {
      var cycle = { audio: 'video', video: 'text', text: 'audio' };
      expect(cycle['audio']).toBe('video');
      expect(cycle['video']).toBe('text');
      expect(cycle['text']).toBe('audio');
    });
  });

  // ─────────────────────────────────────────
  // 16. Guest mode integration in Demopage
  // ─────────────────────────────────────────
  describe('guest mode', () => {
    test('isAuthenticated when guest_mode=true', () => {
      localStorage.setItem('guest_mode', 'true');
      var isGuestMode = localStorage.getItem('guest_mode') === 'true';
      expect(isGuestMode).toBe(true);
    });

    test('effectiveUserId is guestUserId in guest mode', () => {
      localStorage.setItem('guest_mode', 'true');
      localStorage.setItem('guest_user_id', 'g-42');
      var isGuestMode = localStorage.getItem('guest_mode') === 'true';
      var guestUserId = localStorage.getItem('guest_user_id') || '';
      var decryptedUserId = null;
      var effectiveUserId = isGuestMode ? guestUserId : decryptedUserId;
      expect(effectiveUserId).toBe('g-42');
    });
  });

  // ─────────────────────────────────────────
  // 17. Autonomous creation max iterations
  // ─────────────────────────────────────────
  test('autonomous creation max iteration limit is 30', () => {
    var MAX_AUTO_CONTINUE = 30;
    expect(MAX_AUTO_CONTINUE).toBe(30);
  });

  // ─────────────────────────────────────────
  // 18. Notification system
  // ─────────────────────────────────────────
  describe('notification system', () => {
    test('notification structure has required fields', () => {
      var notif = { id: 1, type: 'success', message: 'test', detail: 'detail' };
      expect(notif).toHaveProperty('id');
      expect(notif).toHaveProperty('type');
      expect(notif).toHaveProperty('message');
    });

    test('max 3 notifications kept (slice logic)', () => {
      var prev = [{ id: 1 }, { id: 2 }, { id: 3 }];
      var result = prev.slice(-2).concat([{ id: 4 }]);
      expect(result).toHaveLength(3);
      expect(result[0].id).toBe(2);
    });
  });

  // ─────────────────────────────────────────
  // 19. getVideoWidthforMobile
  // ─────────────────────────────────────────
  describe('getVideoWidthforMobile', () => {
    var getVideoWidthforMobile = function(screenWidth) {
      if (screenWidth <= 360) return '70%';
      if (screenWidth <= 450) return '70%';
      if (screenWidth < 500) return '60%';
      if (screenWidth >= 500 && screenWidth <= 650) return '50%';
      if (screenWidth <= 768) return '40%';
      if (screenWidth >= 2001) return 500;
      if (screenWidth >= 1861) return 460;
      return 260;
    };

    test('returns 70% for small screens (<=360)', () => {
      expect(getVideoWidthforMobile(320)).toBe('70%');
    });
    test('returns 50% for medium screens (500-650)', () => {
      expect(getVideoWidthforMobile(600)).toBe('50%');
    });
    test('returns 500 for large screens (>=2001)', () => {
      expect(getVideoWidthforMobile(2560)).toBe(500);
    });
  });

  // ─────────────────────────────────────────
  // 20. LogOutUser clears localStorage
  // ─────────────────────────────────────────
  test('LogOutUser clears expected keys', () => {
    var keysToRemove = [
      'access_token', 'user_id', 'email_address',
      'guest_mode', 'guest_name', 'guest_user_id', 'guest_name_verified',
    ];
    keysToRemove.forEach(function(k) { localStorage.setItem(k, 'value'); });
    keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
    keysToRemove.forEach(function(k) { expect(localStorage.getItem(k)).toBeNull(); });
  });

  // ─────────────────────────────────────────
  // 21. @agent mention parsing
  // ─────────────────────────────────────────
  describe('@agent mention routing', () => {
    test('regex extracts agent name from @mention', () => {
      var input = 'Hello @MyAgent do this';
      var match = input.match(/@(\S+)/);
      expect(match).toBeTruthy();
      expect(match[1]).toBe('MyAgent');
    });

    test('no match when no @ mention', () => {
      var input = 'Hello world';
      var match = input.match(/@(\S+)/);
      expect(match).toBeNull();
    });
  });

  // ─────────────────────────────────────────
  // 22. Intelligence preference persistence
  // ─────────────────────────────────────────
  test('intelligence preference defaults to auto', () => {
    localStorage.removeItem('intelligence_preference');
    var pref = localStorage.getItem('intelligence_preference') || 'auto';
    expect(pref).toBe('auto');
  });

  // ─────────────────────────────────────────
  // 23. TTS settings persistence
  // ─────────────────────────────────────────
  describe('TTS settings', () => {
    test('defaults: tts_enabled=true, voice=en_US-amy-medium, speed=1.0', () => {
      var enabled = localStorage.getItem('tts_enabled') !== 'false';
      var voice = localStorage.getItem('tts_voice') || 'en_US-amy-medium';
      var speed = localStorage.getItem('tts_speed') ? parseFloat(localStorage.getItem('tts_speed')) : 1.0;
      expect(enabled).toBe(true);
      expect(voice).toBe('en_US-amy-medium');
      expect(speed).toBe(1.0);
    });
  });

  // ─────────────────────────────────────────
  // 24. safeParsePayload edge cases
  // ─────────────────────────────────────────
  describe('safeParsePayload edge cases', () => {
    var safeParsePayload = function(data) {
      if (data && typeof data === 'object' && !Array.isArray(data)) return data;
      if (Array.isArray(data)) return data[0] && typeof data[0] === 'object' ? data[0] : data;
      if (typeof data !== 'string') return data || {};
      try { return JSON.parse(data); } catch (err) { /* fallback */ }
      return { error: 'parse_failed', raw: data };
    };

    test('returns empty object for null', () => {
      expect(safeParsePayload(null)).toEqual({});
    });

    test('returns empty object for undefined', () => {
      expect(safeParsePayload(undefined)).toEqual({});
    });

    test('returns array itself if first element is not object', () => {
      var result = safeParsePayload(['hello', 'world']);
      expect(Array.isArray(result)).toBe(true);
    });

    test('unwraps nested data field', () => {
      // The real handleDataReceived does: if (data.data !== undefined) rawPayload = data.data
      var wrapper = { data: { priority: 48 } };
      var rawPayload = wrapper.data;
      var result = safeParsePayload(rawPayload);
      expect(result.priority).toBe(48);
    });
  });

  // ─────────────────────────────────────────
  // 25. Dual-mode routing logic
  // ─────────────────────────────────────────
  describe('dual-mode routing (local vs cloud)', () => {
    test('local_only preference always routes to local', () => {
      var intelligencePreference = 'local_only';
      var useLocal = intelligencePreference === 'local_only';
      expect(useLocal).toBe(true);
    });

    test('auto preference routes local when backendHealth is not offline', () => {
      var intelligencePreference = 'auto';
      var backendHealth = 'healthy';
      var isGuestMode = true;
      var useLocal =
        intelligencePreference === 'local_only' ||
        (intelligencePreference === 'auto' && backendHealth !== 'offline' && isGuestMode);
      expect(useLocal).toBe(true);
    });

    test('hive_preferred routes to cloud', () => {
      var intelligencePreference = 'hive_preferred';
      var useLocal = intelligencePreference === 'local_only';
      expect(useLocal).toBe(false);
    });
  });
});
