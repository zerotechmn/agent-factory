import { BellOutlined, LogoutOutlined, MenuFoldOutlined, MenuOutlined, MenuUnfoldOutlined, UserOutlined } from "@ant-design/icons";
import { Badge, Button, Drawer, Dropdown, Flex, Grid, Layout, Menu, Tooltip, Typography, type MenuProps } from "antd";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router-dom";

import { APP_NAME, COPY } from "../app.config";
import { NoPermission } from "../components/States";

const { Content, Header, Sider } = Layout;

/** One menu entry. Level 1 may have an icon and children; ZT §2 allows two levels, icons on level 1 only. */
export type MenuEntry = {
  children?: MenuEntry[];
  icon?: ReactNode;
  key: string;
  label: string;
  path?: string;
  /** Roles that see this entry; omit for everyone. ZT §5: hide what a role can never use. */
  roles?: string[];
};

/**
 * ZT §2 app shell: light Sider (220, collapsible to 64, breakpoint lg) with
 * the menu, a 64 px Header (collapse toggle left; notifications and the
 * user menu right) and Content (padding 24). Below md the Sider becomes a
 * Drawer opened from the Header. Pages render through <Outlet />.
 */
export function AppLayout({
  canView = () => true,
  menu,
  notifications,
  onSignOut,
  user,
}: {
  /** False for a route this user may not open; the shell then shows the 403 state (ZT §9). */
  canView?: (pathname: string) => boolean;
  menu: MenuEntry[];
  notifications?: { count: number; onOpen: () => void };
  onSignOut: () => void;
  user: { name: string; role?: string };
}) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => setDrawerOpen(false), [pathname]);

  const visible = useMemo(() => visibleEntries(menu, user.role), [menu, user.role]);
  const selected = selectedKey(visible, pathname);
  const nav = (
    <Menu
      aria-label={COPY.mainNavigation}
      defaultOpenKeys={visible.filter((e) => e.children?.length).map((e) => e.key)}
      items={toMenuItems(visible)}
      mode="inline"
      selectedKeys={selected ? [selected] : []}
    />
  );

  return (
    <Layout className="zt-shell">
      <a className="zt-skip" href="#main">
        {COPY.skipToContent}
      </a>
      {!isMobile && (
        <Sider
          breakpoint="lg"
          className="zt-sider"
          collapsed={collapsed}
          collapsedWidth={64}
          collapsible
          onBreakpoint={(broken) => setCollapsed(broken)}
          theme="light"
          trigger={null}
          width={220}
        >
          <Link aria-label={COPY.home} className="zt-logo" to="/">
            <Typography.Text className="zt-logo-text" strong>
              {collapsed ? APP_NAME.slice(0, 1) : APP_NAME}
            </Typography.Text>
          </Link>
          {nav}
        </Sider>
      )}
      <Layout className="zt-minw0">
        <Header className="zt-header">
          <Flex align="center" className="zt-minw0" gap="small">
            {isMobile ? (
              <>
                <Tooltip title={COPY.openMenu}>
                  <Button aria-label={COPY.openMenu} className="zt-touch" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} type="text" />
                </Tooltip>
                <Link aria-label={COPY.home} className="zt-logo-inline" to="/">
                  <Typography.Text strong>{APP_NAME}</Typography.Text>
                </Link>
              </>
            ) : (
              <Tooltip title={collapsed ? COPY.expandMenu : COPY.collapseMenu}>
                <Button
                  aria-label={collapsed ? COPY.expandMenu : COPY.collapseMenu}
                  icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => setCollapsed(!collapsed)}
                  type="text"
                />
              </Tooltip>
            )}
          </Flex>
          <Flex align="center" className="zt-minw0" gap="small">
            {notifications && (
              <Tooltip title={COPY.notifications(notifications.count)}>
                <Badge count={notifications.count} overflowCount={99} size="small">
                  <Button
                    aria-label={COPY.notifications(notifications.count)}
                    className="zt-touch"
                    icon={<BellOutlined />}
                    onClick={notifications.onOpen}
                    type="text"
                  />
                </Badge>
              </Tooltip>
            )}
            <Dropdown
              menu={{ items: [{ icon: <LogoutOutlined />, key: "signout", label: COPY.signOut }], onClick: onSignOut }}
              trigger={["click"]}
            >
              <Button aria-label={COPY.account(user.name)} className="zt-user-btn" type="text">
                <UserOutlined aria-hidden="true" />
                <Typography.Text className="zt-user-name" ellipsis>
                  {user.name}
                </Typography.Text>
              </Button>
            </Dropdown>
          </Flex>
        </Header>
        <Content className="zt-content" id="main" tabIndex={-1}>
          {canView(pathname) ? <Outlet /> : <NoPermission onBack={() => navigate("/")} />}
        </Content>
      </Layout>
      {isMobile && (
        <Drawer className="zt-drawer" onClose={() => setDrawerOpen(false)} open={drawerOpen} placement="left" size="default" title={APP_NAME}>
          {nav}
        </Drawer>
      )}
    </Layout>
  );
}

function visibleEntries(entries: MenuEntry[], role: string | undefined): MenuEntry[] {
  return entries
    .filter((e) => !e.roles || (role !== undefined && e.roles.includes(role)))
    .map((e) => (e.children ? { ...e, children: visibleEntries(e.children, role) } : e))
    .filter((e) => !e.children || e.children.length > 0);
}

function toMenuItems(entries: MenuEntry[], level = 1): NonNullable<MenuProps["items"]> {
  return entries.map((e) => ({
    children: e.children ? toMenuItems(e.children, level + 1) : undefined,
    icon: level === 1 ? e.icon : undefined,
    key: e.path ?? e.key,
    label: e.path ? <Link to={e.path}>{e.label}</Link> : e.label,
  }));
}

/** The entry whose path is the longest prefix of the current path, so /orders/12 keeps "Orders" selected. */
function selectedKey(entries: MenuEntry[], pathname: string): string | null {
  const paths = entries.flatMap((e) => [e.path, ...(e.children ?? []).map((c) => c.path)]).filter((p): p is string => Boolean(p));
  const matches = paths.filter((p) => pathname === p || pathname.startsWith(p === "/" ? "/" : `${p}/`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}
