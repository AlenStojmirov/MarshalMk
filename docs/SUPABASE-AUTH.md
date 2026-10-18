# Најава на купувачи · поставки во Supabase (Task 13.6)

Ова се прави еднаш, рачно, во Supabase Dashboard. Без тоа линковите од е-поштата водат на погрешно место
или пораките се на англиски.

## 1. Испраќач (направено 2026-10-18)

Authentication → **SMTP Settings**: Brevo. Вградената пошта на Supabase е само за тестирање.

## 2. Адреси

Authentication → **URL Configuration**:

| Поле | Вредност |
|---|---|
| Site URL | `https://marshal.mk` |
| Redirect URLs | `https://marshal.mk/smetka**` |
| | `http://localhost:3000/smetka**` (за тест на компјутер) |

Потврдата на е-пошта враќа на `/smetka?potvrdeno=1`, новата лозинка на `/smetka/nova-lozinka`. Адреса
што не е на листата Supabase ја заменува со Site URL.

## 3. Пораки

Authentication → **Email Templates**. `{{ .ConfirmationURL }}` го пополнува Supabase.

### Confirm signup

**Subject:** `Потврди го профилот на Маршал`

```html
<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1c1917;">
  <h2 style="margin-bottom: 8px;">Добредојде во Маршал</h2>
  <p>Кликни на копчето за да ја потврдиш е-поштата. Потоа се најавуваш и собираш поени со секоја нарачка.</p>
  <p style="margin: 28px 0;">
    <a href="{{ .ConfirmationURL }}"
       style="background: #1c1917; color: #ffffff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: bold;">
      Потврди ја е-поштата
    </a>
  </p>
  <p style="font-size: 13px; color: #57534e;">Ако не си отворил профил на marshal.mk, игнорирај ја оваа порака.</p>
</div>
```

### Reset password

**Subject:** `Нова лозинка за Маршал`

```html
<div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #1c1917;">
  <h2 style="margin-bottom: 8px;">Нова лозинка</h2>
  <p>Некој побара нова лозинка за твојот профил на marshal.mk. Кликни на копчето и постави ја.</p>
  <p style="margin: 28px 0;">
    <a href="{{ .ConfirmationURL }}"
       style="background: #1c1917; color: #ffffff; padding: 12px 22px; border-radius: 8px; text-decoration: none; font-weight: bold;">
      Постави нова лозинка
    </a>
  </p>
  <p style="font-size: 13px; color: #57534e;">Ако не си барал нова лозинка, игнорирај ја оваа порака. Старата лозинка останува.</p>
</div>
```

## 4. Останато

- Authentication → Providers → Email: **Confirm email вклучено** (`mailer_autoconfirm: false`, проверено 2026-10-18).
- Регистрацијата останува отворена. Сметка направена надвор од формата на сајтот нема улога и нема
  пристап до ништо, а на `/smetka` се бара да го доврши профилот (D-033).
