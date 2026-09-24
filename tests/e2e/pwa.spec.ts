import { expect, test, type Page } from '@playwright/test'
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'

test('production output has valid /tod/ PWA metadata and no development materials', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveURL(/\/tod\/$/)
  await expect(page.getByRole('heading', { name: 'Правда или Действие' })).toBeVisible()

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
  expect(runtimeText).not.toContain('/truth-or-dare/')
  expect(runtimeText).not.toContain('localhost')

  const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8')
  for (const required of ['actions/checkout@v4', 'actions/setup-node@v4', 'npm ci', 'npm run build', 'actions/upload-pages-artifact@v3', 'actions/deploy-pages@v4']) {
    expect(workflow).toContain(required)
  }
  expect(readFileSync('playwright.config.ts', 'utf8')).toContain('reuseExistingServer: false')
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
