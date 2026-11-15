import { t } from './i18n';

export const ASSISTANT_CONFIG = {
  apiUrl: 'https://api.groq.com/openai/v1/chat/completions',

  apiKey: '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',

  model: 'openai/gpt-oss-120b',

  get systemPrompt() {
    return t('ai.system');
  },
};
