// shared/storage.js — No Vibes Just Code
// Promise-based wrapper around chrome.storage.sync.
// Depends on: shared/constants.js (NVJC must be defined)

/* global var */ var NVJC_STORAGE = (function () {
  'use strict';

  /**
   * Returns all settings merged with DEFAULTS.
   * @returns {Promise<object>}
   */
  function getAllSettings() {
    return new Promise(function (resolve) {
      chrome.storage.sync.get(null, function (items) {
        var k = NVJC.STORAGE_KEYS;
        var d = NVJC.DEFAULTS;
        resolve({
          enabled:        items[k.ENABLED]         != null ? items[k.ENABLED]        : d.ENABLED,
          apiUrl:         items[k.API_URL]          != null ? items[k.API_URL]         : d.API_URL,
          model:          items[k.MODEL]            != null ? items[k.MODEL]           : d.MODEL,
          blockThreshold: items[k.BLOCK_THRESHOLD]  != null ? items[k.BLOCK_THRESHOLD] : d.BLOCK_THRESHOLD,
          preThreshold:   items[k.PRE_THRESHOLD]    != null ? items[k.PRE_THRESHOLD]   : d.PRE_THRESHOLD,
          minLength:      items[k.MIN_LENGTH]       != null ? items[k.MIN_LENGTH]      : d.MIN_LENGTH,
          debounceMs:     items[k.DEBOUNCE_MS]      != null ? items[k.DEBOUNCE_MS]     : d.DEBOUNCE_MS,
          excludedSites:  items[k.EXCLUDED_SITES]   != null ? items[k.EXCLUDED_SITES]  : d.EXCLUDED_SITES,
          weights:        items[k.WEIGHTS]          != null ? items[k.WEIGHTS]         : d.WEIGHTS,
        });
      });
    });
  }

  /**
   * Persists a partial settings object to chrome.storage.sync.
   * @param {object} items
   * @returns {Promise<void>}
   */
  function saveSettings(items) {
    return new Promise(function (resolve) {
      chrome.storage.sync.set(items, resolve);
    });
  }

  /**
   * Resets all settings to DEFAULTS.
   * @returns {Promise<void>}
   */
  function resetToDefaults() {
    var d = NVJC.DEFAULTS;
    var k = NVJC.STORAGE_KEYS;
    var payload = {};
    payload[k.ENABLED]         = d.ENABLED;
    payload[k.API_URL]         = d.API_URL;
    payload[k.MODEL]           = d.MODEL;
    payload[k.BLOCK_THRESHOLD] = d.BLOCK_THRESHOLD;
    payload[k.PRE_THRESHOLD]   = d.PRE_THRESHOLD;
    payload[k.MIN_LENGTH]      = d.MIN_LENGTH;
    payload[k.DEBOUNCE_MS]     = d.DEBOUNCE_MS;
    payload[k.EXCLUDED_SITES]  = d.EXCLUDED_SITES;
    payload[k.WEIGHTS]         = d.WEIGHTS;
    return saveSettings(payload);
  }

  return {
    getAllSettings:  getAllSettings,
    saveSettings:   saveSettings,
    resetToDefaults: resetToDefaults,
  };
}());
