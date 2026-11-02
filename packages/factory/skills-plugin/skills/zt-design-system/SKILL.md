---
name: zt-design-system
description: Use when designing, building or reviewing the UI of a run that uses the ZT Design System - React + Ant Design 6 tokens, app shell, screen templates, field and action mappings, states, copy and formats, accessibility, theme code and the screens.json contract
---

## Factory overrides (read first)

This is the ZT Design System v2.0 as written by Zerotech, unchanged below this section. The software factory runs it unattended, so these overrides take precedence over the matching rules below:

1. **No Figma.** Skip step 9 and §15, and leave out the `figma` field of `screens.json`. The factory has no Figma access; the built app and the browser checks replace the design gate's Figma review.
2. **UI language follows the user's prompt and the PRD** (overrides §0 note and §11 "Mongolian by default"). In Mongolian, use §11 exactly. In another language, use the equivalent wording for the same patterns (verb buttons, sentence case, no "OK", errors that say how to fix) and the matching Ant Design locale. Formats stay as §11 (money `1,234,567` with the currency symbol after, `YYYY-MM-DD`, `HH:mm`) unless the PRD says otherwise.
3. **Mobile only when the PRD asks** (§1.6 as written): design and build tablet and phone behaviour only when a PRD non-functional requirement mentions mobile, phone, tablet or responsive use. The factory's browser check then tests phone width too; otherwise it tests desktop only.
4. **`operationId`** comes from the architecture's API endpoints (there is no separate `openapi.yaml`).
5. **No questions.** "Mark `NEW-COMPONENT?` for the Design lead" and "raise a `change_request`" mean: record it in your structured output and carry on with the closest component. Nobody answers during the run.

---

# ZT Design System v2.0 (Ant Design 6)

The only UI file for Zerotech projects and the UI/UX agent: token values, how to assemble screens, and the handoff contract.
v2.0 merges `zt-design-system.md` v1.0, `zt-web-build-guideline.md` v1.0 and `design-tokens.json` into this file; each rule now appears once.

- Base: **Ant Design 6** default theme (`antd@6`); token values are the same as v5. A project pinned to v5 uses the v5 prop names shown in brackets.
- Code: React `antd`, Vue `ant-design-vue`, Angular `ng-zorro-antd` (MIT).
- Figma: Ant Design Open Source Library — https://www.figma.com/community/file/831698976089873405 . Duplicate it once into the Zerotech team, theme it with §1, publish it as the team library.
- When sources disagree: PRD → policies (`POL-UX-xx`) → this file → Ant Design defaults.
- This file is in English so agents follow it precisely. Everything the end user reads is Mongolian (§11).

## 0. Agent rules and procedure

Hard rules:

1. Read only this file. Do not browse other design systems.
2. Use only tokens from §1 and components from §3–§7. Anything missing: use the closest component and mark it `NEW-COMPONENT?` for the Design lead.
3. Never add a field, action or screen the PRD does not contain. A gap becomes a `change_request`, not a design.
4. Never write business logic on a screen. Reference the PRD's IDs instead (`visible: BRL-06`). Screens reference Feature, BRL and operation IDs.

Run these steps in order for each module:

| # | Step | Input | Output |
|---|---|---|---|
| 1 | Information architecture | PRD screen index, roles | Menu tree + routes (§2, §10) |
| 2 | Pick a template per screen | Screen detail, features | `template` (§3) |
| 3 | Map fields to components | Screen fields, entities | Component + props (§4) |
| 4 | Map actions to buttons | Screen actions, permissions | Button type + placement (§5) |
| 5 | Compose the layout | Template anatomy | Component tree (§3) |
| 6 | Add every state | PRD states + §9 | One frame per state |
| 7 | Write the copy | PRD + §11 | Mongolian labels, buttons, messages |
| 8 | Emit `screens.json` | Steps 1–7 | Design gate contract (§14) |
| 9 | Build in Figma | `screens.json` | Frames per §15 |
| 10 | Self-check | §16 | `self_check` list; fix or raise a change request |

---

## 1. Tokens

Names are Ant Design token names, so they go straight into `ConfigProvider` (§13). To brand a project, change `colorPrimary` only (and `colorInfo` if wanted); Ant Design derives hover, active, background and border shades.

### 1.1 Color

| Token | Value | Use |
|---|---|---|
| `colorPrimary` | `#1677ff` | Primary buttons, links, active states. **The only per-project change** |
| `colorPrimaryHover` / `Active` | `#4096ff` / `#0958d9` | Hover / pressed |
| `colorPrimaryBg` | `#e6f4ff` | Selected row, active menu |
| `colorPrimaryBorder` | `#91caff` | Focus ring, selected borders |
| `colorSuccess` · `Bg` · `Border` | `#52c41a` · `#f6ffed` · `#b7eb8f` | Success, approved |
| `colorWarning` · `Bg` · `Border` | `#faad14` · `#fffbe6` · `#ffe58f` | Pending, needs attention |
| `colorError` · `Bg` · `Border` | `#ff4d4f` · `#fff2f0` · `#ffccc7` | Errors, destructive actions |
| `colorInfo` | `#1677ff` | Info |
| `colorText` | `rgba(0,0,0,0.88)` | Body text, headings |
| `colorTextSecondary` | `rgba(0,0,0,0.65)` | Labels, help text users need |
| `colorTextTertiary` | `rgba(0,0,0,0.45)` | Placeholders, non-essential captions only |
| `colorTextQuaternary` | `rgba(0,0,0,0.25)` | Disabled text |
| `colorBorder` / `Secondary` | `#d9d9d9` / `#f0f0f0` | Inputs, cards / table rows, dividers |
| `colorBgLayout` | `#f5f5f5` | Page background |
| `colorBgContainer` / `Elevated` | `#ffffff` | Cards, tables, forms / modals, dropdowns |
| `colorFillAlter` | `rgba(0,0,0,0.02)` | Table header, zebra rows |

### 1.2 Status → `Tag`

Same mapping on every screen of a project. The tag always shows the state text; color is never the only signal.

| Key | Business state (mn) | Tag color |
|---|---|---|
| `draft` | Ноорог | `default` |
| `pending` | Хүлээгдэж буй | `warning` |
| `inReview` | Хянагдаж буй | `processing` |
| `approved` | Батлагдсан / Идэвхтэй | `success` |
| `rejected` | Татгалзсан / Алдаатай | `error` |
| `cancelled` | Цуцлагдсан / Хаагдсан | `default` |

### 1.3 Chart palette

Ant Design palettes, steps 1–10. Charts only (`@ant-design/charts`); the UI uses §1.1.

| Palette | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| blue | `#e6f4ff` | `#bae0ff` | `#91caff` | `#69b1ff` | `#4096ff` | `#1677ff` | `#0958d9` | `#003eb3` | `#002c8c` | `#001d66` |
| green | `#f6ffed` | `#d9f7be` | `#b7eb8f` | `#95de64` | `#73d13d` | `#52c41a` | `#389e0d` | `#237804` | `#135200` | `#092b00` |
| gold | `#fffbe6` | `#fff1b8` | `#ffe58f` | `#ffd666` | `#ffc53d` | `#faad14` | `#d48806` | `#ad6800` | `#874d00` | `#613400` |
| red | `#fff1f0` | `#ffccc7` | `#ffa39e` | `#ff7875` | `#ff4d4f` | `#f5222d` | `#cf1322` | `#a8071a` | `#820014` | `#5c0011` |

### 1.4 Typography

Font: Ant Design system stack `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, 'Noto Sans', sans-serif`; code `SFMono-Regular, Consolas, 'Liberation Mono', Menlo, monospace`. Figma uses **Roboto**. A custom web font must include the `cyrillic-ext` subset, or Ө and Ү fall back to another font.

| Token | Size / line height | Weight | Use |
|---|---|---|---|
| `fontSizeHeading1` | 38 / 46 | 600 | Rare: empty-state hero |
| `fontSizeHeading2` | 30 / 38 | 600 | Dashboard title |
| `fontSizeHeading3` | 24 / 32 | 600 | Page title (one per page) |
| `fontSizeHeading4` | 20 / 28 | 600 | Section, modal title |
| `fontSizeHeading5` | 16 / 24 | 600 | Card title, group label |
| `fontSizeLG` | 16 / 24 | 400 | Emphasized body, large inputs |
| `fontSize` | 14 / 22 | 400 | **Default** body, table, form |
| `fontSizeSM` | 12 / 20 | 400 | Captions, help text, table meta |

Numbers in tables and statistics use `font-variant-numeric: tabular-nums`.

### 1.5 Space, size, shape, motion

| Group | Values |
|---|---|
| Spacing (4-px base) | `XXS` 4 icon↔text · `XS` 8 related controls · `SM` 12 compact cards · `base` 16 default gap, card spacing · `MD` 20 · `LG` 24 page padding, card padding, form items · `XL` 32 major sections · `XXL` 48 empty-state top |
| `controlHeightSM` / `controlHeight` / `controlHeightLG` | 24 / **32** / 40 px. 32 for admin apps; 40 for public forms, touch screens, `auth` |
| `borderRadiusSM` / `borderRadius` / `borderRadiusLG` | 4 / **6** / 8 px (cards use 8) |
| `lineWidth` | 1 px |
| `boxShadowTertiary` (cards on layout) | `0 1px 2px 0 rgba(0,0,0,0.03), 0 1px 6px -1px rgba(0,0,0,0.02), 0 2px 4px 0 rgba(0,0,0,0.02)` |
| `boxShadow` (dropdowns, modals) | `0 6px 16px 0 rgba(0,0,0,0.08), 0 3px 6px -4px rgba(0,0,0,0.12), 0 9px 28px 8px rgba(0,0,0,0.05)` |
| Motion | fast 0.1 s · mid 0.2 s · slow 0.3 s · easing `cubic-bezier(0.645, 0.045, 0.355, 1)`; respect reduced motion |

### 1.6 Breakpoints and responsive behavior

Breakpoints: `sm` 576 · `md` 768 · `lg` 992 · `xl` 1200 · `xxl` 1600. Figma frames: desktop **1440 × 1024**, tablet 768 × 1024, mobile 375 × 812.
Desktop-first. Design tablet and mobile frames only when a PRD NFR asks for them; then:

| Element | < lg (992) | < md (768) |
|---|---|---|
| Sider | collapsed to 64 | `Drawer` menu from the header |
| Form | 1 column | 1 column, footer buttons full width |
| Descriptions | 2 columns | 1 column |
| Table | horizontal scroll | horizontal scroll; card list only if the PRD asks |
| Filter bar | 2 fields + "Дэлгэрэнгүй" | 1 field + "Дэлгэрэнгүй" |

---

## 2. App shell

```
Layout
├── Layout.Sider        width 220 · collapsible · collapsedWidth 64 · breakpoint "lg" · theme "light"
│   ├── Logo            height 64
│   └── Menu            mode "inline" · max 2 levels · icons on level 1 only
└── Layout
    ├── Layout.Header   height 64 · white · bottom border colorBorderSecondary
    │                   left: collapse toggle · right: notifications Badge, user Dropdown
    └── Layout.Content  padding 24 · background colorBgLayout
        ├── Page header Breadcrumb → Typography.Title level 3 → actions (right)
        └── Page body   Cards (colorBgContainer, radius 8, padding 24), 16 px apart
```

- Grid: `Row` / `Col`, 24 columns, `gutter={[16, 16]}` (24 on dashboards).
- Forms and detail bodies stop at **960 px** wide; lists and dashboards use the full width.
- One `Typography.Title level={3}` per page. Card titles use the Card `title` prop.

---

## 3. Templates

Every screen uses exactly one template, named in `screens.json` (`"template": "list"`). Pick the first row that matches.

| PRD signal | Template | Container |
|---|---|---|
| Sign-in, OTP, password reset | `auth` | Full page |
| Record with an approval chain, or a BRL about who approves | `approval` | Full page |
| Many records of one entity, with search or filters | `list` | Full page |
| One record, read with actions | `detail` | Full page |
| Create or edit, more than 8 fields | `form` | Full page |
| Create or edit, 5–8 fields, started from a list or detail | `form` | `Drawer` |
| Create or edit, up to 4 fields, or a confirm with a reason | `form` | `Modal` |
| KPIs, charts, summaries over a period | `dashboard` | Full page |

### 3.1 `list`

```
Page header      Breadcrumb · Title "Захиалгууд" · [Экспортлох] [Шинээр нэмэх (primary)]
Card (filters)   Form layout="inline" · up to 4 fields · [Хайх (primary)] [Цэвэрлэх]
                 more than 4 → "Дэлгэрэнгүй шүүлтүүр" toggles a second row
Card (results)   bulk bar (only when rows are selected): "3 сонгосон" · bulk actions
                 Table with built-in Pagination
```

Table props: `rowKey="id"`, `size="middle"`, `sticky`, `scroll={{ x: 'max-content' }}`, `pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (t) => `Нийт ${t}` }}`. Default sort: newest first. Column rules in §7.

### 3.2 `detail`

```
Page header      Breadcrumb · Title "Захиалга #10245" + status Tag · [secondary] [primary]
Card             Descriptions bordered · column {{ xs: 1, md: 2 }} · items from PRD fields
Tabs             one tab per related list (each a Table) · "Түүх" tab = Timeline when the PRD has audit
```

### 3.3 `form` (page)

```
Page header      Breadcrumb · Title "Захиалга нэмэх" / "Захиалга засах"
Card per section Form layout="vertical" · requiredMark · scrollToFirstError
                 Row gutter 16 → Col span 24, or lg 12 for short fields
Footer           [Хадгалах (primary)] [Цуцлах] — left-aligned under the form
```

- More than 12 fields → titled Cards; more than 3 Cards → `Steps`, one step per Card.
- After saving: `message.success("Амжилттай хадгаллаа.")`, then open the record's detail page.
- Leaving with unsaved changes → `Modal.confirm` "Хадгалаагүй өөрчлөлт байна. Гарах уу?".

### 3.4 `form` in Drawer or Modal

- Drawer: `size="large"` [v5: `width={736}`], title = the action ("Захиалга засах"), footer right: [Цуцлах] [Хадгалах (primary)].
- Modal: `width={520}`, `destroyOnHidden` [v5: `destroyOnClose`], `mask={{ closable: false }}` when the form has data [v5: `maskClosable={false}`]. Footer: [Цуцлах] [action (primary)] on the right.

### 3.5 `dashboard`

```
Page header      Title · RangePicker (right) controls the whole page
Row              3–4 Card + Statistic · Col xs 24, sm 12, xl 6
Row              charts in Cards · Col xs 24, xl 12
Card             recent activity Table (10 rows, no pagination, link "Бүгдийг харах")
```

Charts use `@ant-design/charts` and §1.3. A chart without a PRD-defined metric is not drawn.

### 3.6 `approval`

Detail template plus:

```
Card             Steps (current = the record's approval stage) · or Timeline for history
Sticky footer    [Татгалзах (danger)] [Батлах (primary)] — right-aligned, visible only to the approver role
                 Татгалзах opens a Modal with a required reason (TextArea, 10–500 chars)
```

### 3.7 `auth`

Centered `Card` 400 px wide on `colorBgLayout`, logo above, controls `size="large"`, one full-width primary button.

---

## 4. Field → component

Pick the row by the PRD field's type and format.

| PRD field | Component | Props |
|---|---|---|
| Short text (≤ 100 chars) | `Input` | `maxLength` from PRD; `showCount` when a limit exists |
| Long text | `Input.TextArea` | `autoSize={{ minRows: 3, maxRows: 8 }}`, `showCount` |
| Integer | `InputNumber` | `precision={0}`, `min` from PRD, `style={{ width: '100%' }}` |
| Money (₮) | `InputNumber` | `precision={0}`, `suffix="₮"`, `money` formatter + parser (§13); right-aligned in tables |
| Percentage | `InputNumber` | `min={0}`, `max={100}`, `suffix="%"` |
| Date | `DatePicker` | `format="YYYY-MM-DD"` |
| Date and time | `DatePicker` | `showTime={{ format: 'HH:mm' }}`, `format="YYYY-MM-DD HH:mm"` |
| Date range | `DatePicker.RangePicker` | `format="YYYY-MM-DD"` |
| One of ≤ 5 options | `Radio.Group` | `options`; `Segmented` in filter bars |
| One of > 5 options | `Select` | `showSearch`, `optionFilterProp="label"` when > 10 |
| Many of ≤ 6 options | `Checkbox.Group` | `options` |
| Many of > 6 options | `Select` | `mode="multiple"`, `maxTagCount="responsive"` |
| Reference to another entity | `Select` | remote search: `showSearch`, `filterOption={false}`, `onSearch`, `notFoundContent` |
| Region (аймаг → сум/дүүрэг) | `Cascader` | `showSearch` |
| Yes/no setting that applies at once | `Switch` | label states the "on" meaning |
| Yes/no inside a form | `Checkbox` | |
| Phone | `Input` | `inputMode="numeric"`, `maxLength={8}`, rule `/^\d{8}$/` |
| Email | `Input` | rule `{ type: 'email' }` |
| Document upload | `Upload.Dragger` | `accept`, `maxCount`, max size and types in help text |
| Image upload | `Upload` | `listType="picture-card"`, `accept="image/*"` |
| Status (display) | `Tag` | color from §1.2 |
| Read-only value in a form | `Form.Item` + `Typography.Text` | never a disabled input for data the user can't change |

Rich text, maps, signatures and calendars are not covered → `NEW-COMPONENT?`.

## 5. Action → button

| Action kind | Component | Where |
|---|---|---|
| Main action (create, save, approve) | `Button type="primary"` | Page header right, or form footer. **One per view** |
| Secondary page action (export, print) | `Button` | Left of the primary |
| Row action | `Button type="link"` | Last table column; max 2 visible, the rest in a `Dropdown` "…" |
| Delete one record | `Button danger` + `Popconfirm` | Row action or detail header |
| Bulk delete or anything irreversible | `Modal.confirm` with `okButtonProps={{ danger: true }}` | Bulk bar or header |
| Icon-only action | `Button icon` + `Tooltip` + `aria-label` | Toolbars only |
| Navigate | `Typography.Link` | Inline |

- **Hide vs disable**: hide what the role may never do (PRD permissions); disable what the record's state blocks for now, with a `Tooltip` naming the reason ("Зөвхөн Хүлээгдэж буй төлөвт батална").
- A submitting button shows `loading`; other actions on the view are disabled meanwhile.
- In a row of buttons the primary is last (rightmost), except form-page footers (§3.3).

## 6. Other components

| Need | Component |
|---|---|
| Read-only record | `Descriptions` (bordered) |
| Multi-step process | `Steps` |
| History, audit trail | `Timeline` |
| Group of sections | `Tabs` or `Card` |
| Count, unread | `Badge` |
| KPI number | `Statistic` inside `Card` |
| Navigation | `Layout`, `Menu`, `Breadcrumb` |
| Feedback after an action | `message` (short) / `notification` (long or background job) |
| Page-level message | `Alert` |
| Empty, error, 403, 404 | `Empty`, `Result` |
| Loading | `Skeleton` (page), `Spin` (section), `Button loading` |

## 7. Tables

- Column order: identifier (links to detail) → status `Tag` → key attributes → dates → money → actions (`fixed: 'right'`).
- **At most 8 columns**; the rest belongs on the detail page.
- Money and numbers `align: 'right'`, tabular numbers. Dates `YYYY-MM-DD`.
- Long text: `ellipsis: { showTitle: false }` + `Tooltip` with the full text.
- Sorting on dates, money and names. Column filters only for status with ≤ 5 values; everything else goes in the filter bar.
- `rowSelection` only when the PRD has a bulk action.
- Row click opens the detail page only when the row has no other links; otherwise the identifier cell is the link.

## 8. Forms

- Labels above fields (`layout="vertical"`), no colon. Required fields use Ant's mark; optional fields are not marked.
- Field order follows the PRD's field table.
- Validation on blur (`validateTrigger="onBlur"`) and on submit; messages in Mongolian (§11).
- Validation that depends on other data (a BRL) is shown inline after the server answers; the rule text comes from the PRD.
- Help text (`extra`) only for formats or limits the user cannot guess ("PDF, 10 MB хүртэл").
- Default values only when the PRD gives them.

## 9. States and feedback

Every screen defines the states that apply. `loading`, `error` and `no-permission` are always required.

| State | Pattern | Copy (mn) |
|---|---|---|
| First load | `Skeleton active` shaped like the template | — |
| Refresh / section load | `Spin` over the section, content stays visible | — |
| Saving | Button `loading`, fields stay editable until the response | — |
| Empty (no data yet) | `Empty` + primary action | "Одоогоор захиалга алга." + [Шинээр нэмэх] |
| Empty (no search result) | `Empty` + [Шүүлтүүр цэвэрлэх] | "Хайлтад тохирох үр дүн олдсонгүй" |
| Load error | `Result status="error"` (page) or `Alert type="error"` (section) + [Дахин оролдох] | "Мэдээлэл ачаалж чадсангүй. Дахин оролдоно уу." |
| No permission | `Result status="403"` | "Танд энэ хуудсыг үзэх эрх байхгүй байна." |
| Not found | `Result status="404"` + link back to the list | "Хайсан бичлэг олдсонгүй." |
| Success, short | `message.success`, 3 s | "Амжилттай хадгаллаа." |
| Long or background job | `notification`, stays until closed | — |
| Field error | Inline under the field (`Form.Item` rules) | "Утасны дугаар 8 оронтой байна." |
| Page-level warning | `Alert` at the top of the page body | — |

Use the `<App>` wrapper and `App.useApp()` for `message`, `notification` and `modal` so they pick up theme and locale.

## 10. Navigation and routes

- Menu: max 2 levels. Level 1 = module, level 2 = screen. Labels ≤ 20 characters, plural nouns ("Захиалгууд").
- Breadcrumb mirrors the menu path plus the record ("Захиалгууд / #10245").
- Routes: `/orders`, `/orders/new`, `/orders/:id`, `/orders/:id/edit`. Filters and page number live in the query string so a list can be shared.
- Browser tab title = page title + product name.

## 11. Copy and formats (Mongolian)

| Use | Text |
|---|---|
| Create · Save · Cancel · Edit · Delete | Шинээр нэмэх · Хадгалах · Цуцлах · Засах · Устгах |
| Approve / Reject | Батлах / Татгалзах |
| Search / Reset filters · Export | Хайх / Цэвэрлэх · Экспортлох |
| Delete confirm | "{нэр}-г устгах уу? Энэ үйлдлийг буцаах боломжгүй." |
| Required field | "{талбар} оруулна уу." |
| Wrong format | "{талбар} буруу байна. Жишээ: {жишээ}" |

- Mongolian by default, Ant Design locale `mn_MN`; English only if the PRD says so.
- Buttons are verbs; never "OK" or "Тийм". Sentence case for titles and labels.
- Errors say what went wrong and how to fix it; no apologies, no error codes in the main text.
- Money `1,234,567₮` (`,` thousands, symbol after, no space; decimals only if a BRL needs them). Date `YYYY-MM-DD`, time `HH:mm`, time zone Asia/Ulaanbaatar unless the PRD says otherwise. Phone 8 digits, shown `9911 2233`.

## 12. Accessibility

- Text contrast ≥ 4.5:1; large text and icons ≥ 3:1. On white: `colorText` 16.5:1 and `colorTextSecondary` 7.0:1 pass; `colorTextTertiary` 3.4:1 and the default primary `#1677ff` 4.1:1 fail for small text. If the client requires WCAG AA, set the primary to `#0958d9` (6.2:1); check any brand color the same way.
- Success, warning and error colors (1.9–3.3:1) are for icons, borders and tag backgrounds, never small text on white.
- Every icon-only button has a tooltip and an accessible name.
- All actions reachable by Tab; visible focus ring (`colorPrimaryBorder`).
- Click targets ≥ 32 × 32 px on desktop, ≥ 44 × 44 px on mobile.

---

## 13. Theme and code handoff

Frontend code uses this setup so it never re-picks values:

```tsx
import { App, ConfigProvider } from 'antd';
import mnMN from 'antd/locale/mn_MN';
import dayjs from 'dayjs';
import 'dayjs/locale/mn';

dayjs.locale('mn');

export const theme = {
  token: {
    colorPrimary: '#1677ff', // the only per-project change (§1.1)
    borderRadius: 6,
    fontSize: 14,
  },
};

export const money = {
  formatter: (v?: number | string) => `${v ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, ','),
  parser: (v?: string) => Number((v ?? '').replace(/,/g, '')),
};

export const statusColor = {
  draft: 'default', pending: 'warning', inReview: 'processing',
  approved: 'success', rejected: 'error', cancelled: 'default',
} as const;

export function Root({ children }: { children: React.ReactNode }) {
  return (
    <ConfigProvider locale={mnMN} theme={theme}>
      <App>{children}</App>
    </ConfigProvider>
  );
}
```

- No inline colors or pixel values in components; use `theme.useToken()` when a custom style is unavoidable.
- v6 prop names: `Space orientation`, `Steps` / `Timeline` / `Tabs` / `Descriptions` with `items`, `Modal destroyOnHidden`, `variant` instead of `bordered`.

## 14. `screens.json` (Design gate contract)

One entry per PRD screen. IDs match the PRD and `openapi.yaml`; the gate checks them by code.

```json
{
  "id": "S-05",
  "name": "Захиалгын дэлгэрэнгүй",
  "template": "detail",
  "route": "/orders/:id",
  "frs": ["F-03", "F-04"],
  "roles": ["Менежер", "Захирал", "Нягтлан"],
  "fields": [
    {"label": "Нийт дүн", "binding": "order.total", "component": "Descriptions.Item", "format": "money", "rules": ["BRL-05"]},
    {"label": "Төлөв", "binding": "order.status", "component": "Tag", "format": "status"}
  ],
  "actions": [
    {"label": "Батлах", "feature": "F-03", "operationId": "approveOrder", "kind": "primary",
     "visible": ["BRL-06"], "roles": ["Менежер", "Захирал"], "rules": ["BRL-02"]},
    {"label": "Цуцлах", "feature": "F-04", "operationId": "cancelOrder", "kind": "danger-confirm",
     "visible": ["BRL-06"], "opens": "M-cancel-reason"}
  ],
  "states": ["loading", "error", "not-found", "no-permission"],
  "navigation": {"from": ["S-04"], "to": ["S-04"]},
  "references": ["REF-02"],
  "figma": {"frame": "S-05 · Захиалгын дэлгэрэнгүй"},
  "self_check": []
}
```

## 15. Figma rules (checked by the Design gate)

| Item | Rule | Example |
|---|---|---|
| Library | Instances from the published ZT team library only; no detached instances, no local styles | |
| Colors / text | Library variables and text styles only; no raw hex | |
| Page | One Figma page per module | `Orders` |
| Frame | `1440 × 1024`, auto layout, 24 px page padding; name `S-xx · Screen name` | `S-05 · Захиалгын дэлгэрэнгүй` |
| State frame | `S-xx · Screen name · state` | `S-05 · Захиалгын дэлгэрэнгүй · error` |
| Field layer | `entity.field` | `order.total` |
| Action layer | API `operationId` | `approveOrder` |
| Frame description | Starts with the template, then the BRL IDs used | `template: detail · BRL-05, BRL-06` |
| Prototype links | Follow `navigation` in `screens.json` | S-04 → S-05 |
| Sample data | Realistic Mongolian names, ₮ amounts, dates; never lorem ipsum | |

## 16. Self-check before handoff

| Check | Policy |
|---|---|
| Every PRD screen has a frame and a `screens.json` entry with the same S-ID | POL-UX-05 |
| Every screen uses one template from §3 | POL-UX-04 |
| Every field has `binding`; every action has `operationId` | POL-UX-06 |
| `loading`, `error`, `no-permission` exist on every screen | POL-UX-07 |
| One primary button per view; destructive actions confirmed | POL-UX-08 |
| Copy and formats follow §11; status tags follow §1.2 | POL-UX-09 |
| Contrast, focus and icon labels follow §12 | POL-UX-10 |
| Figma follows §15 | POL-UX-11 |
| Only §1 tokens and §3–§7 components, or marked `NEW-COMPONENT?` | POL-UX-01..03 |
| Nothing added that the PRD lacks; gaps raised as change requests | POL-UX-13, POL-ARC-08 |

## 17. Do and don't

| Do | Don't |
|---|---|
| Reference `BRL-06` for when a button shows | Write "Хүлээгдэж буй үед харагдана" on the screen |
| Put filters in the filter bar | Add column filters to every column |
| Use a `Drawer` for a 6-field edit from a list | Open a full page for a 6-field edit |
| Show status as a `Tag` with text | Signal status with color alone |
| Keep one primary button | Make Save and Submit both primary |
| Hide actions the role can never use | Show disabled buttons the user can never enable |
