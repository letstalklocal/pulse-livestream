// This prototype validates native phone disk caching, not browser caching.
import { createVideoCache } from './core';
export const videoCache = createVideoCache({
  read: async () => [], write: async () => {}, exists: async () => false,
  remove: async () => {}, uri: file => file,
  download: async () => { throw new Error('native-required'); },
});
