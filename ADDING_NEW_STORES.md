# Добавление новых магазинов

## Текущая архитектура

Код изолирован по доменам - каждый магазин имеет свои настройки в `DOMAIN_SELECTORS`, а специальная логика обернута в условия `if (domain === '...')`.

## Как добавить новый магазин

### 1. Добавить селекторы в `DOMAIN_SELECTORS`

В файле `src/lib/extractors.js` найдите `const DOMAIN_SELECTORS` и добавьте новый домен:

```javascript
const DOMAIN_SELECTORS = {
    'zara.com': { ... },
    'shop.mango.com': { ... },
    'newstore.com': {  // <-- НОВЫЙ МАГАЗИН
        title: ['h1.product-title', '.product-name h1', 'h1'],
        description: ['.product-description', '.description'],
        price: ['.product-price', '.price'],
        currency: ['.product-price', '[data-currency]'],
        sku: ['[data-product-id]', '[data-sku]'],
        images: ['.product-images img', '.product-gallery img']
    }
};
```

### 2. Универсальная логика работает автоматически

Для новых магазинов автоматически работает:
- ✅ JSON-LD extraction
- ✅ Embedded JSON extraction
- ✅ Fallback селекторы (если не указаны в DOMAIN_SELECTORS)
- ✅ Универсальная фильтрация изображений (SVG, icons, placeholders)

### 3. Специальная логика - только если нужно

Если новый магазин требует специальной логики (как Zara или Mango), оберните её в условие:

```javascript
// Пример: специальная обработка для нового магазина
if (domain === 'newstore.com') {
    // Ваша специальная логика
}
```

## Изолированные настройки для Zara и Mango

### Zara (`zara.com`):
- ✅ Фильтр паттерна изображений: `/\d+[-](p|a|e|b|...)\d*/`
- ✅ Проверка расширений файлов: `.jpg/.jpeg/.png/.webp`
- ✅ Lazy loading только для Zara CDN (`static.zara.net`)
- ✅ Дополнительное ожидание: 1 секунда
- ✅ Cookies для локализации

### Mango (`shop.mango.com`, `mango.com`):
- ✅ Фильтр миниатюр: `colv3`, `imwidth=40`, `< 200px`
- ✅ Проверка расширений: `.jpg/.jpeg/.png/.webp/.gif`
- ✅ Всегда JSON extraction (даже если есть изображения)
- ✅ Рекурсивный поиск в `__NEXT_DATA__` для description и price
- ✅ Meta tags fallback для description и price
- ✅ Дополнительное ожидание: 1.5 секунды
- ✅ Сохранение всех параметров URL (требуются для доступа)

## Важно при добавлении нового магазина

### ✅ ДЕЛАТЬ:
1. Добавлять селекторы в `DOMAIN_SELECTORS`
2. Тестировать на реальных URL
3. Использовать универсальную логику сначала
4. Добавлять специальную логику только если нужно

### ❌ НЕ ДЕЛАТЬ:
1. ❌ Не изменять универсальную логику без проверки
2. ❌ Не применять фильтры Zara/Mango к другим доменам
3. ❌ Не удалять проверки `if (domain === '...')` без понимания последствий
4. ❌ Не изменять `extractFromSelectors` для всех доменов - только для конкретного

## Примеры безопасных изменений

### ✅ Безопасно - добавить новый домен:
```javascript
const DOMAIN_SELECTORS = {
    // ... существующие ...
    'newstore.com': {
        title: ['h1'],
        description: ['.description'],
        price: ['.price'],
        images: ['img.product-image']
    }
};
```

### ✅ Безопасно - добавить специальную логику для нового домена:
```javascript
if (domain === 'newstore.com' && !result.price) {
    // Специальная логика только для newstore.com
    const price = await page.$eval('.special-price', el => el.textContent);
    result.price = extractPrice(price);
}
```

### ❌ Опасно - применить фильтр Zara ко всем:
```javascript
// ❌ НЕПРАВИЛЬНО - применится ко всем доменам
if (!/\d+[-](p|a|e|b|...)\d*/.test(lowerUrl)) {
    return false;
}

// ✅ ПРАВИЛЬНО - только для Zara
if (domain === 'zara.com') {
    if (!/\d+[-](p|a|e|b|...)\d*/.test(lowerUrl)) {
        return false;
    }
}
```

## Проверка изоляции

Перед коммитом проверьте:
1. ✅ Все специальные проверки обернуты в `if (domain === '...')`
2. ✅ Универсальная логика работает для всех доменов
3. ✅ Новый магазин не ломает существующие (Zara, Mango)
4. ✅ Тесты проходят для всех доменов

## Структура кода

```
extractProductData()
├── extractJsonLd()          # Универсально для всех
├── extractEmbeddedJson()    # Универсально для всех
│   └── extractFromEmbeddedJson()
│       ├── product.price    # Универсально
│       ├── product.pricing   # Универсально
│       └── product.variants # Универсально
├── extractFromSelectors()   # Использует DOMAIN_SELECTORS
│   ├── Универсальные фильтры (SVG, icons)
│   ├── if (domain === 'zara.com') { ... }  # Только для Zara
│   ├── if (domain === 'mango.com') { ... } # Только для Mango
│   └── JSON extraction (для всех, но приоритет для Mango)
└── Meta tags fallback (только для Mango)
```

## Контакты

Если возникли вопросы при добавлении нового магазина, проверьте:
1. Примеры для Zara и Mango в коде
2. Универсальную логику в `extractFromEmbeddedJson`
3. Fallback селекторы в `extractFromSelectors`

