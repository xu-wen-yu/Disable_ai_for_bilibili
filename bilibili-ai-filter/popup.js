/**
 * Bilibili AI 视频屏蔽插件 - Popup 脚本
 * 负责设置页面交互和与 background.js 通信
 */

(function() {
  'use strict';

  const MessageTypes = {
    GET_SETTINGS: 'getSettings',
    UPDATE_SETTINGS: 'updateSettings',
    GET_KEYWORDS: 'getKeywords',
    ADD_KEYWORD: 'addKeyword',
    REMOVE_KEYWORD: 'removeKeyword',
    GET_WHITELIST: 'getWhitelist',
    ADD_TO_WHITELIST: 'addToWhitelist',
    REMOVE_FROM_WHITELIST: 'removeFromWhitelist',
    GET_BLOCK_RECORDS: 'getBlockRecords',
    REMOVE_BLOCK_RECORD: 'removeBlockRecord',
    CLEAR_BLOCK_RECORDS: 'clearBlockRecords',
    SETTINGS_UPDATED: 'settingsUpdated'
  };

  const DEFAULT_KEYWORDS = [
    'AI生成', 'AI绘图', 'AI配音', 'AI合成',
    'AI脚本', 'AI动画', '人工智能', 'AI翻唱',
    'AI演唱', 'AI虚拟主播'
  ];

  let currentSettings = {
    globalEnabled: true,
    blockMode: 'hide',
    customKeywords: [...DEFAULT_KEYWORDS]
  };

  let currentWhitelist = {
    users: [],
    videos: []
  };

  let currentBlockRecords = [];

  const elements = {};

  function initElements() {
    elements.globalEnabled = document.getElementById('globalEnabled');
    elements.keywordInput = document.getElementById('keywordInput');
    elements.addKeywordBtn = document.getElementById('addKeywordBtn');
    elements.keywordsList = document.getElementById('keywordsList');
    elements.keywordsPlaceholder = document.getElementById('keywordsPlaceholder');
    elements.recordCount = document.getElementById('recordCount');
    elements.viewRecordsBtn = document.getElementById('viewRecordsBtn');
    elements.whitelistBtn = document.getElementById('whitelistBtn');
    elements.modalContainer = document.getElementById('modalContainer');
  }

  async function sendMessage(type, data = null) {
    return new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type, data }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response && response.success) {
            resolve(response.data);
          } else {
            reject(new Error(response?.error || 'Unknown error'));
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function loadSettings() {
    try {
      const settings = await sendMessage(MessageTypes.GET_SETTINGS);
      if (settings) {
        currentSettings = {
          globalEnabled: settings.globalEnabled !== false,
          blockMode: settings.blockMode || 'hide',
          customKeywords: (settings.customKeywords && settings.customKeywords.length > 0)
            ? settings.customKeywords
            : [...DEFAULT_KEYWORDS]
        };
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
      currentSettings = {
        globalEnabled: true,
        blockMode: 'hide',
        customKeywords: [...DEFAULT_KEYWORDS]
      };
    }
  }

  async function loadWhitelist() {
    try {
      const whitelist = await sendMessage(MessageTypes.GET_WHITELIST);
      if (whitelist) {
        currentWhitelist = {
          users: whitelist.users || [],
          videos: whitelist.videos || []
        };
      }
    } catch (error) {
      console.error('Failed to load whitelist:', error);
    }
  }

  async function loadBlockRecords() {
    try {
      const records = await sendMessage(MessageTypes.GET_BLOCK_RECORDS, { limit: 100 });
      if (records) {
        currentBlockRecords = records;
      }
    } catch (error) {
      console.error('Failed to load block records:', error);
    }
  }

  async function saveSettings(newSettings) {
    try {
      await sendMessage(MessageTypes.UPDATE_SETTINGS, newSettings);
      currentSettings = { ...currentSettings, ...newSettings };
      await notifyContentScripts();
    } catch (error) {
      console.error('Failed to save settings:', error);
      showNotification('保存设置失败', 'error');
    }
  }

  async function notifyContentScripts() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { action: MessageTypes.SETTINGS_UPDATED });
      }
    } catch (error) {
      console.error('Failed to notify content scripts:', error);
    }
  }

  function renderSettings() {
    elements.globalEnabled.checked = currentSettings.globalEnabled;

    const modeRadios = document.querySelectorAll('input[name="blockMode"]');
    modeRadios.forEach(radio => {
      radio.checked = radio.value === currentSettings.blockMode;
      const label = radio.closest('.mode-option');
      if (label) {
        label.classList.toggle('selected', radio.checked);
      }
    });

    renderKeywords();
    updateRecordCount();
  }

  function renderKeywords() {
    const keywords = currentSettings.customKeywords || [];
    const existingTags = elements.keywordsList.querySelectorAll('.keyword-tag');
    existingTags.forEach(tag => tag.remove());

    if (keywords.length === 0) {
      elements.keywordsPlaceholder.style.display = 'block';
    } else {
      elements.keywordsPlaceholder.style.display = 'none';

      keywords.forEach((keyword, index) => {
        const tag = createKeywordTag(keyword, index);
        elements.keywordsList.insertBefore(tag, elements.keywordsPlaceholder);
      });
    }
  }

  function createKeywordTag(keyword, index) {
    const tag = document.createElement('div');
    tag.className = 'keyword-tag';
    tag.innerHTML = `
      <span class="keyword-text" title="${escapeHtml(keyword)}">${escapeHtml(keyword)}</span>
      <button class="delete-btn" data-index="${index}" title="删除">×</button>
    `;

    const deleteBtn = tag.querySelector('.delete-btn');
    deleteBtn.addEventListener('click', () => deleteKeyword(index));

    return tag;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  async function addKeyword() {
    const keyword = elements.keywordInput.value.trim();

    if (!keyword) {
      showNotification('请输入关键词', 'warning');
      elements.keywordInput.focus();
      return;
    }

    if (currentSettings.customKeywords.includes(keyword)) {
      showNotification('该关键词已存在', 'warning');
      return;
    }

    if (currentSettings.customKeywords.length >= 50) {
      showNotification('关键词数量不能超过50个', 'warning');
      return;
    }

    try {
      const newKeywords = [...currentSettings.customKeywords, keyword];
      await saveSettings({ customKeywords: newKeywords });
      elements.keywordInput.value = '';
      renderKeywords();
      showNotification('关键词添加成功', 'success');
    } catch (error) {
      showNotification('添加失败: ' + error.message, 'error');
    }
  }

  async function deleteKeyword(index) {
    const deletedKeyword = currentSettings.customKeywords[index];
    if (deletedKeyword === undefined) return;

    try {
      const newKeywords = currentSettings.customKeywords.filter((_, i) => i !== index);
      await saveSettings({ customKeywords: newKeywords });
      renderKeywords();
      showNotification(`已删除关键词 "${deletedKeyword}"`, 'success');
    } catch (error) {
      showNotification('删除失败: ' + error.message, 'error');
    }
  }

  function updateRecordCount() {
    elements.recordCount.textContent = currentBlockRecords.length;
  }

  function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    const colors = {
      success: 'linear-gradient(135deg, #4CAF50 0%, #66BB6A 100%)',
      warning: 'linear-gradient(135deg, #FF9800 0%, #FFB74D 100%)',
      error: 'linear-gradient(135deg, #f44336 0%, #e57373 100%)',
      info: 'linear-gradient(135deg, #2196F3 0%, #42A5F5 100%)'
    };

    notification.style.cssText = `
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      padding: 12px 24px;
      background: ${colors[type] || colors.info};
      color: white;
      border-radius: 8px;
      font-size: 14px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideDown 0.3s ease;
    `;

    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideDown {
        from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        to { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
    `;

    if (!document.getElementById('notification-styles')) {
      style.id = 'notification-styles';
      document.head.appendChild(style);
    }

    document.body.appendChild(notification);

    setTimeout(() => {
      notification.style.animation = 'slideDown 0.3s ease reverse';
      setTimeout(() => {
        notification.remove();
      }, 300);
    }, 2500);
  }

  function showRecordsModal() {
    const recordsHtml = currentBlockRecords.length === 0
      ? '<p style="text-align: center; color: #888; padding: 40px;">暂无屏蔽记录</p>'
      : currentBlockRecords.map((record, index) => `
        <div class="record-item" data-bvid="${escapeHtml(record.bvid)}">
          <div class="record-title">${escapeHtml(record.title || '未知标题')}</div>
          <div class="record-meta">
            <span>UP主: ${escapeHtml(record.author || '未知')}</span>
            <span class="record-time">${formatTime(record.blockedAt)}</span>
          </div>
          <div style="font-size: 12px; color: #fb7299; margin-top: 6px;">
            ${escapeHtml(record.reason || '')}
          </div>
          <div class="record-actions" style="margin-top: 8px;">
            <button class="record-action-btn unblock-btn" data-index="${index}">取消屏蔽</button>
          </div>
        </div>
      `).join('');

    elements.modalContainer.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal">
          <div class="modal-header">
            <h3 class="modal-title">屏蔽记录 (${currentBlockRecords.length})</h3>
            <button class="modal-close" id="modalClose">×</button>
          </div>
          <div class="modal-body">
            ${recordsHtml}
          </div>
          <div class="modal-footer">
            ${currentBlockRecords.length > 0 ? '<button class="modal-btn modal-btn-secondary" id="clearAllBtn">清空所有记录</button>' : ''}
            <button class="modal-btn modal-btn-primary" id="closeModalBtn">关闭</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'modalOverlay') closeModal();
    });

    document.getElementById('modalClose')?.addEventListener('click', closeModal);
    document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);

    document.querySelectorAll('.unblock-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const index = parseInt(e.target.dataset.index);
        await unblockRecord(index);
      });
    });

    document.getElementById('clearAllBtn')?.addEventListener('click', async () => {
      if (confirm('确定要清空所有屏蔽记录吗？')) {
        await clearAllRecords();
      }
    });
  }

  function closeModal() {
    elements.modalContainer.innerHTML = '';
  }

  async function unblockRecord(index) {
    const record = currentBlockRecords[index];
    if (!record) return;

    try {
      await sendMessage(MessageTypes.REMOVE_BLOCK_RECORD, { bvid: record.bvid });
      currentBlockRecords.splice(index, 1);
      updateRecordCount();
      showRecordsModal();
      showNotification('已取消屏蔽', 'success');
    } catch (error) {
      showNotification('操作失败: ' + error.message, 'error');
    }
  }

  async function clearAllRecords() {
    try {
      await sendMessage(MessageTypes.CLEAR_BLOCK_RECORDS);
      currentBlockRecords = [];
      updateRecordCount();
      closeModal();
      showNotification('已清空所有屏蔽记录', 'success');
    } catch (error) {
      showNotification('清空失败: ' + error.message, 'error');
    }
  }

  function showWhitelistModal() {
    const usersHtml = currentWhitelist.users.length === 0
      ? '<p class="whitelist-empty">暂无 UP 主白名单</p>'
      : `<div class="whitelist-items">${
          currentWhitelist.users.map((uid, index) => `
            <div class="whitelist-item">
              <span>UP: ${escapeHtml(uid)}</span>
              <button class="whitelist-item-delete" data-type="user" data-index="${index}">×</button>
            </div>
          `).join('')
        }</div>`;

    const videosHtml = currentWhitelist.videos.length === 0
      ? '<p class="whitelist-empty">暂无视频白名单</p>'
      : `<div class="whitelist-items">${
          currentWhitelist.videos.map((bvid, index) => `
            <div class="whitelist-item">
              <span>${escapeHtml(bvid)}</span>
              <button class="whitelist-item-delete" data-type="video" data-index="${index}">×</button>
            </div>
          `).join('')
        }</div>`;

    elements.modalContainer.innerHTML = `
      <div class="modal-overlay" id="modalOverlay">
        <div class="modal" style="max-width: 400px;">
          <div class="modal-header">
            <h3 class="modal-title">白名单管理</h3>
            <button class="modal-close" id="modalClose">×</button>
          </div>
          <div class="modal-body">
            <div class="whitelist-section">
              <div class="whitelist-title">UP 主白名单</div>
              ${usersHtml}
            </div>
            <div class="whitelist-section">
              <div class="whitelist-title">视频白名单</div>
              ${videosHtml}
            </div>
            <div class="input-group" style="margin-top: 16px;">
              <label class="input-label">添加 UP 主 UID</label>
              <input type="text" class="input-field" id="addUserInput" placeholder="输入 UP 主 UID">
            </div>
            <div class="input-group">
              <label class="input-label">添加视频 BV 号</label>
              <input type="text" class="input-field" id="addVideoInput" placeholder="输入视频 BV 号，如 BV1xx">
            </div>
          </div>
          <div class="modal-footer">
            <button class="modal-btn modal-btn-primary" id="addWhitelistBtn">添加</button>
            <button class="modal-btn modal-btn-secondary" id="closeModalBtn">关闭</button>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'modalOverlay') closeModal();
    });

    document.getElementById('modalClose')?.addEventListener('click', closeModal);
    document.getElementById('closeModalBtn')?.addEventListener('click', closeModal);

    document.querySelectorAll('.whitelist-item-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const type = e.target.dataset.type;
        const index = parseInt(e.target.dataset.index);
        await removeFromWhitelist(type, index);
      });
    });

    document.getElementById('addWhitelistBtn')?.addEventListener('click', async () => {
      const userInput = document.getElementById('addUserInput')?.value.trim();
      const videoInput = document.getElementById('addVideoInput')?.value.trim();

      if (!userInput && !videoInput) {
        showNotification('请输入 UP 主 UID 或视频 BV 号', 'warning');
        return;
      }

      try {
        if (userInput) {
          await sendMessage(MessageTypes.ADD_TO_WHITELIST, { type: 'user', id: userInput });
          showNotification('UP主已添加到白名单', 'success');
        }

        if (videoInput) {
          await sendMessage(MessageTypes.ADD_TO_WHITELIST, { type: 'video', id: videoInput });
          showNotification('视频已添加到白名单', 'success');
        }

        await loadWhitelist();
        showWhitelistModal();
      } catch (error) {
        showNotification('添加失败: ' + error.message, 'error');
      }
    });
  }

  async function removeFromWhitelist(type, index) {
    const id = type === 'user'
      ? currentWhitelist.users[index]
      : currentWhitelist.videos[index];

    if (!id) return;

    try {
      await sendMessage(MessageTypes.REMOVE_FROM_WHITELIST, { type, id });
      await loadWhitelist();
      showWhitelistModal();
      showNotification('已从白名单移除', 'success');
    } catch (error) {
      showNotification('移除失败: ' + error.message, 'error');
    }
  }

  function formatTime(isoString) {
    if (!isoString) return '未知时间';
    const date = new Date(isoString);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)} 天前`;

    return date.toLocaleDateString('zh-CN');
  }

  function setupEventListeners() {
    elements.globalEnabled.addEventListener('change', async (e) => {
      await saveSettings({ globalEnabled: e.target.checked });
      showNotification(e.target.checked ? '插件已启用' : '插件已禁用', 'success');
    });

    elements.keywordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        addKeyword();
      }
    });

    elements.addKeywordBtn.addEventListener('click', addKeyword);

    document.querySelectorAll('input[name="blockMode"]').forEach(radio => {
      radio.addEventListener('change', async (e) => {
        await saveSettings({ blockMode: e.target.value });

        document.querySelectorAll('.mode-option').forEach(label => {
          label.classList.remove('selected');
        });
        e.target.closest('.mode-option')?.classList.add('selected');

        const modeNames = { hide: '完全隐藏', show: '显示提示' };
        showNotification(`已切换到${modeNames[e.target.value]}模式`, 'success');
      });
    });

    elements.viewRecordsBtn.addEventListener('click', showRecordsModal);
    elements.whitelistBtn.addEventListener('click', showWhitelistModal);
  }

  async function initialize() {
    initElements();

    await Promise.all([
      loadSettings(),
      loadWhitelist(),
      loadBlockRecords()
    ]);

    renderSettings();
    setupEventListeners();

    console.log('[Bilibili AI Filter] Popup initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
