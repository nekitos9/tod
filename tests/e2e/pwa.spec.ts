import { expect, test, type Page } from '@playwright/test'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

test('production output has valid /tod/ PWA metadata and no development materials', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveURL(/\/tod\/$/)
  await expect(page.getByRole('heading', { name: 'Правда или Действие' })).toBeVisible()
  await expect(page.locator('html')).not.toHaveClass(/old-tv/)
  await expect(page.locator('link[rel="stylesheet"][href*="old-tv"]')).toHaveCount(0)

  const manifest = await page.evaluate(async () => {
    const href = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')?.href
    if (!href) throw new Error('Manifest link is missing')
    const response = await fetch(href)
    return { body: await response.json(), contentType: response.headers.get('content-type'), href }
  })
  expect(manifest.href).toMatch(/\/tod\/manifest\.webmanifest$/)
  expect(manifest.contentType).toContain('manifest')
  expect(manifest.body).toMatchObject({
    display: 'standalone',
    scope: '/tod/',
    start_url: '/tod/',
    theme_color: '#427cbe',
  })
  expect(manifest.body.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ sizes: '192x192', type: 'image/png' }),
    expect.objectContaining({ sizes: '512x512', type: 'image/png' }),
    expect.objectContaining({ purpose: 'maskable', sizes: '512x512' }),
  ]))
  for (const icon of manifest.body.icons) {
    const response = await page.request.get(new URL(icon.src, manifest.href).href)
    expect(response.ok()).toBe(true)
    expect(response.headers()['content-type']).toBe('image/png')
  }

  await waitForServiceWorker(page)
  expect(await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL)).toMatch(/\/tod\/sw\.js$/)

  const files = listFiles('dist')
  expect(files).not.toEqual(expect.arrayContaining([
    expect.stringMatching(/docs|design-reference|\.xlsx$|\.docx$|tests|figmacapture/i),
  ]))
  const runtimeText = files
    .filter((file) => /\.(?:html|js|css|webmanifest)$/.test(file))
    .map((file) => readFileSync(join('dist', file), 'utf8'))
    .join('\n')
  expect(runtimeText.includes('/truth-or-dare/')).toBe(false)
  // The URL polyfill recognizes the literal hostname "localhost" itself.
  // Reject actual development URLs, not that standard URL parsing branch.
  expect(/https?:\/\/(?:localhost|127\.0\.0\.1)(?=[:/])/.test(runtimeText)).toBe(false)

  const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8')
  for (const required of ['actions/checkout@v4', 'actions/setup-node@v4', 'npm ci', 'npm run build', 'actions/upload-pages-artifact@v3', 'actions/deploy-pages@v4']) {
    expect(workflow).toContain(required)
  }
  expect(readFileSync('playwright.config.ts', 'utf8')).toContain('reuseExistingServer: false')
})

test('legacy bundle starts and plays without Array.at or dynamic viewport units', async ({ browser, baseURL }) => {
  // Exercise emitted legacy files, not just a TV user agent in modern Chromium.
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block', viewport: { width: 1280, height: 720 } })
  try {
    await context.addInitScript(() => { Reflect.deleteProperty(Array.prototype, 'at') })
    await context.route('**/tod/', async (route) => {
      const response = await route.fetch()
      const html = (await response.text())
        .replace(/<script\b[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g, '')
        .replace(/\snomodule\b/g, '')
      await route.fulfill({ response, body: html })
    })
    await context.route('**/*.css', async (route) => {
      const response = await route.fetch()
      const css = (await response.text()).replace(/[\w-]+\s*:[^;{}]*dvh[^;{}]*(;|(?=}))/g, '')
      await route.fulfill({ response, body: css })
    })
    const page = await context.newPage()
    const errors: string[] = []
    const scripts: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    page.on('request', (request) => { if (request.resourceType() === 'script') scripts.push(request.url()) })
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Правда или Действие' })).toBeVisible()
    expect(await page.locator('.setup-screen__scroll').evaluate((element) => element.clientHeight)).toBe(720)
    expect(scripts.some((url) => /index-legacy-/.test(url))).toBe(true)
    expect(scripts.some((url) => /\/index-(?!legacy-)/.test(url))).toBe(false)
    expect(await page.evaluate(() => [1, 2].at(-1))).toBe(2)
    await startGame(page, false, 'Другие люди')
    await page.getByRole('button', { name: 'Действие', exact: true }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.game-card:not([aria-hidden]) .game-card__copy')).toBeVisible()
    await page.getByRole('button', { name: 'Готово' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Игрок 2' })).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await context.close()
  }
})

test('webOS 3 compatibility renders without CSS variables, Grid and newer DOM APIs', async ({ browser, baseURL }, testInfo) => {
  test.setTimeout(90_000)
  const context = await browser.newContext({ baseURL, serviceWorkers: 'block', viewport: { width: 1280, height: 720 } })
  try {
    await context.addInitScript(() => {
      CSS.supports = () => false
      Reflect.deleteProperty(Element.prototype, 'closest')
      Reflect.deleteProperty(Node.prototype, 'isConnected')
      Reflect.deleteProperty(KeyboardEvent.prototype, 'key')
      Reflect.deleteProperty(Navigator.prototype, 'serviceWorker')
      Reflect.deleteProperty(Intl.DateTimeFormat.prototype, 'formatToParts')
      Reflect.deleteProperty(Array.prototype, 'at')
      Math.random = () => 0
    })
    await context.route('**/tod/', async (route) => {
      const response = await route.fetch()
      await route.fulfill({ response, body: (await response.text())
        .replace(/<script\b[^>]*type="module"[^>]*>[\s\S]*?<\/script>/g, '')
        .replace(/\snomodule\b/g, '') })
    })
    await context.route('**/*.css', async (route) => {
      const response = await route.fetch()
      const body = (await response.text())
        .replace(/--[\w-]+\s*:[^;{}]*(;|(?=}))/g, '')
        .replace(/[\w-]+\s*:[^;{}]*(?:var\(|dvh|clamp\(|min\(|max\()[^;{}]*(;|(?=}))/g, '')
        .replace(/(?:grid[\w-]*|gap|row-gap|column-gap|inset|[\w-]+-inline[\w-]*)\s*:[^;{}]*(;|(?=}))/g, '')
        .replace(/display:\s*(?:inline-)?grid\s*(;|(?=}))/g, '')
      await route.fulfill({ response, body })
    })
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.goto('./')
    await expect(page.getByRole('heading', { name: 'Правда или Действие' })).toBeVisible()
    await expect(page.locator('html')).toHaveClass(/old-tv/)
    await page.keyboard.press('ArrowDown')
    expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true)
    await page.getByRole('button', { name: 'Начать' }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: 'Добавить игрока' }).click()
    await page.getByRole('button', { name: 'Удалить последнего игрока' }).click()
    await expect(page.getByRole('textbox', { name: 'Имя игрока' })).toHaveCount(2)
    await page.getByRole('button', { name: 'Открыть справку о настройках игроков' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('button', { name: 'Ясно' }).click()
    await expect(page.getByRole('dialog')).not.toBeVisible()
    for (let index = 0; index < 2; index += 1) {
      await page.getByRole('textbox', { name: 'Имя игрока' }).nth(index).fill(`Игрок ${index + 1}`)
      await page.getByRole('combobox', { name: 'Грань игрока' }).nth(index).selectOption('full')
    }
    await page.screenshot({ path: testInfo.outputPath('old-tv-players.png') })
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('checkbox', { name: 'Другие люди' }).check({ force: true })
    await page.getByRole('button', { name: 'Далее' }).click()
    await page.getByRole('button', { name: 'Действие', exact: true }).focus()
    await page.keyboard.press('Enter')
    const before = await persistedGame(page)
    expect(before.currentTurn?.phoneNumber).toMatch(/^\+7 \(9\d{2}\) \d{3}-\d{2}-\d{2}$/)
    await page.screenshot({ path: testInfo.outputPath('old-tv-game.png') })
    const card = await page.locator('.game-card:not([aria-hidden])').boundingBox()
    expect(card && card.width > 400 && card.height > 300).toBe(true)
    await page.reload()
    await page.getByRole('button', { name: 'Продолжить' }).click()
    expect(await persistedGame(page)).toEqual(before)
    await page.getByRole('button', { name: 'Готово' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'Игрок 2' })).toBeVisible()
    await finishGame(page)
    await expect(page.getByRole('heading', { name: 'Результаты' })).toBeVisible()
    expect(errors).toEqual([])
  } finally {
    await context.close()
  }
})

test('automatic gameplay reaches Results while the browser is offline', async ({ context, page }) => {
  await page.goto('./')
  await waitForServiceWorker(page)
  await startGame(page, false, 'Другие люди')
  await context.setOffline(true)

  await page.getByRole('button', { name: 'Действие' }).click()
  const firstCard = await page.locator('.game-card:not([aria-hidden]) .game-card__copy').textContent()
  await page.getByRole('button', { name: 'Перезадать' }).click()
  await page.getByRole('dialog', { name: 'Замена' }).getByRole('button', { name: 'Да' }).click()
  await expect.poll(() => page.locator('.game-card:not([aria-hidden]) .game-card__copy').textContent()).not.toBe(firstCard)
  await page.getByRole('button', { name: 'Готово' }).click()
  await expect(page.getByRole('heading', { name: 'Игрок 2' })).toBeVisible()
  await page.getByRole('button', { name: 'Действие' }).click()
  await page.getByRole('button', { name: 'Пропуск' }).click()
  await page.getByRole('dialog', { name: 'Пропуск?' }).getByRole('button', { name: 'Он так захотел' }).click()
  await expect(page.getByRole('heading', { name: 'Игрок 1' })).toBeVisible()
  await finishGame(page)
  await expect(page.getByRole('heading', { name: 'Результаты' })).toBeVisible()
})

test('offline reopen restores the exact unfinished card and continues locally', async ({ context, page }) => {
  await page.addInitScript(() => { Math.random = () => 0 })
  await page.goto('./')
  await waitForServiceWorker(page)
  await startGame(page, false, 'Другие люди')
  await page.getByRole('button', { name: 'Действие' }).click()
  const before = await persistedGame(page)
  expect(before.currentTurn).not.toBeNull()

  await page.close()
  await context.setOffline(true)
  const reopened = await context.newPage()
  await reopened.goto('./')
  await expect(reopened.getByRole('dialog', { name: 'Вижу незаконченную игру' })).toBeVisible()
  await reopened.getByRole('button', { name: 'Продолжить' }).click()

  const after = await persistedGame(reopened)
  expect(after).toEqual(before)
  await expect(reopened.locator('.game-card:not([aria-hidden]) .game-card__copy')).toHaveText(before.currentTurn?.resolvedText ?? '')
  await reopened.getByRole('button', { name: 'Готово' }).click()
  await expect(reopened.getByRole('heading', { name: 'Игрок 2' })).toBeVisible()
})

test('manual mode can issue and complete a pack card entirely offline', async ({ context, page }) => {
  await page.goto('./')
  await waitForServiceWorker(page)
  await startGame(page, true, 'Другие люди')
  await context.setOffline(true)

  await page.getByRole('button', { name: 'Действие' }).click()
  await page.getByRole('button', { name: 'Выдать' }).click()
  await expect(page.locator('.game-card:not([aria-hidden]) .game-card__copy')).not.toHaveText(/Стол задает/)
  await page.getByRole('button', { name: 'Готово' }).click()
  await expect(page.getByRole('heading', { name: 'Игрок 2' })).toBeVisible()
  expect((await persistedGame(page)).mode).toBe('manual')
})

test('activates a changed service worker without losing an unfinished game', async ({ page }) => {
  await page.goto('./')
  await waitForServiceWorker(page)
  await startGame(page, false, 'Другие люди')
  await page.getByRole('button', { name: 'Действие' }).click()
  const before = await persistedGame(page)
  const swPath = join('dist', 'sw.js')
  const original = readFileSync(swPath, 'utf8')
  try {
    writeFileSync(swPath, `${original}\n/* e2e-update-${Date.now()} */\n`)
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      const changed = new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }))
      await registration.update()
      await changed
    })
    await page.reload()
    const dialog = page.getByRole('dialog', { name: 'Вижу незаконченную игру' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Продолжить' }).click()
    expect(await persistedGame(page)).toEqual(before)
  } finally {
    writeFileSync(swPath, original)
  }
})

async function waitForServiceWorker(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await expect(page.getByRole('heading', { name: 'Правда или Действие' })).toBeVisible()
}

async function startGame(page: Page, manual: boolean, pack: string) {
  await page.getByRole('button', { name: 'Начать' }).click()
  await page.getByRole('button', { name: 'Далее' }).click()
  const names = page.getByRole('textbox', { name: 'Имя игрока' })
  const boundaries = page.getByRole('combobox', { name: 'Грань игрока' })
  for (let index = 0; index < await names.count(); index += 1) {
    await names.nth(index).fill(`Игрок ${index + 1}`)
    await boundaries.nth(index).selectOption('full')
  }
  if (manual) await page.getByRole('switch').click()
  await page.getByRole('button', { name: 'Далее' }).click()
  await page.getByRole('checkbox', { name: pack }).check({ force: true })
  await page.getByRole('button', { name: 'Далее' }).click()
  await expect(page.getByRole('heading', { name: 'Игрок 1' })).toBeVisible()
}

async function finishGame(page: Page) {
  await page.getByRole('button', { name: 'Выход' }).click()
  await page.getByRole('dialog', { name: 'Конец?' }).getByRole('button', { name: 'Да' }).click()
  await page.getByRole('dialog', { name: 'Точно конец?' }).getByRole('button', { name: 'Да' }).click()
}

async function persistedGame(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('truth-or-dare:unfinished-game')
    if (!raw) throw new Error('Persisted game is missing')
    return JSON.parse(raw).game as {
      currentPlayerIndex: number
      currentTurn: { phoneNumber: string | null; resolvedText: string; secondaryPlayerIds: string[] } | null
      mode: 'automatic' | 'manual'
      players: unknown[]
      queue: string[]
      usedCardIds: string[]
    }
  })
}

function listFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    return entry.isDirectory() ? listFiles(path) : [relative('dist', path)]
  })
}
