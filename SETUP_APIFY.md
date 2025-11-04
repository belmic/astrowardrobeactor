# Как создать Actor в Apify Console

## Вариант 1: Через веб-интерфейс (импорт Git)

1. Откройте [Apify Console](https://console.apify.com/actors/new)

2. Нажмите **"Import Git repository"**

3. Выберите **"Other Git provider or external repository"**

4. Введите URL репозитория: `https://github.com/belmic/astrowardrobe_actor.git`

5. **ВАЖНО:** После подключения репозитория появится форма, где нужно указать:
   - **Actor name** - введите: `fashionpdp` (без кавычек, только строчные буквы)
   - Если поле не видно, попробуйте закрыть ошибку и найти поле "Name" или "Actor name"

6. Нажмите **"Create"** или **"Import"**

## Вариант 2: Через Apify CLI (рекомендуется)

1. Установите Apify CLI:
```bash
npm install -g apify-cli
```

2. Войдите в Apify:
```bash
cd apify-actor
apify login
```

3. Создайте Actor:
```bash
apify create fashionpdp
```

4. Или просто push (если Actor уже существует):
```bash
apify push
```

## Если имя не принимается

Попробуйте еще более простое имя:
- `fashion1`
- `pdp1`
- `fashionscraper`

## Важно

- Имя Actor должно содержать ТОЛЬКО строчные буквы (a-z) и цифры (0-9)
- Дефис (-) можно использовать только в середине строки
- НЕ может начинаться или заканчиваться дефисом
- НЕ может содержать заглавные буквы, подчеркивания, пробелы

