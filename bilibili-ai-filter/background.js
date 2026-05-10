/**
 * Bilibili AI 视频屏蔽插件 - 后台脚本
 * background.js - 负责管理插件状态、处理设置存储、响应内容脚本请求
 */

(function() {
  'use strict';

  const STORAGE_KEYS = {
    SETTINGS: 'settings',
    WHITELIST: 'whitelist',
    BLOCK_RECORDS: 'blockRecords'
  };

  const DEFAULT_KEYWORDS = [
    'AI生成',
    'AI绘图',
    'AI配音',
    'AI合成',
    'AI脚本',
    'AI动画',
    '人工智能生成',
    'AI制作',
    'AI视频',
    'AI翻唱',
    'AI配音',
    'AI换脸'
  ];

  const DEFAULT_SETTINGS = {
    globalEnabled: true,
    blockMode: 'hide',
    customKeywords: [...DEFAULT_KEYWORDS]
  };

  const DEFAULT_WHITELIST = {
    users: [],
    videos: []
  };

  const MAX_BLOCK_RECORDS = 500;

  const DEFAULT_BLOCK_RECORDS = [];

  const MessageTypes = {
    GET_SETTINGS: 'getSettings',
    UPDATE_SETTINGS: 'updateSettings',
    RESET_SETTINGS: 'resetSettings',
    GET_KEYWORDS: 'getKeywords',
    ADD_KEYWORD: 'addKeyword',
    REMOVE_KEYWORD: 'removeKeyword',
    GET_WHITELIST: 'getWhitelist',
    ADD_TO_WHITELIST: 'addToWhitelist',
    REMOVE_FROM_WHITELIST: 'removeFromWhitelist',
    IS_IN_WHITELIST: 'isInWhitelist',
    GET_BLOCK_RECORDS: 'getBlockRecords',
    ADD_BLOCK_RECORD: 'addBlockRecord',
    REMOVE_BLOCK_RECORD: 'removeBlockRecord',
    CLEAR_BLOCK_RECORDS: 'clearBlockRecords',
    CHECK_SHOULD_BLOCK: 'checkShouldBlock'
  };

  function getDefaultSettings() {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  }

  function getDefaultWhitelist() {
    return JSON.parse(JSON.stringify(DEFAULT_WHITELIST));
  }

  function getDefaultBlockRecords() {
    return JSON.parse(JSON.stringify(DEFAULT_BLOCK_RECORDS));
  }

  function initializeDefaultData() {
    return new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.SETTINGS, STORAGE_KEYS.WHITELIST, STORAGE_KEYS.BLOCK_RECORDS], (result) => {
        let needsUpdate = false;
        const updates = {};

        if (!result[STORAGE_KEYS.SETTINGS]) {
          updates[STORAGE_KEYS.SETTINGS] = getDefaultSettings();
          needsUpdate = true;
        }

        if (!result[STORAGE_KEYS.WHITELIST]) {
          updates[STORAGE_KEYS.WHITELIST] = getDefaultWhitelist();
          needsUpdate = true;
        }

        if (!result[STORAGE_KEYS.BLOCK_RECORDS]) {
          updates[STORAGE_KEYS.BLOCK_RECORDS] = getDefaultBlockRecords();
          needsUpdate = true;
        }

        if (needsUpdate) {
          chrome.storage.local.set(updates, () => {
            console.log('[Bilibili AI Filter] 默认数据初始化完成');
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  }

  function cleanupExpiredData() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.BLOCK_RECORDS, (result) => {
        const records = result[STORAGE_KEYS.BLOCK_RECORDS] || [];
        const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);

        const filteredRecords = records.filter(record => {
          if (record.blockedAt) {
            const blockedTime = new Date(record.blockedAt).getTime();
            return blockedTime > thirtyDaysAgo;
          }
          return true;
        });

        if (filteredRecords.length < records.length) {
          chrome.storage.local.set({ [STORAGE_KEYS.BLOCK_RECORDS]: filteredRecords }, () => {
            console.log(`[Bilibili AI Filter] 清理了 ${records.length - filteredRecords.length} 条过期屏蔽记录`);
            resolve();
          });
        } else {
          resolve();
        }
      });
    });
  }

  async function handleGetSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (result) => {
        const settings = result[STORAGE_KEYS.SETTINGS] || getDefaultSettings();
        resolve(settings);
      });
    });
  }

  async function handleUpdateSettings(newSettings) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (result) => {
        const currentSettings = result[STORAGE_KEYS.SETTINGS] || getDefaultSettings();
        const mergedSettings = { ...currentSettings, ...newSettings };
        chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: mergedSettings }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(mergedSettings);
          }
        });
      });
    });
  }

  async function handleResetSettings() {
    return new Promise((resolve) => {
      const defaultSettings = getDefaultSettings();
      chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: defaultSettings }, () => {
        resolve(defaultSettings);
      });
    });
  }

  async function handleGetKeywords() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (result) => {
        const settings = result[STORAGE_KEYS.SETTINGS] || getDefaultSettings();
        resolve(settings.customKeywords || []);
      });
    });
  }

  async function handleAddKeyword(keyword) {
    if (!keyword || typeof keyword !== 'string') {
      throw new Error('无效的关键词');
    }

    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) {
      throw new Error('关键词不能为空');
    }

    return new Promise((resolve, reject) => {
      chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (result) => {
        const settings = result[STORAGE_KEYS.SETTINGS] || getDefaultSettings();
        const keywords = settings.customKeywords || [];

        if (keywords.includes(trimmedKeyword)) {
          reject(new Error('关键词已存在'));
          return;
        }

        keywords.push(trimmedKeyword);
        settings.customKeywords = keywords;

        chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(keywords);
          }
        });
      });
    });
  }

  async function handleRemoveKeyword(keyword) {
    if (!keyword || typeof keyword !== 'string') {
      throw new Error('无效的关键词');
    }

    return new Promise((resolve, reject) => {
      chrome.storage.local.get(STORAGE_KEYS.SETTINGS, (result) => {
        const settings = result[STORAGE_KEYS.SETTINGS] || getDefaultSettings();
        const keywords = settings.customKeywords || [];

        const index = keywords.indexOf(keyword);
        if (index === -1) {
          reject(new Error('关键词不存在'));
          return;
        }

        keywords.splice(index, 1);
        settings.customKeywords = keywords;

        chrome.storage.local.set({ [STORAGE_KEYS.SETTINGS]: settings }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(keywords);
          }
        });
      });
    });
  }

  async function handleGetWhitelist() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.WHITELIST, (result) => {
        const whitelist = result[STORAGE_KEYS.WHITELIST] || getDefaultWhitelist();
        resolve(whitelist);
      });
    });
  }

  async function handleAddToWhitelist(type, id) {
    if (!type || !['user', 'video'].includes(type)) {
      throw new Error('无效的白名单类型');
    }

    if (!id || typeof id !== 'string') {
      throw new Error('无效的ID');
    }

    return new Promise((resolve, reject) => {
      chrome.storage.local.get(STORAGE_KEYS.WHITELIST, (result) => {
        const whitelist = result[STORAGE_KEYS.WHITELIST] || getDefaultWhitelist();

        if (type === 'user') {
          if (whitelist.users.includes(id)) {
            reject(new Error('该UP主已在白名单中'));
            return;
          }
          whitelist.users.push(id);
        } else {
          if (whitelist.videos.includes(id)) {
            reject(new Error('该视频已在白名单中'));
            return;
          }
          whitelist.videos.push(id);
        }

        chrome.storage.local.set({ [STORAGE_KEYS.WHITELIST]: whitelist }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(whitelist);
          }
        });
      });
    });
  }

  async function handleRemoveFromWhitelist(type, id) {
    if (!type || !['user', 'video'].includes(type)) {
      throw new Error('无效的白名单类型');
    }

    if (!id || typeof id !== 'string') {
      throw new Error('无效的ID');
    }

    return new Promise((resolve, reject) => {
      chrome.storage.local.get(STORAGE_KEYS.WHITELIST, (result) => {
        const whitelist = result[STORAGE_KEYS.WHITELIST] || getDefaultWhitelist();

        if (type === 'user') {
          const index = whitelist.users.indexOf(id);
          if (index === -1) {
            reject(new Error('该UP主不在白名单中'));
            return;
          }
          whitelist.users.splice(index, 1);
        } else {
          const index = whitelist.videos.indexOf(id);
          if (index === -1) {
            reject(new Error('该视频不在白名单中'));
            return;
          }
          whitelist.videos.splice(index, 1);
        }

        chrome.storage.local.set({ [STORAGE_KEYS.WHITELIST]: whitelist }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(whitelist);
          }
        });
      });
    });
  }

  async function handleIsInWhitelist(authorMid, bvid) {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.WHITELIST, (result) => {
        const whitelist = result[STORAGE_KEYS.WHITELIST] || getDefaultWhitelist();

        if (authorMid && whitelist.users.includes(authorMid)) {
          resolve({ isWhitelisted: true, type: 'user', id: authorMid });
          return;
        }

        if (bvid && whitelist.videos.includes(bvid)) {
          resolve({ isWhitelisted: true, type: 'video', id: bvid });
          return;
        }

        resolve({ isWhitelisted: false });
      });
    });
  }

  async function handleGetBlockRecords(options = {}) {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEYS.BLOCK_RECORDS, (result) => {
        let records = result[STORAGE_KEYS.BLOCK_RECORDS] || [];

        if (options.sortBy === 'time') {
          records.sort((a, b) => {
            const timeA = new Date(a.blockedAt || 0).getTime();
            const timeB = new Date(b.blockedAt || 0).getTime();
            return options.sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
          });
        }

        if (options.limit && options.limit > 0) {
          const offset = options.offset || 0;
          records = records.slice(offset, offset + options.limit);
        }

        resolve(records);
      });
    });
  }

  async function handleAddBlockRecord(record) {
    if (!record || !record.bvid) {
      throw new Error('无效的屏蔽记录');
    }

    return new Promise((resolve, reject) => {
      chrome.storage.local.get(STORAGE_KEYS.BLOCK_RECORDS, (result) => {
        const records = result[STORAGE_KEYS.BLOCK_RECORDS] || [];

        const existingIndex = records.findIndex(r => r.bvid === record.bvid);
        if (existingIndex !== -1) {
          records[existingIndex] = {
            ...records[existingIndex],
            ...record,
            blockedAt: record.blockedAt || new Date().toISOString()
          };
        } else {
          records.unshift({
            bvid: record.bvid,
            title: record.title || '未知标题',
            author: record.author || '未知UP主',
            authorMid: record.authorMid || '',
            blockedAt: record.blockedAt || new Date().toISOString(),
            reason: record.reason || '未知原因'
          });
        }

        let trimmedRecords = records;
        if (records.length > MAX_BLOCK_RECORDS) {
          trimmedRecords = records.slice(0, MAX_BLOCK_RECORDS);
        }

        chrome.storage.local.set({ [STORAGE_KEYS.BLOCK_RECORDS]: trimmedRecords }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(trimmedRecords);
          }
        });
      });
    });
  }

  async function handleRemoveBlockRecord(bvid) {
    if (!bvid || typeof bvid !== 'string') {
      throw new Error('无效的BVID');
    }

    return new Promise((resolve, reject) => {
      chrome.storage.local.get(STORAGE_KEYS.BLOCK_RECORDS, (result) => {
        const records = result[STORAGE_KEYS.BLOCK_RECORDS] || [];
        const filteredRecords = records.filter(r => r.bvid !== bvid);

        if (filteredRecords.length === records.length) {
          reject(new Error('记录不存在'));
          return;
        }

        chrome.storage.local.set({ [STORAGE_KEYS.BLOCK_RECORDS]: filteredRecords }, () => {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
          } else {
            resolve(filteredRecords);
          }
        });
      });
    });
  }

  async function handleClearBlockRecords() {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEYS.BLOCK_RECORDS]: [] }, () => {
        resolve([]);
      });
    });
  }

  async function handleCheckShouldBlock(videoInfo) {
    const [settings, whitelistResult] = await Promise.all([
      handleGetSettings(),
      handleGetWhitelist()
    ]);

    if (!settings.globalEnabled) {
      return { shouldBlock: false, reason: '插件已关闭' };
    }

    if (settings.customKeywords.length === 0) {
      return { shouldBlock: false, reason: '关键词列表为空' };
    }

    if (videoInfo.authorMid && whitelistResult.users.includes(videoInfo.authorMid)) {
      return { shouldBlock: false, reason: 'UP主在白名单中' };
    }

    if (videoInfo.bvid && whitelistResult.videos.includes(videoInfo.bvid)) {
      return { shouldBlock: false, reason: '视频在白名单中' };
    }

    const searchText = [
      videoInfo.title,
      videoInfo.description,
      videoInfo.tags,
      videoInfo.author
    ].filter(Boolean).join(' ').toLowerCase();

    for (const keyword of settings.customKeywords) {
      const pattern = new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      if (pattern.test(searchText)) {
        return {
          shouldBlock: true,
          reason: `标题/描述包含关键词: ${keyword}`,
          matchedKeyword: keyword
        };
      }
    }

    return { shouldBlock: false, reason: '' };
  }

  function handleMessage(message, sender, sendResponse) {
    const { type, data } = message;

    (async () => {
      try {
        let result;

        switch (type) {
          case MessageTypes.GET_SETTINGS:
            result = await handleGetSettings();
            break;

          case MessageTypes.UPDATE_SETTINGS:
            result = await handleUpdateSettings(data);
            break;

          case MessageTypes.RESET_SETTINGS:
            result = await handleResetSettings();
            break;

          case MessageTypes.GET_KEYWORDS:
            result = await handleGetKeywords();
            break;

          case MessageTypes.ADD_KEYWORD:
            result = await handleAddKeyword(data.keyword);
            break;

          case MessageTypes.REMOVE_KEYWORD:
            result = await handleRemoveKeyword(data.keyword);
            break;

          case MessageTypes.GET_WHITELIST:
            result = await handleGetWhitelist();
            break;

          case MessageTypes.ADD_TO_WHITELIST:
            result = await handleAddToWhitelist(data.type, data.id);
            break;

          case MessageTypes.REMOVE_FROM_WHITELIST:
            result = await handleRemoveFromWhitelist(data.type, data.id);
            break;

          case MessageTypes.IS_IN_WHITELIST:
            result = await handleIsInWhitelist(data.authorMid, data.bvid);
            break;

          case MessageTypes.GET_BLOCK_RECORDS:
            result = await handleGetBlockRecords(data || {});
            break;

          case MessageTypes.ADD_BLOCK_RECORD:
            result = await handleAddBlockRecord(data);
            break;

          case MessageTypes.REMOVE_BLOCK_RECORD:
            result = await handleRemoveBlockRecord(data.bvid);
            break;

          case MessageTypes.CLEAR_BLOCK_RECORDS:
            result = await handleClearBlockRecords();
            break;

          case MessageTypes.CHECK_SHOULD_BLOCK:
            result = await handleCheckShouldBlock(data);
            break;

          default:
            throw new Error(`未知的消息类型: ${type}`);
        }

        sendResponse({ success: true, data: result });
      } catch (error) {
        console.error(`[Bilibili AI Filter] 处理消息失败: ${type}`, error);
        sendResponse({ success: false, error: error.message || '未知错误' });
      }
    })();

    return true;
  }

  chrome.runtime.onInstalled.addListener(async (details) => {
    console.log('[Bilibili AI Filter] 插件已安装/更新', details.reason);

    await initializeDefaultData();
    await cleanupExpiredData();

    console.log('[Bilibili AI Filter] 后台脚本初始化完成');
  });

  chrome.runtime.onStartup.addListener(async () => {
    console.log('[Bilibili AI Filter] 浏览器启动');

    await initializeDefaultData();
    await cleanupExpiredData();

    console.log('[Bilibili AI Filter] 后台脚本初始化完成');
  });

  chrome.runtime.onMessage.addListener(handleMessage);

  console.log('[Bilibili AI Filter] 后台脚本已加载');
})();
