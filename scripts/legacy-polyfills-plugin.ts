import { createHash } from 'node:crypto'
import { readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { transformAsync } from '@babel/core'
import { parse } from 'acorn'
import type { Plugin } from 'vite'

// plugin-legacy's nested Rolldown build emits ES2015 wrappers in its polyfill
// bundle even with Chrome 38 targets. Adapt that bundle before PWA precaching.
export function legacyPolyfillsES5(): Plugin {
  let output = ''
  return {
    name: 'tv-polyfills-es5',
    apply: 'build',
    configResolved(config) { output = resolve(config.root, config.build.outDir) },
    closeBundle: {
      order: 'pre',
      sequential: true,
      async handler(error) {
        if (error) return
        const assets = resolve(output, 'assets')
        const files = (await readdir(assets)).filter((file) => /^polyfills-legacy-.*\.js$/.test(file))
        for (const file of files) {
          const code = await readFile(resolve(assets, file), 'utf8')
          try {
            parse(code, { ecmaVersion: 5 })
            continue
          } catch { /* The final ES5 check below must pass after conversion. */ }
          const result = await transformAsync(code, {
            babelrc: false, configFile: false, sourceType: 'script',
            comments: false, compact: true,
            presets: [['@babel/preset-env', { targets: { chrome: '38' }, modules: false, useBuiltIns: false }]],
          })
          if (!result?.code) throw new Error(`Не удалось преобразовать ${file} в ES5`)
          parse(result.code, { ecmaVersion: 5 })
          const hash = createHash('sha256').update(result.code).digest('hex').slice(0, 12)
          const nextFile = `polyfills-legacy-${hash}.js`
          const htmlPath = resolve(output, 'index.html')
          const html = await readFile(htmlPath, 'utf8')
          if (!html.includes(file)) throw new Error(`В HTML отсутствует ссылка на ${file}`)
          await writeFile(resolve(assets, nextFile), result.code)
          await writeFile(htmlPath, html.replaceAll(file, nextFile))
          await unlink(resolve(assets, file))
        }
      },
    },
  }
}
