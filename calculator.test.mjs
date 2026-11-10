import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateEstimate } from './calculator.mjs';

const initial = { siteType: 'landing', pages: 1, features: [], urgent: false };

test('лендинг без функций: 45 000 ₽ и 8 рабочих дней', () => {
  const result = calculateEstimate(initial);
  assert.equal(result.price, 45_000);
  assert.equal(result.days, 8);
  assert.equal(result.breakdown.length, 1);
});

test('корпоративный сайт, 5 страниц и форма: 115 000 ₽ и 20 дней', () => {
  const result = calculateEstimate({ ...initial, siteType: 'corporate', pages: 5, features: ['form'] });
  assert.equal(result.price, 115_000);
  assert.equal(result.days, 20);
  assert.equal(result.breakdown.reduce((sum, item) => sum + item.price, 0), result.price);
});

test('срочность: 149 500 ₽ и 15 дней', () => {
  const result = calculateEstimate({ ...initial, siteType: 'corporate', pages: 5, features: ['form'], urgent: true });
  assert.equal(result.price, 149_500);
  assert.equal(result.days, 15);
  assert.equal(result.breakdown.at(-1).price, 34_500);
  assert.equal(result.breakdown.reduce((sum, item) => sum + item.price, 0), result.price);
});

test('все функции и максимум страниц: 962 000 ₽, срок округляется вверх до 103 дней', () => {
  const result = calculateEstimate({ ...initial, siteType: 'shop', pages: 100, features: ['form', 'catalog', 'payment', 'crm', 'languages'], urgent: true });
  assert.equal(result.price, 962_000);
  assert.equal(result.days, 103);
  assert.equal(result.breakdown.reduce((sum, item) => sum + item.price, 0), result.price);
});

test('функции независимы, исходные параметры не меняются', () => {
  const input = { ...initial, features: ['payment'] };
  const result = calculateEstimate(input);
  assert.equal(result.price, 65_000);
  assert.equal(result.days, 11);
  assert.equal(result.breakdown.length, 2);
  assert.deepEqual(input.features, ['payment']);
  assert.deepEqual(calculateEstimate(input), result);
});

test('первая страница входит в базовую цену каждого типа', () => {
  assert.equal(calculateEstimate({ ...initial, siteType: 'corporate' }).price, 90_000);
  assert.equal(calculateEstimate({ ...initial, siteType: 'shop' }).price, 160_000);
  const twoPages = calculateEstimate({ ...initial, siteType: 'corporate', pages: 2 });
  assert.equal(twoPages.price, 95_000);
  assert.equal(twoPages.days, 16);
});

test('невалидные значения страниц отвергаются без молчаливого округления', () => {
  for (const pages of ['', '5', 0, -1, 1.5, 101, NaN, Infinity, null, undefined]) {
    assert.throws(() => calculateEstimate({ ...initial, siteType: 'corporate', pages }), /страниц/);
  }
  assert.throws(() => calculateEstimate({ ...initial, pages: 2 }), /Лендинг/);
});

test('неизвестные и повторяющиеся параметры не создают неверную смету', () => {
  assert.throws(() => calculateEstimate({ ...initial, siteType: 'unknown' }), /тип/);
  assert.throws(() => calculateEstimate({ ...initial, features: ['unknown'] }), /функц/);
  assert.throws(() => calculateEstimate({ ...initial, features: ['form', 'form'] }), /функц/);
  assert.throws(() => calculateEstimate({ ...initial, features: null }), /функц/);
  assert.throws(() => calculateEstimate({ ...initial, urgent: 'yes' }), /срочност/);
});
