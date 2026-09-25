import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse } from 'acorn'

const assets = new URL('../dist/assets/', import.meta.url)
const files = (await readdir(assets)).filter((file) => file.includes('-legacy-') && file.endsWith('.js'))
if (!files.length) throw new Error('Не найдена сборка для старых телевизоров')
const worker = await readFile(new URL('../dist/sw.js', import.meta.url), 'utf8')
const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')
for (const file of files) {
  try {
    parse(await readFile(new URL(file, assets), 'utf8'), { ecmaVersion: 5, sourceType: 'script' })
  } catch (cause) {
    throw new Error(`Несовместимый с ES5 файл: ${fileURLToPath(new URL(file, assets))}`, { cause })
  }
  if (!worker.includes(`assets/${file}`)) throw new Error(`Legacy-файл отсутствует в офлайн-кэше: ${file}`)
  if (file.startsWith('polyfills-legacy-') && !html.includes(file)) {
    throw new Error(`HTML не ссылается на актуальные полифиллы: ${file}`)
  }
}
console.log(`Совместимость со старыми ТВ: ${files.length} JS-файла проверены как ES5.`)
