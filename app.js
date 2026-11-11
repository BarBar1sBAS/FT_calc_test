import { TARIFFS, calculateEstimate } from './calculator.mjs';

const form = document.querySelector('#calculator');
const pages = form.elements.pages;
const aside = document.querySelector('.estimate');
const content = document.querySelector('#estimate-content');
const error = document.querySelector('#pages-error');
const liveResult = document.querySelector('#live-result');
const minus = document.querySelector('#pages-minus');
const plus = document.querySelector('#pages-plus');
const mobileSummary = document.querySelector('#mobile-summary');
const mobileValues = document.querySelector('#mobile-summary-values');
const mobileError = document.querySelector('#mobile-summary-error');
const money = new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 });
const plurals = new Intl.PluralRules('ru');

function dayLabel(days) {
  return { one: 'рабочий день', few: 'рабочих дня', many: 'рабочих дней', other: 'рабочих дней' }[plurals.select(days)];
}

function renderOptions() {
  for (const element of document.querySelectorAll('[data-site-price]')) {
    element.textContent = `от ${money.format(TARIFFS.sites[element.dataset.sitePrice].price)}`;
  }
  for (const element of document.querySelectorAll('[data-feature-price]')) {
    element.textContent = `+${money.format(TARIFFS.features[element.dataset.featurePrice].price)}`;
  }

  pages.max = TARIFFS.page.max;
  document.querySelector('#urgency-rate').textContent = `+${TARIFFS.urgency.surcharge * 100}% к цене`;
  document.querySelector('#urgency-description').textContent = `Срок короче на ${Math.round((1 - TARIFFS.urgency.timeFactor) * 100)}%`;
}

function setPageDefaults() {
  const site = TARIFFS.sites[form.elements.siteType.value];
  pages.value = site.defaultPages;
  pages.disabled = Boolean(site.fixedPages);
  document.querySelector('#pages-help').textContent = site.fixedPages
    ? 'У лендинга одна страница. Она входит в базовую стоимость.'
    : `Первая страница включена. Каждая следующая: ${money.format(TARIFFS.page.price)} и ${TARIFFS.page.days} рабочий день. От 1 до ${TARIFFS.page.max} страниц.`;
}

function renderEstimate(result, urgent) {
  document.querySelector('#total-price').textContent = money.format(result.price);
  document.querySelector('#total-days').textContent = result.days;
  document.querySelector('#days-label').textContent = dayLabel(result.days);
  document.querySelector('#mobile-price').textContent = `≈ ${money.format(result.price)}`;
  document.querySelector('#mobile-days').textContent = `${result.days} раб. дн.`;
  document.querySelector('#breakdown').replaceChildren(...result.breakdown.map(item => {
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    const label = document.createElement('dt');
    const value = document.createElement('dd');
    label.textContent = item.label;
    value.textContent = money.format(item.price);
    row.append(label, value);
    return row;
  }));

  const baseDays = result.breakdown.reduce((sum, item) => sum + item.days, 0);
  document.querySelector('#time-explanation').textContent = urgent
    ? `Обычный срок: ${baseDays} ${dayLabel(baseDays)}. С ускорением: ${result.days}. Сокращаем срок на ${Math.round((1 - TARIFFS.urgency.timeFactor) * 100)}% и округляем вверх.`
    : result.breakdown.length === 1
      ? `Базовый срок: ${result.days} ${dayLabel(result.days)}.`
      : `Срок: ${result.breakdown.map(item => item.days).join(' + ')} = ${result.days} ${dayLabel(result.days)}. Дни по выбранным работам складываются.`;
  liveResult.textContent = `Примерная стоимость ${money.format(result.price)}. Срок ${result.days} ${dayLabel(result.days)}.`;
}

function updateEstimate() {
  try {
    const result = calculateEstimate({
      siteType: form.elements.siteType.value,
      pages: pages.valueAsNumber,
      features: [...form.querySelectorAll('[name="features"]:checked')].map(input => input.value),
      urgent: form.elements.urgent.checked,
    });
    renderEstimate(result, form.elements.urgent.checked);
    pages.removeAttribute('aria-invalid');
    error.hidden = true;
    content.hidden = false;
    document.querySelector('#estimate-error').hidden = true;
    mobileValues.hidden = false;
    mobileError.hidden = true;
  } catch (cause) {
    pages.setAttribute('aria-invalid', 'true');
    error.textContent = cause.message;
    error.hidden = false;
    content.hidden = true;
    document.querySelector('#estimate-error').hidden = false;
    mobileValues.hidden = true;
    mobileError.hidden = false;
    liveResult.textContent = `${cause.message} Расчёт временно скрыт.`;
  }
  document.querySelector('#skeleton').hidden = true;
  aside.setAttribute('aria-busy', 'false');
  aside.scrollTop = 0;
  mobileSummary.hidden = false;
  minus.disabled = pages.disabled || (pages.validity.valid && pages.valueAsNumber <= Number(pages.min));
  plus.disabled = pages.disabled || (pages.validity.valid && pages.valueAsNumber >= Number(pages.max));
}

function changePages(direction) {
  if (!pages.validity.valid) pages.value = pages.min;
  else if (direction < 0) pages.stepDown();
  else pages.stepUp();
  pages.dispatchEvent(new Event('input', { bubbles: true }));
}

function centerEstimate() {
  const offset = Math.max(24, (window.innerHeight - aside.offsetHeight) / 2);
  aside.style.setProperty('--estimate-top', `${Math.round(offset)}px`);
}

renderOptions();
setPageDefaults();
updateEstimate();
new ResizeObserver(centerEstimate).observe(aside);
window.addEventListener('resize', centerEstimate);
minus.addEventListener('click', () => changePages(-1));
plus.addEventListener('click', () => changePages(1));

form.addEventListener('input', event => {
  if (event.target.name === 'siteType') setPageDefaults();
  updateEstimate();
});
form.addEventListener('submit', event => event.preventDefault());
form.addEventListener('reset', () => {
  // Run after the browser's default reset action, not during its event dispatch.
  setTimeout(() => {
    setPageDefaults();
    updateEstimate();
  }, 0);
});
