import { expect, test, type Page } from '@playwright/test'

const viewports = [
  { width: 320, height: 480 },
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 360, height: 780 },
  { width: 384, height: 824 },
  { width: 412, height: 915 },
  { width: 424, height: 917 },
  { width: 740, height: 360 },
  { width: 768, height: 1024 },
  { width: 900, height: 700 },
  { width: 1024, height: 768 },
  { width: 1100, height: 800 },
  { width: 1280, height: 800 },
  { width: 1300, height: 800 },
  { width: 1440, height: 1024 },
  { width: 1920, height: 1080 },
]

for (const viewport of viewports) {
  test(`${viewport.width}x${viewport.height} keeps setup screens free of horizontal overflow`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Правда или Действие' })).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await page.getByRole('button', { name: 'Начать' }).click()
    await expect(page.getByRole('heading', { name: 'Правила игры' })).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await page.getByRole('button', { name: 'Далее' }).click()
    await expect(page.getByRole('heading', { name: 'Игроки' })).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await assertPlayerCardsDoNotOverlap(page)
    await completePlayers(page)
    await expect(page.getByRole('heading', { name: 'Паки вопросов' })).toBeVisible()
    await assertNoHorizontalOverflow(page)
    await assertPackCardsDoNotOverlap(page)
  })
}

test('mobile setup typography and player controls stay inside their available boxes', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  await page.goto('/')
  await expectElementsDoNotOverlap(page, '.welcome h1', '.welcome__greeting')
  await page.getByRole('button', { name: 'Начать' }).click()
  await page.getByRole('button', { name: 'Далее' }).click()

  const boundaries = page.getByRole('combobox', { name: 'Грань игрока' })
  await boundaries.first().selectOption('full')
  await expect(boundaries.first()).toHaveValue('full')
  expect(await page.locator('.player-card').evaluateAll((cards) => cards.every((card) => {
    const cardRect = card.getBoundingClientRect()
    return [...card.querySelectorAll<HTMLElement>('.player-card__boundary, .relationship-toggle')].every((control) => {
      const rect = control.getBoundingClientRect()
      return rect.left >= cardRect.left && rect.right <= cardRect.right && control.scrollWidth <= control.clientWidth
    })
  }))).toBe(true)
  expect(await page.getByRole('switch').evaluate((mode) => {
    const rect = mode.getBoundingClientRect()
    return rect.left >= 0 && rect.right <= document.documentElement.clientWidth && mode.scrollWidth <= mode.clientWidth
  })).toBe(true)
})

test('mobile pack badges are centered and descriptions have divider spacing', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  await openPacks(page)
  const badge = page.locator('.pack-card__type').first()
  await expect(badge).toHaveCSS('align-items', 'center')
  await expect(badge).toHaveCSS('justify-content', 'center')
  expect(await page.locator('.pack-card__description').first().evaluate((description) =>
    Number.parseFloat(getComputedStyle(description).marginTop),
  )).toBeGreaterThan(0)
})

for (const viewport of [{ width: 360, height: 740 }, { width: 740, height: 360 }]) {
  test(`game actions remain reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport.height < 500 ? { width: 360, height: 740 } : viewport)
    await startGame(page)
    await page.setViewportSize(viewport)
    await assertNoHorizontalOverflow(page)
    await expectElementsDoNotOverlap(page, '.game-header h1', '.game-header p')
    const exit = page.getByRole('button', { name: 'Выход' })
    await exit.scrollIntoViewIfNeeded()
    await expect(exit).toBeVisible()
    expect(await exit.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
    })).toBe(true)
    expect(await page.locator('.game-screen').evaluate((screen) => screen.scrollHeight >= screen.clientHeight)).toBe(true)
  })
}

test('reaches Players and edits its primary controls using only arrows, Enter and Space', async ({ page }) => {
  await page.goto('/')
  const start = page.getByRole('button', { name: 'Начать' })
  await expect(start).not.toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(start).toBeFocused()
  await page.keyboard.press('Enter')

  const refusal = page.getByRole('checkbox', { name: /От заданий нельзя отказываться/ })
  const absence = page.getByRole('checkbox', { name: /У пользователя есть право пропустить/ })
  const unlimitedReplacement = page.getByRole('checkbox', { name: /Безлимитная «Перезадать»/ })
  const replacementPenalty = page.getByRole('checkbox', { name: /Штраф на «Перезадать»/ })
  await expect(refusal).not.toBeChecked()
  await expect(replacementPenalty).toBeDisabled()
  await page.keyboard.press('ArrowDown')
  await expect(refusal).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(refusal).toBeChecked()
  await page.keyboard.press('ArrowDown')
  await expect(absence).toBeFocused()
  await page.keyboard.press('Space')
  await expect(absence).toBeChecked()
  await page.keyboard.press('Space')
  await expect(absence).not.toBeChecked()
  await page.keyboard.press('ArrowDown')
  await expect(unlimitedReplacement).toBeFocused()
  await page.keyboard.press('Space')
  await expect(unlimitedReplacement).toBeChecked()
  await expect(replacementPenalty).not.toBeChecked()
  await expect(replacementPenalty).toBeEnabled()
  await page.keyboard.press('ArrowDown')
  await expect(replacementPenalty).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(replacementPenalty).toBeChecked()
  await page.keyboard.press('ArrowDown')
  const back = page.getByRole('button', { name: 'Назад' })
  await expect(back).toBeFocused()
  await page.keyboard.press('ArrowRight')
  const rulesNext = page.getByRole('button', { name: 'Далее' })
  await expect(rulesNext).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Игроки' })).toBeVisible()

  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'Открыть справку о настройках игроков' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  const names = page.getByRole('textbox', { name: 'Имя игрока' })
  await expect(names.nth(0)).toBeFocused()
  await page.keyboard.type('Первый')
  await page.keyboard.press('ArrowDown')
  const boundaries = page.getByRole('combobox', { name: 'Грань игрока' })
  await expect(boundaries.nth(0)).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(boundaries.nth(0)).toHaveValue('virgin')
  await page.keyboard.press('ArrowRight')
  const relationships = page.getByRole('checkbox', { name: 'Отношения' })
  await expect(relationships.nth(0)).toBeFocused()
  await page.keyboard.press('Space')
  await expect(relationships.nth(0)).toBeChecked()
  await expect(relationships.nth(0)).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(boundaries.nth(0)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(relationships.nth(0)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(boundaries.nth(1)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(names.nth(1)).toBeFocused()
  await page.keyboard.type('Второй')
  await page.keyboard.press('ArrowDown')
  await expect(boundaries.nth(1)).toBeFocused()
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(boundaries.nth(1)).toHaveValue('virgin')
})

test('keeps focus valid when players are added and removed with the keyboard', async ({ page }) => {
  await openPlayers(page)
  const add = page.getByRole('button', { name: 'Добавить игрока' })
  await add.focus()
  await page.keyboard.press('Enter')
  const names = page.getByRole('textbox', { name: 'Имя игрока' })
  await expect(names.nth(2)).toBeFocused()
  await page.keyboard.type('Третий')

  const remove = page.getByRole('button', { name: 'Удалить последнего игрока' })
  await remove.focus()
  await page.keyboard.press('Space')
  await expect(names).toHaveCount(2)
  await expect(names.nth(1)).toBeFocused()
})

test('keeps the player help close button clear of the dialog on a low wide viewport', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 640 })
  await openPlayers(page)
  await page.getByRole('button', { name: 'Открыть справку о настройках игроков' }).click()

  const overlaps = await page.evaluate(() => {
    const surface = document.querySelector('.players-help__surface')?.getBoundingClientRect()
    const close = document.querySelector('.players-help__close')?.getBoundingClientRect()
    if (!surface || !close) return true
    return !(close.bottom <= surface.top || close.top >= surface.bottom || close.right <= surface.left || close.left >= surface.right)
  })
  expect(overlaps).toBe(false)
})

test('keeps focus trapped and restores it for setup and game dialogs', async ({ page }) => {
  await openPlayers(page)
  const help = page.getByRole('button', { name: 'Открыть справку о настройках игроков' })
  await help.focus()
  await page.keyboard.press('Enter')
  const helpDialog = page.getByRole('dialog', { name: 'Грани и «Отношения»' })
  await expect(helpDialog.getByRole('button', { name: 'Закрыть справку' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(help).toBeFocused()

  await completePlayers(page)
  await page.getByRole('checkbox', { name: 'Обычный' }).check({ force: true })
  await page.getByRole('button', { name: 'Далее' }).click()
  const exit = page.getByRole('button', { name: 'Выход' })
  await exit.focus()
  await page.keyboard.press('Enter')
  const exitDialog = page.getByRole('dialog', { name: 'Конец?' })
  await expect(exitDialog.getByRole('button', { name: 'Да' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(exitDialog.getByRole('button', { name: 'Нет' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(exit).toBeFocused()
})

test('enters Packs and selects a pack without mouse or Tab', async ({ page }) => {
  await page.goto('/')
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'Начать' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Правила игры' })).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('checkbox', { name: /От заданий нельзя отказываться/ })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('checkbox', { name: /У пользователя есть право пропустить/ })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('checkbox', { name: /Безлимитная «Перезадать»/ })).toBeFocused()
  await expect(page.getByRole('checkbox', { name: /Штраф на «Перезадать»/ })).toBeDisabled()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'Назад' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Далее' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Игроки' })).toBeVisible()

  const names = page.getByRole('textbox', { name: 'Имя игрока' })
  const boundaries = page.getByRole('combobox', { name: 'Грань игрока' })
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'Открыть справку о настройках игроков' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(names.nth(0)).toBeFocused()
  await page.keyboard.type('Первый')
  await expect(names.nth(0)).toHaveValue('Первый')
  await page.keyboard.press('ArrowDown')
  await expect(boundaries.nth(0)).toBeFocused()
  await chooseFirstSelectOption(page)
  await expect(boundaries.nth(0)).toHaveValue('virgin')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowUp')
  await expect(names.nth(1)).toBeFocused()
  await page.keyboard.type('Второй')
  await expect(names.nth(1)).toHaveValue('Второй')
  await page.keyboard.press('ArrowDown')
  await expect(boundaries.nth(1)).toBeFocused()
  await chooseFirstSelectOption(page)
  await expect(boundaries.nth(1)).toHaveValue('virgin')

  const playersNext = page.getByRole('button', { name: 'Далее' })
  await expect(playersNext).toBeEnabled()
  for (let step = 0; step < 8 && !(await playersNext.evaluate((element) => element === document.activeElement)); step += 1) {
    await page.keyboard.press('ArrowDown')
  }
  await expect(playersNext).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Паки вопросов' })).toBeVisible()

  await page.keyboard.press('ArrowDown')
  const ordinary = page.getByRole('checkbox', { name: 'Обычный' })
  await expect(ordinary).toBeFocused()
  await page.keyboard.press('Space')
  await expect(ordinary).toBeChecked()
  await expect(page.getByRole('button', { name: 'Далее' })).toBeEnabled()
})

test('moves predictably through the three-column pack grid and skips disabled packs', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1024 })
  await openPacks(page)
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('checkbox', { name: 'Обычный' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('checkbox', { name: 'Личное-публичное' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('checkbox', { name: 'Нижний мир' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('checkbox', { name: 'Другие люди' })).toBeFocused()
  await page.keyboard.press('Space')
  await expect(page.getByRole('checkbox', { name: 'Другие люди' })).toBeChecked()

  await page.getByRole('button', { name: 'Назад' }).click()
  for (const boundary of await page.getByRole('combobox', { name: 'Грань игрока' }).all()) await boundary.selectOption('virgin')
  for (const relationship of await page.getByRole('checkbox', { name: 'Отношения' }).all()) await relationship.check()
  await page.getByRole('button', { name: 'Далее' }).click()
  await expect(page.getByRole('checkbox', { name: 'Горячий' })).toBeDisabled()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('checkbox', { name: 'Обычный' })).toBeFocused()
})

test('scrolls the complete checkbox label above fixed navigation when focused', async ({ page }) => {
  await page.setViewportSize({ width: 424, height: 917 })
  await page.goto('/')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')

  const absence = page.getByRole('checkbox', { name: /У пользователя есть право пропустить/ })
  await expect(absence).toBeFocused()
  await expect.poll(async () => page.evaluate(() => {
    const checkbox = document.querySelector<HTMLInputElement>('input[type="checkbox"]:focus')
    const label = checkbox?.closest('label')
    const navigation = document.querySelector('.bottom-navigation')
    if (!label || !navigation) return false
    return label.getBoundingClientRect().bottom <= navigation.getBoundingClientRect().top
  })).toBe(true)
})

test('keeps BottomNavigation as the final logical row with many players', async ({ page }) => {
  await page.setViewportSize({ width: 424, height: 917 })
  await openPlayers(page)
  const add = page.getByRole('button', { name: 'Добавить игрока' })
  for (let index = 0; index < 6; index += 1) await add.click()
  for (const [index, input] of (await page.getByRole('textbox', { name: 'Имя игрока' }).all()).entries()) {
    await input.fill(`Игрок ${index + 1}`)
  }
  const back = page.getByRole('button', { name: 'Назад' })
  const next = page.getByRole('button', { name: 'Далее' })
  await back.focus()
  await page.keyboard.press('ArrowRight')
  await expect(next).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(back).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(page.getByRole('switch')).toBeFocused()
})

test('scrolls focused player controls clear of fixed navigation', async ({ page }) => {
  await page.setViewportSize({ width: 424, height: 917 })
  await openPlayers(page)
  const add = page.getByRole('button', { name: 'Добавить игрока' })
  for (let index = 0; index < 6; index += 1) await add.click()
  await page.getByRole('button', { name: 'Назад' }).focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect.poll(async () => page.evaluate(() => {
    const focused = document.activeElement as HTMLElement | null
    const navigation = document.querySelector('.bottom-navigation')
    if (!focused || !navigation) return false
    return focused.getBoundingClientRect().bottom <= navigation.getBoundingClientRect().top - 12
  })).toBe(true)
})

test('reveals the full focused bottom pack card above navigation', async ({ page }) => {
  await page.setViewportSize({ width: 424, height: 917 })
  await openPacks(page)
  await page.keyboard.press('ArrowDown')
  for (let index = 0; index < 7; index += 1) await page.keyboard.press('ArrowDown')
  await expect.poll(async () => page.evaluate(() => {
    const input = document.activeElement as HTMLInputElement | null
    const card = input?.closest('.pack-card')
    const navigation = document.querySelector('.bottom-navigation')
    if (!card || !navigation) return false
    return card.getBoundingClientRect().bottom <= navigation.getBoundingClientRect().top - 12
  })).toBe(true)
})

test('completes an automatic game turn using only the keyboard on the game screen', async ({ page }) => {
  await startGame(page)
  const truth = page.getByRole('button', { name: 'Правда' })
  await expect(truth).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Готово' })).toBeEnabled()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'Готово' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Игрок 2' })).toBeVisible()
})

test('keeps mobile game-card spacing and choice state free of scrollbar artifacts', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  await startGame(page)
  const choiceHeading = page.locator('.game-card--choosing h2')
  await expect(choiceHeading).toBeVisible()
  expect(await choiceHeading.evaluate((element) => ({
    overflowY: getComputedStyle(element).overflowY,
    paddingTop: Number.parseFloat(getComputedStyle(element).paddingTop),
  }))).toMatchObject({ overflowY: 'hidden', paddingTop: 13 })

  await page.getByRole('button', { name: 'Действие' }).click()
  const card = page.locator('.game-card:not([aria-hidden])')
  expect(await card.locator('.game-card__text').evaluate((element) => getComputedStyle(element).scrollbarWidth)).toBe('none')
  const pack = card.locator('.game-card__pack')
  expect(await pack.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).paddingBottom) >= 13 && element.scrollHeight <= element.clientHeight,
  )).toBe(true)
})

test('keeps all mobile game action icons inset from their touch targets', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  await startGame(page)
  expect(await page.locator('.game-actions .game-action').evaluateAll((buttons) => buttons.every((button) => {
    const control = button.getBoundingClientRect()
    const icon = button.querySelector('span')?.getBoundingClientRect()
    const inset = button.classList.contains('game-action--change-question') ? 6 : 10
    return Boolean(icon && icon.left - control.left >= inset && control.right - icon.right >= inset &&
      icon.top - control.top >= inset && control.bottom - icon.bottom >= inset)
  }))).toBe(true)
})

test('keeps skip and resume dialog actions on one mobile row without wrapping', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await startGame(page)
  await page.getByRole('button', { name: 'Действие' }).click()
  await page.getByRole('button', { name: 'Пропуск' }).click()
  await assertDialogActionsSingleLine(page, 'Пропуск?')
  await page.getByRole('dialog', { name: 'Пропуск?' }).getByRole('button', { name: 'Он так захотел' }).click()
  await page.reload()
  await assertDialogActionsSingleLine(page, 'Вижу незаконченную игру')
})

test('keeps the mobile player-help close control inside viewport and clear of its surface', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 915 })
  await openPlayers(page)
  await page.getByRole('button', { name: 'Открыть справку о настройках игроков' }).click()
  expect(await page.evaluate(() => {
    const surface = document.querySelector('.players-help__surface')?.getBoundingClientRect()
    const close = document.querySelector('.players-help__close')?.getBoundingClientRect()
    if (!surface || !close) return false
    const insideViewport = close.left >= 0 && close.top >= 0 && close.right <= innerWidth && close.bottom <= innerHeight
    const clearOfSurface = close.bottom <= surface.top
    return insideViewport && clearOfSurface
  })).toBe(true)
})

test('reveals focused lower game actions in a 740x360 landscape viewport', async ({ page }) => {
  await startGame(page)
  await page.setViewportSize({ width: 740, height: 360 })
  await page.keyboard.press('Enter')
  for (let index = 0; index < 5; index += 1) await page.keyboard.press('ArrowDown')
  const focused = page.locator(':focus')
  await expect(focused).toHaveAttribute('aria-label', 'Выход')
  await expect.poll(() => focused.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return rect.top >= 0 && rect.bottom <= innerHeight
  })).toBe(true)
})

test('keeps very long player names readable and usable at mobile text scaling', async ({ page }) => {
  await page.setViewportSize({ width: 424, height: 917 })
  await openPlayers(page)
  const names = page.getByRole('textbox', { name: 'Имя игрока' })
  await names.nth(0).fill('СверхдлинноеИмяИгрокаБезЕдиногоПробелаКотороеДолжноПереноситься')
  await names.nth(1).fill('Очень длинное имя игрока с несколькими пробелами для проверки')
  const boundaries = page.getByRole('combobox', { name: 'Грань игрока' })
  await boundaries.nth(0).selectOption('full')
  await boundaries.nth(1).selectOption('full')
  await page.getByRole('button', { name: 'Далее' }).click()
  await page.getByRole('checkbox', { name: 'Обычный' }).check({ force: true })
  await page.getByRole('button', { name: 'Далее' }).click()
  await page.addStyleTag({ content: '.game-card h2, .game-card__text { font-size: 200% !important; }' })
  await page.getByRole('button', { name: 'Действие' }).click()
  await assertNoHorizontalOverflow(page)
  await expect(page.getByRole('button', { name: 'Готово' })).toBeVisible()
  const playerHeading = page.getByRole('heading', {
    name: 'СверхдлинноеИмяИгрокаБезЕдиногоПробелаКотороеДолжноПереноситься',
    exact: true,
  })
  await expect(playerHeading).toBeVisible()
  await expect.poll(() => playerHeading.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
})

test('skips a generated card with a keyboard-only reason dialog flow', async ({ page }) => {
  await startGame(page)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(280)
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'Готово' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'Пропуск' })).toBeFocused()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Пропуск?' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Он так захотел' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('.game-card--skip')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Игрок 2' })).toBeVisible()
})

test('replaces an allowed generated card using only the keyboard on the game screen', async ({ page }) => {
  await startGame(page, 'Другие люди')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(280)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  const replacement = page.getByRole('button', { name: 'Перезадать' })
  await expect(replacement).toBeEnabled()
  await expect(replacement).toBeFocused()
  const activeCopy = page.locator('.game-card:not([aria-hidden]) .game-card__copy')
  const textBefore = await activeCopy.textContent()
  await page.keyboard.press('Enter')
  const dialog = page.getByRole('dialog', { name: 'Замена' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: 'Нет' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(dialog.getByRole('button', { name: 'Да' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(dialog).not.toBeVisible()
  await expect.poll(() => activeCopy.textContent()).not.toBe(textBefore)
  await expect(page.getByRole('heading', { name: 'Игрок 1' })).toBeVisible()
  const replaced = await persistedGame(page)
  await reloadAndContinue(page)
  expect((await persistedGame(page)).currentTurn).toEqual(replaced.currentTurn)
  await expect(page.locator('.game-card:not([aria-hidden]) .game-card__copy')).toHaveText(replaced.currentTurn?.resolvedText ?? '')
})

test('reloads immediately after game start and resumes using only arrows and Enter', async ({ page }) => {
  await startGame(page)
  const before = await persistedGame(page)
  await page.reload()

  const dialog = page.getByRole('dialog', { name: 'Вижу незаконченную игру' })
  const resume = dialog.getByRole('button', { name: 'Продолжить' })
  const restart = dialog.getByRole('button', { name: 'Начать другую' })
  await expect(dialog).toBeVisible()
  await expect(resume).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(restart).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')

  await expect(page.getByRole('heading', { name: 'Игрок 1' })).toBeVisible()
  expect(await persistedGame(page)).toEqual(before)
})

test('reload preserves a resolved card, participants, phone number and queue order', async ({ page }) => {
  await startGame(page, 'Другие люди')
  await page.getByRole('button', { name: 'Действие' }).click()
  const before = await persistedGame(page)
  const resolvedText = before.currentTurn?.resolvedText
  expect(resolvedText).toBeTruthy()

  await reloadAndContinue(page)

  await expect(page.locator('.game-card:not([aria-hidden]) .game-card__copy')).toHaveText(resolvedText ?? '')
  const after = await persistedGame(page)
  expect(after.currentTurn).toEqual(before.currentTurn)
  expect(after.queue).toEqual(before.queue)
  expect(after.usedCardIds).toEqual(before.usedCardIds)
})

test('reload preserves a manual type choice and the exact card issued afterwards', async ({ page }) => {
  await startManualGame(page, 'Другие люди')
  await page.getByRole('button', { name: 'Действие' }).click()
  expect((await persistedGame(page)).selectedType).toBe('dare')

  await reloadAndContinue(page)
  await expect(page.getByRole('button', { name: 'Выдать' })).toBeEnabled()
  await page.getByRole('button', { name: 'Выдать' }).click()
  const issued = await persistedGame(page)
  expect(issued.currentTurn).not.toBeNull()

  await reloadAndContinue(page)
  expect((await persistedGame(page)).currentTurn).toEqual(issued.currentTurn)
  await expect(page.locator('.game-card:not([aria-hidden]) .game-card__copy')).toHaveText(issued.currentTurn?.resolvedText ?? '')
})

test('reload preserves skip counters and cooldown', async ({ page }) => {
  await startGame(page)
  await page.getByRole('button', { name: 'Действие' }).click()
  await page.getByRole('button', { name: 'Пропуск' }).click()
  await page.getByRole('dialog', { name: 'Пропуск?' }).getByRole('button', { name: 'Он так захотел' }).click()
  const before = await persistedGame(page)
  expect(before.cooldown).not.toHaveLength(0)
  expect(before.players[0].refusedDares).toBe(1)

  await reloadAndContinue(page)
  const after = await persistedGame(page)
  expect(after.cooldown).toEqual(before.cooldown)
  expect(after.players).toEqual(before.players)
  await expect(page.getByRole('heading', { name: 'Игрок 2' })).toBeVisible()
})

test('starting another game and completing a game both remove the resumable snapshot', async ({ page }) => {
  await startGame(page)
  await page.reload()
  await page.getByRole('button', { name: 'Начать другую' }).click()
  await expect(page.getByRole('heading', { name: 'Правда или Действие' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('truth-or-dare:unfinished-game'))).toBeNull()

  await startGame(page)
  await finishGame(page)
  await expect(page.getByRole('heading', { name: 'Результаты' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Правда или Действие' })).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Вижу незаконченную игру' })).not.toBeVisible()
})

test('reload torture preserves multi-turn stats, removal, mode switch and pre-exit state', async ({ page }) => {
  test.setTimeout(120_000)
  await startGame(page)
  await page.getByRole('button', { name: 'Действие' }).click()
  await page.getByRole('button', { name: 'Готово' }).click()
  await expect(page.getByRole('heading', { name: 'Игрок 2' })).toBeVisible()
  await page.getByRole('button', { name: 'Правда' }).click()
  await page.getByRole('button', { name: 'Готово' }).click()
  await expect(page.getByRole('heading', { name: 'Игрок 1' })).toBeVisible()
  const afterTurns = await persistedGame(page)
  expect(afterTurns.players[0].completedDares).toBe(1)
  expect(afterTurns.players[1].answeredTruths).toBe(1)
  await reloadAndContinue(page)
  expect((await persistedGame(page)).players).toEqual(afterTurns.players)

  await page.evaluate(() => {
    const key = 'truth-or-dare:unfinished-game'
    const session = JSON.parse(localStorage.getItem(key)!)
    session.setup.removeAfterRefusal = true
    session.game.removeAfterRefusal = true
    session.game.players[0].refusalSkips = 2
    session.game.players[0].refusedDares = 2
    localStorage.setItem(key, JSON.stringify(session))
  })
  await reloadAndContinue(page)
  await page.getByRole('button', { name: 'Действие' }).click()
  await page.getByRole('button', { name: 'Пропуск' }).click()
  await page.getByRole('dialog', { name: 'Пропуск?' }).getByRole('button', { name: 'Он так захотел' }).click()
  expect((await persistedGame(page)).eliminatedPlayers.map((player) => player.id)).toEqual(['player-1'])
  await reloadAndContinue(page)
  await expect(page.getByText('Кажется, у тебя кончились друзья. Начнем заново?')).toBeVisible()

  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await startGame(page)
  await page.evaluate(() => {
    const key = 'truth-or-dare:unfinished-game'
    const session = JSON.parse(localStorage.getItem(key)!)
    session.game.usedCardIds = [...session.game.queue]
    session.game.queue = []
    localStorage.setItem(key, JSON.stringify(session))
  })
  await reloadAndContinue(page)
  await page.getByRole('button', { name: 'Действие' }).click()
  await page.getByRole('dialog', { name: 'Упс..' }).getByRole('button', { name: 'Продолжить' }).click()
  expect((await persistedGame(page)).mode).toBe('manual')
  await reloadAndContinue(page)
  await expect(page.locator('.game-header p')).toHaveText('Ручной')

  const beforeExit = await persistedGame(page)
  await page.getByRole('button', { name: 'Выход' }).click()
  await page.getByRole('dialog', { name: 'Конец?' }).getByRole('button', { name: 'Да' }).click()
  await expect(page.getByRole('dialog', { name: 'Точно конец?' })).toBeVisible()
  await reloadAndContinue(page)
  expect(await persistedGame(page)).toEqual(beforeExit)
})

test('navigates Results and reuses players using only arrows and Enter', async ({ page }) => {
  await startGame(page)
  await finishGame(page)
  await expect(page.getByRole('heading', { name: 'Результаты' })).toBeVisible()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByRole('button', { name: 'С нуля' })).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'С теми же игроками' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'Игроки' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Имя игрока' }).first()).toHaveValue('Игрок 1')
})

test('scrolls Results for twenty players without hiding the final participant', async ({ page }) => {
  test.setTimeout(90_000)
  await page.setViewportSize({ width: 424, height: 917 })
  await openPlayers(page)
  const add = page.getByRole('button', { name: 'Добавить игрока' })
  for (let index = 2; index < 20; index += 1) await add.click()
  await completePlayers(page)
  await page.getByRole('checkbox', { name: 'Обычный' }).check({ force: true })
  await page.getByRole('button', { name: 'Далее' }).click()
  await finishGame(page)
  await expect(page.locator('.results__player')).toHaveCount(20)
  await assertNoHorizontalOverflow(page)
  const scroll = page.locator('.results-screen__scroll')
  await scroll.evaluate((element) => element.scrollTo({ top: element.scrollHeight }))
  await expect.poll(async () => {
    const lastBottom = await page.locator('.results__player').last().evaluate((element) => element.getBoundingClientRect().bottom)
    const navigationTop = await page.locator('.bottom-navigation').evaluate((element) => element.getBoundingClientRect().top)
    return lastBottom <= navigationTop - 12
  }).toBe(true)
})

test('uses reduced motion for game-card completion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await startGame(page)
  await page.getByRole('button', { name: 'Действие' }).click()
  await page.getByRole('button', { name: 'Готово' }).click()
  await expect(page.getByRole('heading', { name: 'Игрок 2' })).toBeVisible()
})

test('decorative game circles do not create an empty extra screen below the content', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 642 })
  await startGame(page)
  await expect.poll(() => page.locator('.game-screen').evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }))).toEqual({ clientHeight: 642, scrollHeight: 642 })
})

test('reduces manual deal and setup content animations', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openPlayers(page)
  const setupAnimation = await page.locator('.players').evaluate((element) => getComputedStyle(element).animationName)
  expect(setupAnimation).toBe('none')
  await completePlayers(page)
  await page.getByRole('checkbox', { name: 'Обычный' }).check({ force: true })
  await page.getByRole('button', { name: 'Назад' }).click()
  await page.getByRole('switch').click()
  await page.getByRole('button', { name: 'Далее' }).click()
  await page.getByRole('button', { name: 'Далее' }).click()
  await page.getByRole('button', { name: 'Действие' }).click()
  const duration = await page.locator('.game-card').evaluate((card) => {
    card.classList.add('game-card--deal')
    return getComputedStyle(card).animationDuration
  })
  expect(['0s', '0.02s']).toContain(duration)
  await page.getByRole('button', { name: 'Выдать' }).click()
  await expect(page.getByRole('button', { name: 'Готово' })).toBeEnabled()
})

for (const viewport of [
  { width: 320, height: 480 },
  { width: 424, height: 917 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 1024 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
]) {
  test(`game layout has no horizontal overflow at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await startGame(page)
    await assertNoHorizontalOverflow(page)
    const exit = page.getByRole('button', { name: 'Выход' })
    await expect(exit).toBeVisible()
    expect(await exit.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight
    })).toBe(true)
  })
}

for (const viewport of [
  { width: 320, height: 480 },
  { width: 424, height: 917 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1440, height: 1024 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
]) {
  test(`Results has no overflow or navigation overlap at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await startGame(page)
    await finishGame(page)
    await assertNoHorizontalOverflow(page)
    expect(await page.locator('.results-screen .bottom-navigation .button').evaluateAll((buttons) =>
      buttons.every((button) => button.scrollHeight <= button.clientHeight && button.scrollWidth <= button.clientWidth),
    )).toBe(true)
    const lastResult = page.locator('.results__player').last()
    const navigation = page.locator('.bottom-navigation')
    expect(await lastResult.evaluate((element, navigationTop) => element.getBoundingClientRect().bottom <= navigationTop, await navigation.evaluate((element) => element.getBoundingClientRect().top))).toBe(true)
  })
}

async function assertNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    body: document.body.scrollWidth,
    document: document.documentElement.scrollWidth,
    viewport: document.documentElement.clientWidth,
  }))
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport)
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport)
}

async function assertDialogActionsSingleLine(page: Page, name: string) {
  const dialog = page.getByRole('dialog', { name })
  await expect(dialog).toBeVisible()
  expect(await dialog.locator('.dialog__actions button').evaluateAll((buttons) => {
    if (buttons.length !== 2) return false
    const [first, second] = buttons.map((button) => button.getBoundingClientRect())
    return Math.abs(first.top - second.top) < 1 && buttons.every((button) => {
      const style = getComputedStyle(button)
      return style.whiteSpace === 'nowrap' && button.scrollWidth <= button.clientWidth
    })
  })).toBe(true)
}

async function expectElementsDoNotOverlap(page: Page, firstSelector: string, secondSelector: string) {
  const boxes = await page.locator(`${firstSelector}, ${secondSelector}`).evaluateAll((elements) =>
    elements.map((element) => element.getBoundingClientRect()).map(({ top, bottom }) => ({ top, bottom })),
  )
  expect(boxes).toHaveLength(2)
  expect(boxes[0].bottom).toBeLessThanOrEqual(boxes[1].top)
}

async function assertPlayerCardsDoNotOverlap(page: Page) {
  const layout = await page.locator('.player-card').evaluateAll((cards) => cards.map((card) => {
    const cardRect = card.getBoundingClientRect()
    const boundaryRect = card.querySelector('.player-card__boundary')?.getBoundingClientRect()
    const relationshipRect = card.querySelector('.relationship-toggle')?.getBoundingClientRect()
    return {
      card: { left: cardRect.left, right: cardRect.right },
      controls: boundaryRect && relationshipRect
        ? { boundaryRight: boundaryRect.right, relationshipLeft: relationshipRect.left }
        : null,
    }
  }))

  for (const item of layout) {
    expect(item.controls).not.toBeNull()
    expect(item.controls?.boundaryRight).toBeLessThanOrEqual(item.controls?.relationshipLeft ?? 0)
  }
  for (let index = 1; index < layout.length; index += 1) {
    const previous = layout[index - 1].card
    const current = layout[index].card
    expect(current.left >= previous.right || current.left === previous.left).toBe(true)
  }
}

async function assertPackCardsDoNotOverlap(page: Page) {
  const descriptionsFit = await page.locator('.pack-card__description').evaluateAll((elements) =>
    elements.every((element) => element.scrollHeight <= element.clientHeight),
  )
  expect(descriptionsFit).toBe(true)
  const cards = await page.locator('.pack-card').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect()
    return { bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top }
  }))
  for (let left = 0; left < cards.length; left += 1) {
    for (let right = left + 1; right < cards.length; right += 1) {
      const a = cards[left]
      const b = cards[right]
      expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true)
    }
  }
}

async function openPlayers(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Начать' }).click()
  await page.getByRole('button', { name: 'Далее' }).click()
  await expect(page.getByRole('heading', { name: 'Игроки' })).toBeVisible()
}

async function completePlayers(page: Page, boundary = 'full') {
  const names = page.getByRole('textbox', { name: 'Имя игрока' })
  const boundaries = page.getByRole('combobox', { name: 'Грань игрока' })
  for (let index = 0; index < await names.count(); index += 1) {
    await names.nth(index).fill(`Игрок ${index + 1}`)
    await boundaries.nth(index).selectOption(boundary)
  }
  await page.getByRole('button', { name: 'Далее' }).click()
}

async function openPacks(page: Page) {
  await openPlayers(page)
  await completePlayers(page)
  await expect(page.getByRole('heading', { name: 'Паки вопросов' })).toBeVisible()
}

async function startGame(page: Page, pack = 'Обычный') {
  await openPacks(page)
  await page.getByRole('checkbox', { name: pack }).check({ force: true })
  await page.getByRole('button', { name: 'Далее' }).click()
  await expect(page.getByRole('heading', { name: 'Игрок 1' })).toBeVisible()
}

async function startManualGame(page: Page, pack = 'Обычный') {
  await openPlayers(page)
  await completePlayers(page)
  await page.getByRole('button', { name: 'Назад' }).click()
  await page.getByRole('switch').click()
  await page.getByRole('button', { name: 'Далее' }).click()
  await page.getByRole('checkbox', { name: pack }).check({ force: true })
  await page.getByRole('button', { name: 'Далее' }).click()
  await expect(page.getByRole('heading', { name: 'Игрок 1' })).toBeVisible()
}

async function reloadAndContinue(page: Page) {
  await page.reload()
  await page.getByRole('dialog', { name: 'Вижу незаконченную игру' }).getByRole('button', { name: 'Продолжить' }).click()
}

async function persistedGame(page: Page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem('truth-or-dare:unfinished-game')
    if (!raw) throw new Error('Persisted game is missing')
    return JSON.parse(raw).game as {
      cooldown: unknown[]
      currentTurn: { resolvedText: string } | null
      eliminatedPlayers: Array<{ id: string }>
      mode: 'automatic' | 'manual'
      players: Array<{ answeredTruths: number; completedDares: number; refusedDares: number }>
      queue: string[]
      selectedType: 'truth' | 'dare' | null
      usedCardIds: string[]
    }
  })
}

async function finishGame(page: Page) {
  await page.getByRole('button', { name: 'Выход' }).click()
  await page.getByRole('dialog', { name: 'Конец?' }).getByRole('button', { name: 'Да' }).click()
  await page.getByRole('dialog', { name: 'Точно конец?' }).getByRole('button', { name: 'Да' }).click()
}

async function chooseFirstSelectOption(page: Page) {
  await page.keyboard.press('Enter')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
}
