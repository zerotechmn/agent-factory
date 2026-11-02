# zt-app-shell

The ZT Design System frontend base for React + antd 6: ConfigProvider with the theme and locale (§13), the app shell with a collapsible side menu, header, notifications and user menu (§2), the page header, and the no-permission, not-found and load-error states (§9). It has accessible contrast fixes and a mobile drawer built in.

Tags: zt, antd, react, react-router, layout, app shell, menu, theme, states

## Contract

- **Stack:** React 18, antd 6, `@ant-design/icons` 6, react-router-dom 6, dayjs. Files go under `web/src/` (Vite root `web`).
- **You write `web/src/App.tsx`**, exporting `App`, with the routes inside `AppLayout`:

  ```tsx
  import { FileTextOutlined } from "@ant-design/icons";
  import { Route, Routes, useNavigate } from "react-router-dom";

  import { AppLayout, type MenuEntry } from "./layout/AppLayout";
  import { NotFoundPage } from "./components/States";

  const MENU: MenuEntry[] = [
    { children: [{ key: "orders", label: "All orders", path: "/orders" }], icon: <FileTextOutlined />, key: "orders-group", label: "Orders" },
    { key: "approvals", label: "Approvals", path: "/approvals", roles: ["Manager"] },
  ];

  export function App() {
    const navigate = useNavigate();
    const user = { name: "Bat-Erdene", role: "Manager" }; // from your session
    return (
      <Routes>
        <Route element={<AppLayout menu={MENU} onSignOut={() => navigate("/")} user={user} />}>
          <Route element={<OrdersPage />} path="/orders" />
          <Route element={<NotFoundPage />} path="*" />
        </Route>
      </Routes>
    );
  }
  ```
- **`AppLayout` props:**
  - `menu`: two levels at most, icons on level 1 only, `roles` hides entries a role can never use (ZT §5)
  - `user`: `{ name, role? }`
  - `onSignOut`
  - optional `notifications`: `{ count, onOpen }`
  - optional `canView(pathname)`: return false and the shell shows the 403 state
- **Pages** start with `<PageHeader title crumbs extra tag />`. A form or detail body goes in a `<div className="zt-narrow">` (960 px, ZT §2).

## Adapt it

1. `app.config.ts`: set `APP_NAME` to the PRD's product name, and write `COPY` in the UI language. The Mongolian ZT §9 strings are in the comments.
2. `theme.ts`: set `COLOR_PRIMARY` from the UI design. It must keep white text at 4.5:1 or primary buttons fail the accessibility check; the default `#0958d9` passes and antd's `#1677ff` does not. Swap the antd locale, the dayjs locale import and `dayjs.locale(...)` together for the UI language. Rename the `statusColor` keys to the PRD's statuses.
3. `main.tsx`: wrap `<App />` in your session or data providers.

Keep the contrast overrides in `theme.ts` and the `zt-minw0` / `min-width: 0` rules in `styles.css`. Earlier apps failed the browser check's text-overflow and accessibility checks without them.

## Origin

Generalised from run `wdy8xjndga` (deployed, all checks green). Product names, routes, menu and data were removed; behaviour and accessibility fixes were kept.
