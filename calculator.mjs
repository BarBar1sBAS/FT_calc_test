export const TARIFFS = {
  sites: {
    landing: { label: 'Лендинг', description: 'Одна страница для продукта или услуги', price: 45_000, days: 8, defaultPages: 1, fixedPages: 1 },
    corporate: { label: 'Корпоративный сайт', description: 'Компания, услуги и информация о бизнесе', price: 90_000, days: 15, defaultPages: 5 },
    shop: { label: 'Интернет-магазин', description: 'Витрина товаров для продаж в интернете', price: 160_000, days: 25, defaultPages: 10 },
  },
  page: { price: 5_000, days: 1, max: 100 },
  features: {
    form: { label: 'Форма заявки', description: 'Сбор контактов и запросов с сайта', price: 5_000, days: 1 },
    catalog: { label: 'Каталог', description: 'Карточки, категории и фильтры', price: 25_000, days: 4 },
    payment: { label: 'Онлайн-оплата', description: 'Подключение платёжного сервиса', price: 20_000, days: 3 },
    crm: { label: 'Интеграция с CRM', description: 'Передача заявок в систему продаж', price: 15_000, days: 2 },
    languages: { label: 'Мультиязычность', description: 'Две языковые версии сайта', price: 20_000, days: 3 },
  },
  urgency: { surcharge: 0.3, timeFactor: 0.75 },
};

function validatePages(site, pages) {
  if (!Number.isInteger(pages) || pages < 1 || pages > TARIFFS.page.max) {
    throw new RangeError(`Количество страниц: целое число от 1 до ${TARIFFS.page.max}.`);
  }
  if (site.fixedPages && pages !== site.fixedPages) throw new RangeError('Лендинг содержит одну страницу.');
}

function validateFeatures(features) {
  if (!Array.isArray(features) || features.some(key => !Object.hasOwn(TARIFFS.features, key)) || new Set(features).size !== features.length) {
    throw new TypeError('Выберите известные функции без повторений.');
  }
}

export function calculateEstimate({ siteType, pages, features, urgent }) {
  if (!Object.hasOwn(TARIFFS.sites, siteType)) throw new TypeError('Неизвестный тип сайта.');
  const site = TARIFFS.sites[siteType];
  validatePages(site, pages);
  validateFeatures(features);
  if (typeof urgent !== 'boolean') throw new TypeError('Укажите срочность проекта.');

  const breakdown = [{ label: `${site.label}: первая страница`, price: site.price, days: site.days }];
  if (pages > 1) {
    breakdown.push({ label: `Дополнительные страницы (${pages - 1})`, price: (pages - 1) * TARIFFS.page.price, days: (pages - 1) * TARIFFS.page.days });
  }
  for (const key of features) {
    const { label, price, days } = TARIFFS.features[key];
    breakdown.push({ label, price, days });
  }

  let price = breakdown.reduce((sum, item) => sum + item.price, 0);
  let days = breakdown.reduce((sum, item) => sum + item.days, 0);
  if (urgent) {
    const extra = Math.round(price * TARIFFS.urgency.surcharge);
    breakdown.push({ label: `Срочность +${TARIFFS.urgency.surcharge * 100}%`, price: extra, days: 0 });
    price += extra;
    days = Math.ceil(days * TARIFFS.urgency.timeFactor);
  }
  return { price, days, breakdown };
}
