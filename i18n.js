(function () {
  const LANGUAGE_STORAGE_KEY = 'markdown-editor-language';
  const LANGUAGE_SOURCE_STORAGE_KEY = 'markdown-editor-language-source';
  const SUPPORTED_LANGUAGES = ['en', 'ja'];

  let config = { defaultLanguage: 'en' };
  const dictionaries = new Map();
  let fallbackDictionary = {};
  let currentDictionary = {};
  let currentLanguage = 'en';
  let initialized = false;

  function normalizeLanguage(lang) {
    if (typeof lang !== 'string') {
      return null;
    }
    const trimmed = lang.trim();
    if (!trimmed) {
      return null;
    }
    const lower = trimmed.toLowerCase();
    const [base] = lower.split('-');
    return base;
  }

  function isSupported(lang) {
    return SUPPORTED_LANGUAGES.includes(lang);
  }

  function getDefaultLanguage() {
    const configured = normalizeLanguage(config.defaultLanguage);
    if (configured && isSupported(configured)) {
      return configured;
    }
    return 'en';
  }

  function removeStoredLanguage() {
    try {
      localStorage.removeItem(LANGUAGE_STORAGE_KEY);
      localStorage.removeItem(LANGUAGE_SOURCE_STORAGE_KEY);
    } catch (error) {
      console.warn('[i18n] Unable to clear stored language.', error);
    }
  }

  function persistStoredLanguage(lang, source) {
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
      localStorage.setItem(LANGUAGE_SOURCE_STORAGE_KEY, source);
    } catch (error) {
      console.warn('[i18n] Unable to persist language selection.', error);
    }
  }

  function getStoredLanguage() {
    try {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (!stored) {
        return null;
      }

      const normalized = normalizeLanguage(stored);
      if (!normalized) {
        removeStoredLanguage();
        return null;
      }

      const source = localStorage.getItem(LANGUAGE_SOURCE_STORAGE_KEY) || '';
      if (source !== 'user') {
        removeStoredLanguage();
        return null;
      }

      return { lang: normalized, source };
    } catch (error) {
      console.warn('[i18n] Unable to access localStorage.', error);
      return null;
    }
  }

  function getBrowserLanguage() {
    const candidates = [];
    if (Array.isArray(navigator.languages)) {
      candidates.push(...navigator.languages);
    }
    if (navigator.language) {
      candidates.push(navigator.language);
    }
    for (const candidate of candidates) {
      const normalized = normalizeLanguage(candidate);
      if (normalized && isSupported(normalized)) {
        return normalized;
      }
    }
    return null;
  }

  async function loadDictionary(lang) {
    if (dictionaries.has(lang)) {
      return dictionaries.get(lang);
    }
    const response = await fetch(`i18n/${lang}.json`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Failed to load dictionary: ${lang}`);
    }
    const dict = await response.json();
    dictionaries.set(lang, dict);
    return dict;
  }

  function getMessage(dict, key) {
    if (!dict) {
      return undefined;
    }
    return key.split('.').reduce((acc, part) => {
      if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
        return acc[part];
      }
      return undefined;
    }, dict);
  }

  function formatMessage(template, params) {
    if (typeof template !== 'string') {
      return template;
    }
    if (!params) {
      return template;
    }
    return template.replace(/\{([^}]+)\}/g, (match, token) => {
      if (Object.prototype.hasOwnProperty.call(params, token)) {
        const value = params[token];
        return value == null ? '' : String(value);
      }
      return match;
    });
  }

  function applyToElement(element) {
    if (!element || !element.dataset) {
      return;
    }

    if (element.dataset.i18n) {
      const text = t(element.dataset.i18n);
      if (text != null) {
        element.textContent = text;
      }
    }

    Object.entries(element.dataset).forEach(([dataKey, value]) => {
      if (!dataKey.startsWith('i18n') || dataKey === 'i18n') {
        return;
      }
      const suffix = dataKey.slice(4);
      if (!suffix) {
        return;
      }
      const translation = t(value);
      if (translation == null) {
        return;
      }
      switch (suffix) {
        case 'Html':
          element.innerHTML = translation;
          break;
        case 'Text':
          element.textContent = translation;
          break;
        case 'Value':
          if ('value' in element) {
            element.value = translation;
          } else {
            element.setAttribute('value', translation);
          }
          break;
        default: {
          const attrName = suffix
            .replace(/^[A-Z]/, char => char.toLowerCase())
            .replace(/[A-Z]/g, char => `-${char.toLowerCase()}`);
          element.setAttribute(attrName, translation);
        }
      }
    });
  }

  function collectElements(root) {
    if (root instanceof Document) {
      return [root.documentElement, ...root.querySelectorAll('*')];
    }
    if (root instanceof Element || root instanceof DocumentFragment) {
      return [root, ...root.querySelectorAll('*')];
    }
    return [];
  }

  function applyToDOM(root) {
    const scope = root || document;
    const elements = collectElements(scope);
    elements.forEach(element => {
      if (!element || !element.dataset) {
        return;
      }
      const hasI18nKeys = Object.keys(element.dataset).some(key =>
        key === 'i18n' || key.startsWith('i18n')
      );
      if (hasI18nKeys) {
        applyToElement(element);
      }
    });
  }

  function resolveInitialLanguage() {
    const params = new URLSearchParams(window.location.search);
    const queryLang = normalizeLanguage(params.get('lang'));
    if (queryLang && isSupported(queryLang)) {
      return { lang: queryLang, source: 'query' };
    }

    const stored = getStoredLanguage();
    if (stored && isSupported(stored.lang)) {
      return stored;
    }

    const defaultLang = getDefaultLanguage();
    if (defaultLang) {
      return { lang: defaultLang, source: 'default' };
    }

    const browserLang = getBrowserLanguage();
    if (browserLang) {
      return { lang: browserLang, source: 'browser' };
    }

    return { lang: 'en', source: 'fallback' };
  }

  async function setLang(lang, options = {}) {
    const { persist } = options;
    const normalized = normalizeLanguage(lang) || getDefaultLanguage();
    const target = isSupported(normalized) ? normalized : getDefaultLanguage();
    if (target === currentLanguage && initialized) {
      return currentLanguage;
    }

    let dictionary = fallbackDictionary;
    let fallbackUsed = false;
    if (target !== 'en') {
      try {
        dictionary = await loadDictionary(target);
      } catch (error) {
        console.warn(`[i18n] Failed to load dictionary for ${target}.`, error);
        dictionary = fallbackDictionary;
        fallbackUsed = true;
      }
    }

    currentLanguage = fallbackUsed ? 'en' : target;
    currentDictionary = dictionary;
    document.documentElement.setAttribute('lang', currentLanguage);

    const shouldPersist = typeof persist === 'boolean' ? persist : initialized;
    if (shouldPersist) {
      persistStoredLanguage(currentLanguage, options.source || 'user');
    }

    applyToDOM();
    document.dispatchEvent(
      new CustomEvent('i18n:change', { detail: { lang: currentLanguage } })
    );
    return currentLanguage;
  }

  function t(key, params) {
    if (typeof key !== 'string' || !key) {
      return key;
    }
    const message = getMessage(currentDictionary, key);
    if (message != null) {
      return formatMessage(message, params);
    }
    const fallback = getMessage(fallbackDictionary, key);
    if (fallback != null) {
      return formatMessage(fallback, params);
    }
    return key;
  }

  async function init() {
    if (initialized) {
      return currentLanguage;
    }

    config = Object.assign({ defaultLanguage: 'en' }, window.APP_CONFIG || {});

    fallbackDictionary = await loadDictionary('en');
    currentDictionary = fallbackDictionary;
    currentLanguage = 'en';
    document.documentElement.setAttribute('lang', currentLanguage);

    const initialSelection = resolveInitialLanguage();
    await setLang(initialSelection.lang, {
      persist: false,
      source: initialSelection.source
    });

    initialized = true;
    return currentLanguage;
  }

  window.i18n = {
    init,
    setLang,
    t,
    applyToDOM,
    getCurrentLang() {
      return currentLanguage;
    },
    getSupportedLanguages() {
      return [...SUPPORTED_LANGUAGES];
    }
  };
})();
