// Reuse with an existing Playwright Page; no browser library is shipped with the app.
export async function runBrowserChecks(page, url = 'http://127.0.0.1:8000/') {
  function ensure(condition, message) {
    if (!condition) throw new Error(message);
  }
  const bypassCache = route => route.continue();
  await page.route('**/*', bypassCache);
  await page.goto(url);
  await page.locator('#total-price').waitFor({ state: 'visible' });
  const results = [];
  async function check(name, run) {
    try {
      await run();
      results.push({ name, passed: true });
    } catch (error) {
      results.push({ name, passed: false, error: error.message });
    }
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await check('Мобильный итог закреплён в начале, середине и внизу страницы', async () => {
    ensure(await page.locator('#mobile-summary').count() === 1, 'Нет мобильной полоски');
    ensure(await page.locator('#mobile-summary').isVisible(), 'Полоска скрыта');
    for (const fraction of [0, 0.5, 1]) {
      await page.evaluate(value => window.scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * value), fraction);
      const box = await page.locator('#mobile-summary').boundingBox();
      ensure(Math.abs(box.y + box.height - 812) < 2, 'Полоска ушла за пределы окна');
    }
    const footer = await page.locator('.footer-bottom').boundingBox();
    const bar = await page.locator('#mobile-summary').boundingBox();
    ensure(footer.y + footer.height <= bar.y + 1, 'Полоска перекрывает футер');
  });

  await check('Кнопки страниц, границы, ошибки и синхронный итог', async () => {
    const minus = page.getByRole('button', { name: 'Уменьшить количество страниц' });
    const plus = page.getByRole('button', { name: 'Увеличить количество страниц' });
    ensure(await minus.count() === 1, 'Нет кнопки уменьшения');
    ensure(await plus.count() === 1, 'Нет кнопки увеличения');
    ensure(await minus.isDisabled() && await plus.isDisabled(), 'Кнопки лендинга активны');
    await page.locator('[name=siteType][value=corporate]').check();
    await plus.click();
    ensure(await page.locator('#pages').inputValue() === '6', 'Плюс не увеличил страницы');
    ensure((await page.locator('#total-price').innerText()).replace(/\s/g, '') === '115000₽', 'Не пересчитана цена');
    ensure((await page.locator('#mobile-price').innerText()).includes(await page.locator('#total-price').innerText()), 'Итоги расходятся');
    await minus.click();
    ensure(await page.locator('#pages').inputValue() === '5', 'Минус не уменьшил страницы');
    await page.locator('#pages').fill('1');
    ensure(await minus.isDisabled(), 'Минус доступен при одной странице');
    await page.locator('#pages').fill('100');
    ensure(await plus.isDisabled(), 'Плюс доступен при 100 страницах');
    for (const value of ['', '0', '-1', '1.5', '101']) {
      await page.locator('#pages').fill(value);
      ensure(await page.locator('#mobile-summary-error').innerText() === 'Уточните число страниц', 'Нет ошибки в полоске');
      ensure(await page.locator('#mobile-summary-values').isHidden(), 'Видна устаревшая сумма');
      await plus.click();
      ensure(await page.locator('#pages').inputValue() === '1', 'Плюс не исправил ошибочный ввод');
      ensure(await page.locator('#mobile-summary-error').isHidden(), 'Ошибка не исчезла');
    }
    await page.locator('#pages').fill('');
    await minus.click();
    ensure(await page.locator('#pages').inputValue() === '1', 'Минус не исправил пустое поле');
    for (let i = 0; i < 5; i++) await plus.click();
    ensure(await page.locator('#pages').inputValue() === '6', 'Потеряны быстрые нажатия');
    await page.locator('[name=features][value=form]').check();
    await page.locator('#urgent').check();
    ensure((await page.locator('#mobile-price').innerText()).replace(/\s/g, '') === '≈156000₽', 'Цена срочного проекта неверна');
    ensure(await page.locator('#mobile-days').innerText() === '16 раб. дн.', 'Срок срочного проекта неверен');
    await page.getByRole('button', { name: 'Сбросить' }).click();
    await page.waitForFunction(() => document.querySelector('#pages').disabled && document.querySelector('#total-days').textContent === '8');
    ensure(await minus.isDisabled() && await plus.isDisabled(), 'Сброс не отключил кнопки');
    ensure((await page.locator('#mobile-price').innerText()).replace(/\s/g, '') === '≈45000₽', 'Сброс не обновил полоску');
  });

  await check('Смета на ПК прилипает по центру, длинная смета доступна', async () => {
    for (const width of [900, 1280, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const layoutTop = await page.locator('.calculator-layout').evaluate(el => el.getBoundingClientRect().top + scrollY);
      await page.evaluate(top => window.scrollTo(0, top + 48), layoutTop);
      await page.waitForTimeout(50);
      const geometry = await page.locator('#estimate').evaluate(el => ({
        top: el.getBoundingClientRect().top,
        height: el.getBoundingClientRect().height,
        viewport: innerHeight,
        position: getComputedStyle(el).position,
      }));
      ensure(geometry.position === 'sticky', `Нет прилипания на ${width}px`);
      ensure(Math.abs(geometry.top + geometry.height / 2 - geometry.viewport / 2) < 2, `Карточка не по центру на ${width}px`);
      ensure(await page.locator('#mobile-summary').isHidden(), 'Мобильная полоска видна на ПК');
    }
    await page.setViewportSize({ width: 1280, height: 600 });
    await page.locator('[name=siteType][value=shop]').check();
    for (const item of await page.locator('[name=features]').all()) await item.check();
    await page.locator('#pages').fill('100');
    await page.locator('#urgent').check();
    const dimensions = await page.locator('#estimate').evaluate(el => ({ height: el.offsetHeight, scroll: el.scrollHeight, overflow: getComputedStyle(el).overflowY }));
    ensure(dimensions.height <= 552, 'Смета выше доступной области');
    ensure(dimensions.overflow === 'auto', 'Нет внутренней прокрутки');
    await page.locator('#estimate').evaluate(el => { el.scrollTop = el.scrollHeight; });
    ensure(await page.locator('#estimate').evaluate(el => el.scrollTop > 0), 'Нельзя прочитать конец сметы');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const bounds = await page.evaluate(() => ({ estimate: document.querySelector('#estimate').getBoundingClientRect().bottom, footer: document.querySelector('footer').getBoundingClientRect().top }));
    ensure(bounds.estimate <= bounds.footer, 'Смета перекрыла футер');
  });

  await check('Обе темы, текст от 14px и отсутствие переполнения', async () => {
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      for (const width of [320, 375, 640, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        const problems = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          barOverflow: document.querySelector('#mobile-summary').checkVisibility() && document.querySelector('#mobile-summary').scrollWidth > document.querySelector('#mobile-summary').clientWidth,
          smallText: [...document.querySelectorAll('body *')].filter(el => el.checkVisibility() && [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 14).map(el => el.textContent.trim().slice(0, 30)),
        }));
        ensure(!problems.overflow, `Переполнение: ${theme}, ${width}px`);
        ensure(!problems.barOverflow, `Переполнение полоски: ${theme}, ${width}px`);
        ensure(problems.smallText.length === 0, `Мелкий текст: ${theme}, ${width}px`);
      }
    }
  });

  await page.unroute('**/*', bypassCache);
  return results;
}
