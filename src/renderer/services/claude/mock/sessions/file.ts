import type { ClaudeJsonLine } from '@/shared/rpc'

import { assistantText, callId, toolCallPair, ts, userText } from './helpers'

export function fileLines(): ClaudeJsonLine[] {
  const lines: ClaudeJsonLine[] = []
  const t0 = ts(0, 3)
  const t1 = ts(0, 2)
  const t2 = ts(0, 1)
  const t3 = ts(0, 0)

  lines.push(
    userText(
      'Read the first few lines of src/index.ts, inspect the neighboring config.ts, then create README with an explanatory line.',
      { ts: t0 },
    ),
  )

  lines.push(assistantText('Sure, I will read the first 5 lines of src/index.ts.', { ts: t0 }))

  const indexId = callId()
  const indexContent = `import { createApp } from 'vue'
import App from './app.vue'
import router from './router'
import './index.css'
createApp(App).use(router).mount('#app')`
  const indexResult = `1\timport { createApp } from 'vue'
2\timport App from './app.vue'
3\timport router from './router'
4\timport './index.css'
5\tcreateApp(App).use(router).mount('#app')`
  lines.push(
    ...toolCallPair(
      'Read',
      { file_path: '/Users/zhanghuabin/Projects/zhbhun/demo/src/index.ts', limit: 5 },
      indexResult,
      {
        id: indexId,
        ts: t0,
        toolUseResult: {
          type: 'text',
          file: {
            filePath: '/Users/zhanghuabin/Projects/zhbhun/demo/src/index.ts',
            content: indexContent,
            numLines: 5,
            startLine: 1,
            totalLines: 42,
          },
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'The entry file is read. Next, read the neighboring config.ts, router.ts, and store.ts consecutively.',
      {
        ts: t1,
      },
    ),
  )

  const configId = callId()
  const configContent = `export const API_URL = 'https://api.example.com'
export const TIMEOUT = 5000
export const RETRIES = 3`
  const configResult = `1\texport const API_URL = 'https://api.example.com'
2\texport const TIMEOUT = 5000
3\texport const RETRIES = 3`
  lines.push(
    ...toolCallPair(
      'Read',
      { file_path: '/Users/zhanghuabin/Projects/zhbhun/demo/src/config.ts', offset: 1, limit: 3 },
      configResult,
      {
        id: configId,
        ts: t1,
        toolUseResult: {
          type: 'text',
          file: {
            filePath: '/Users/zhanghuabin/Projects/zhbhun/demo/src/config.ts',
            content: configContent,
            numLines: 3,
            startLine: 1,
            totalLines: 12,
          },
        },
      },
    ),
  )

  const routerId = callId()
  const routerContent = `import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'`
  const routerResult = `1\timport { createRouter, createWebHistory } from 'vue-router'
2\timport Home from '../views/Home.vue'`
  lines.push(
    ...toolCallPair(
      'Read',
      { file_path: '/Users/zhanghuabin/Projects/zhbhun/demo/src/router.ts', offset: 1, limit: 2 },
      routerResult,
      {
        id: routerId,
        ts: t1,
        toolUseResult: {
          type: 'text',
          file: {
            filePath: '/Users/zhanghuabin/Projects/zhbhun/demo/src/router.ts',
            content: routerContent,
            numLines: 2,
            startLine: 1,
            totalLines: 24,
          },
        },
      },
    ),
  )

  const storeId = callId()
  const storeContent = `import { createStore } from 'vuex'
export const store = createStore({})`
  const storeResult = `1\timport { createStore } from 'vuex'
2\texport const store = createStore({})`
  lines.push(
    ...toolCallPair(
      'Read',
      { file_path: '/Users/zhanghuabin/Projects/zhbhun/demo/src/store.ts', offset: 1, limit: 2 },
      storeResult,
      {
        id: storeId,
        ts: t1,
        toolUseResult: {
          type: 'text',
          file: {
            filePath: '/Users/zhanghuabin/Projects/zhbhun/demo/src/store.ts',
            content: storeContent,
            numLines: 2,
            startLine: 1,
            totalLines: 18,
          },
        },
      },
    ),
  )

  lines.push(assistantText('The neighboring files are all read. Now create README.', { ts: t2 }))

  const writeId = callId()
  const readmeContent = '# Demo Project\n\nA Vue 3 starter project.\n'
  lines.push(
    ...toolCallPair(
      'Write',
      { file_path: '/Users/zhanghuabin/Projects/zhbhun/demo/README.md', content: readmeContent },
      'File created successfully at: /Users/zhanghuabin/Projects/zhbhun/demo/README.md',
      {
        id: writeId,
        ts: t2,
        toolUseResult: {
          type: 'create',
          filePath: '/Users/zhanghuabin/Projects/zhbhun/demo/README.md',
          content: readmeContent,
          structuredPatch: [],
          originalFile: null,
          userModified: false,
        },
      },
    ),
  )

  lines.push(
    assistantText('README is created. Now edit one line to document TypeScript support.', {
      ts: t3,
    }),
  )

  const editId = callId()
  lines.push(
    ...toolCallPair(
      'Edit',
      {
        file_path: '/Users/zhanghuabin/Projects/zhbhun/demo/README.md',
        old_string: 'A Vue 3 starter project.',
        new_string: 'A Vue 3 starter project with TypeScript support.',
      },
      'The file /Users/zhanghuabin/Projects/zhbhun/demo/README.md has been updated successfully.',
      {
        id: editId,
        ts: t3,
        toolUseResult: {
          filePath: '/Users/zhanghuabin/Projects/zhbhun/demo/README.md',
          oldString: 'A Vue 3 starter project.',
          newString: 'A Vue 3 starter project with TypeScript support.',
          originalFile: '# Demo Project\n\nA Vue 3 starter project.\n',
          structuredPatch: [
            {
              oldStart: 1,
              oldLines: 3,
              newStart: 1,
              newLines: 3,
              lines: [
                ' # Demo Project',
                ' ',
                '-A Vue 3 starter project.',
                '+A Vue 3 starter project with TypeScript support.',
              ],
            },
          ],
          userModified: false,
          replaceAll: false,
        },
      },
    ),
  )

  lines.push(
    assistantText(
      'Done. I read index.ts, config.ts, router.ts, and store.ts, then created and updated README.md.',
      { ts: t3 },
    ),
  )

  return lines
}
