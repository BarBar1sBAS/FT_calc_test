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
  async function floatingVisible(visible) {
    await page.waitForFunction(expected => {
      const card = document.querySelector('#mobile-summary');
      const style = getComputedStyle(card);
      return style.opacity === (expected ? '1' : '0') && card.getAttribute('aria-hidden') === String(!expected);
    }, visible, { timeout: 3000 });
  }
  async function scrollToPrice(offset) {
    await page.locator('#estimate .price').evaluate((el, value) => window.scrollTo(0, scrollY + el.getBoundingClientRect().top + value), offset);
  }

  await check('Плавающая карточка соответствует смете и не закрывает футер', async () => {
    const shape = await page.locator('#mobile-summary').evaluate(el => ({ radius: getComputedStyle(el).borderRadius, border: getComputedStyle(el).borderBottomWidth }));
    ensure(shape.radius === '16px' && shape.border === '1px', 'Карточка квадратная или без полной рамки');
    await page.evaluate(() => window.scrollTo(0, 0));
    await floatingVisible(true);
    const box = await page.locator('#mobile-summary').boundingBox();
    ensure(box.x === 16 && box.width === 343 && Math.abs(box.y + box.height - 796) < 2, 'Неверные отступы карточки');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await floatingVisible(true);
    const footer = await page.locator('.footer-bottom').boundingBox();
    const bar = await page.locator('#mobile-summary').boundingBox();
    ensure(footer.y + footer.height <= bar.y + 1, 'Карточка перекрывает футер');
  });

  await check('Итоги плавно сменяют друг друга без дублирования и скачка страницы', async () => {
    await scrollToPrice(-100);
    await page.waitForTimeout(100);
    ensure(await page.locator('#mobile-summary').getAttribute('aria-hidden') === 'true', 'Основной итог виден, но закреплённый не скрывается');
    await floatingVisible(false);
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    ensure(await page.locator('#mobile-summary').evaluate(el => !el.hidden && el.inert), 'Скрытая карточка удалена из DOM или доступна для взаимодействия');
    const motion = await page.locator('#estimate .price').evaluate(el => ({ transform: getComputedStyle(el).transform, opacity: getComputedStyle(el).opacity }));
    ensure(motion.transform === 'none' && motion.opacity === '1', 'Основная цена анимируется');

    // 95% visibility keeps the hidden state; 85% brings the floating estimate back.
    const priceHeight = await page.locator('#estimate .price').evaluate(el => el.offsetHeight);
    await scrollToPrice(priceHeight * 0.05);
    await page.waitForTimeout(100);
    ensure(await page.locator('#mobile-summary').getAttribute('aria-hidden') === 'true', 'Нет защитного порога от мигания');
    await scrollToPrice(priceHeight * 0.15);
    await floatingVisible(true);
    ensure(await page.evaluate(() => document.documentElement.scrollHeight) === height, 'Изменилась длина страницы');

    for (const offset of [-100, 20, -100, 20, -100]) {
      await scrollToPrice(offset);
      await page.waitForTimeout(30);
    }
    await floatingVisible(false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await floatingVisible(true);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await scrollToPrice(-100);
    await floatingVisible(false);
    ensure(await page.locator('#mobile-summary').evaluate(el => getComputedStyle(el).transform === 'none'), 'Reduced motion сохраняет смещение');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });

  await check('Плюс у лендинга объясняет ограничение и убирает подсказку через 5 секунд', async () => {
    const plus = page.locator('#pages-plus');
    const notice = page.locator('#pages-notice');
    ensure(await plus.isEnabled(), 'Плюс лендинга не принимает нажатие');
    const original = await page.locator('#estimate-content').innerText();
    const mobileOriginal = await page.locator('#mobile-summary-values').textContent();
    await plus.click();
    ensure(await notice.isVisible(), 'Нет пояснения ограничения');
    ensure(await notice.innerText() === 'Лендинг состоит из одной страницы. Для нескольких страниц выберите корпоративный сайт или интернет-магазин', 'Неверный текст пояснения');
    ensure(await plus.getAttribute('aria-describedby') === 'pages-help pages-notice', 'Пояснение не связано с кнопкой');
    ensure(await page.locator('#live-result').innerText() === await notice.innerText(), 'Пояснение не озвучивается');
    ensure(await page.locator('[aria-live]').count() === 1, 'Появился второй aria-live');
    ensure(await page.locator('#pages').inputValue() === '1' && await page.locator('#pages').isDisabled(), 'Изменилось число страниц лендинга');
    ensure(await page.locator('#pages').getAttribute('aria-invalid') === null, 'Корректная страница отмечена ошибочной');
    ensure(await page.locator('#estimate-content').innerText() === original && await page.locator('#mobile-summary-values').textContent() === mobileOriginal, 'Предупреждение изменило смету');
    await page.waitForTimeout(3100);
    await plus.press('Enter');
    await page.waitForTimeout(2100);
    ensure(await notice.isVisible(), 'Повторное нажатие не продлило подсказку');
    await page.waitForTimeout(3100);
    ensure(await notice.isHidden(), 'Подсказка не исчезла через 5 секунд');
    ensure(await plus.getAttribute('aria-describedby') === 'pages-help', 'Скрытая подсказка осталась в описании');
    ensure(await page.locator('#live-result').textContent() === '', 'Скрытая подсказка осталась в aria-live');
    await plus.press('Space');
    ensure(await notice.isVisible(), 'Space не показывает подсказку');
    await page.locator('[name=siteType][value=corporate]').check();
    ensure(await notice.isHidden(), 'Смена типа оставила подсказку');
    await page.waitForTimeout(5100);
    ensure((await page.locator('#pages-help').innerText()).includes('Каждая следующая'), 'Старый таймер изменил подпись нового типа');
    await page.locator('[name=siteType][value=landing]').check();
    await plus.click();
    await page.getByRole('button', { name: 'Сбросить' }).click();
    await page.waitForFunction(() => document.querySelector('#pages-notice').hidden);
    ensure(await plus.isEnabled() && !await plus.evaluate(el => el.classList.contains('has-notice')), 'Сброс оставил выделение или отключил плюс');
  });

  await check('Кнопки страниц, границы, ошибки и синхронный итог', async () => {
    const minus = page.getByRole('button', { name: 'Уменьшить количество страниц' });
    const plus = page.getByRole('button', { name: 'Увеличить количество страниц' });
    ensure(await minus.count() === 1, 'Нет кнопки уменьшения');
    ensure(await plus.count() === 1, 'Нет кнопки увеличения');
    ensure(await minus.isDisabled() && await plus.isEnabled(), 'Неверные состояния кнопок лендинга');
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
    ensure(await minus.isDisabled() && await plus.isEnabled(), 'Сброс не восстановил кнопки лендинга');
    ensure((await page.locator('#mobile-price').innerText()).replace(/\s/g, '') === '≈45000₽', 'Сброс не обновил полоску');
  });

  await check('Ошибки, прямой якорь и клавиатурный переход учитывают основной итог', async () => {
    await page.locator('[name=siteType][value=corporate]').check();
    await page.locator('#pages').fill('');
    await page.locator('#estimate-error').evaluate(el => window.scrollTo(0, scrollY + el.getBoundingClientRect().top - 100));
    await floatingVisible(false);
    await page.evaluate(() => window.scrollTo(0, 0));
    await floatingVisible(true);
    await page.locator('#pages').fill('5');
    await page.goto(url + '#estimate');
    await page.waitForFunction(() => document.querySelector('#estimate').getAttribute('aria-busy') === 'false');
    await floatingVisible(false);
    const link = page.getByRole('link', { name: 'Ваша оценка', exact: true });
    await link.focus();
    await page.keyboard.press('Enter');
    await floatingVisible(false);
    const transition = await page.locator('#mobile-summary').evaluate(el => getComputedStyle(el).transitionDuration);
    ensure(transition.split(',').every(value => parseFloat(value) === 0), 'Клавиатурный переход анимируется');
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

  await check('Обе темы, компактный счётчик, текст от 14px и отсутствие переполнения', async () => {
    for (const theme of ['light', 'dark']) {
      await page.emulateMedia({ colorScheme: theme });
      for (const width of [320, 375, 640, 767, 768, 1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page.evaluate(() => window.scrollTo(0, 0));
        if (width < 768) await floatingVisible(true);
        const problems = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth > innerWidth,
          barOverflow: document.querySelector('#mobile-summary').checkVisibility() && document.querySelector('#mobile-summary').scrollWidth > document.querySelector('#mobile-summary').clientWidth,
          smallText: [...document.querySelectorAll('body *')].filter(el => el.checkVisibility() && [...el.childNodes].some(node => node.nodeType === 3 && node.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 14).map(el => el.textContent.trim().slice(0, 30)),
        }));
        ensure(!problems.overflow, `Переполнение: ${theme}, ${width}px`);
        ensure(!problems.barOverflow, `Переполнение полоски: ${theme}, ${width}px`);
        ensure(problems.smallText.length === 0, `Мелкий текст: ${theme}, ${width}px`);
        if (width < 768) {
          const control = await page.locator('.page-control').boundingBox();
          const group = await page.locator('.pages-group').boundingBox();
          ensure(control.width === 208 && control.x === group.x, `Счётчик растянут или смещён: ${theme}, ${width}px`);
          ensure(await page.locator('.unit-label').isHidden(), 'Лишняя подпись «стр.» на телефоне');
          for (const value of ['1', '10', '100']) {
            await page.locator('#pages').fill(value);
            const input = await page.locator('#pages').evaluate(el => ({ width: el.offsetWidth, aligned: getComputedStyle(el).textAlign, overflow: el.scrollWidth > el.clientWidth }));
            ensure(input.width === 96 && input.aligned === 'center' && !input.overflow, `Число ${value} не помещается по центру`);
          }
          await page.locator('#pages').focus();
          ensure(await page.locator('#pages').evaluate(el => el.matches(':focus-visible') && getComputedStyle(el).outlineWidth === '2px'), 'Потерян клавиатурный фокус поля');
        }
      }
    }
  });

  await page.unroute('**/*', bypassCache);
  return results;
}
