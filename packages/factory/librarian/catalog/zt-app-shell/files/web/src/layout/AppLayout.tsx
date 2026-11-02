import { useEffect, useMemo, useState } from 'react';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Badge, Button, Drawer, Dropdown, Flex, Grid, Layout, Menu, Tooltip, Typography } from 'antd';
import {
  BellOutlined, CalendarOutlined, CarOutlined, DashboardOutlined, LogoutOutlined,
  MenuFoldOutlined, MenuOutlined, MenuUnfoldOutlined, UserOutlined,
} from '@ant-design/icons';
// @ts-ignore shared JS module
import { routeAccess } from '../../../shared/access.js';
import { useSession } from '../session';
import { api, Notification } from '../api';
import { userLabel } from '../format';
import { NoPermission } from '../components/States';

const { Header, Sider, Content } = Layout;

function menuItems(role: string) {
  const items: any[] = [
    { key: 'cars', icon: <CarOutlined aria-hidden="true" />, label: 'Cars', children: [{ key: '/cars', label: <Link to="/cars">Browse cars</Link> }] },
  ];
  if (role === 'Renter') {
    items.push({ key: 'bookings', icon: <CalendarOutlined aria-hidden="true" />, label: 'Bookings', children: [{ key: '/bookings', label: <Link to="/bookings">My bookings</Link> }] });
  }
  if (role === 'Owner') {
    items.push({
      key: 'owner', icon: <DashboardOutlined aria-hidden="true" />, label: 'Owner dashboard', children: [
        { key: '/listings', label: <Link to="/listings">My listings</Link> },
        { key: '/booking-requests', label: <Link to="/booking-requests">Booking requests</Link> },
        { key: '/earnings', label: <Link to="/earnings">Earnings</Link> },
      ],
    });
  }
  return items;
}

const selectedKey = (path: string) => ['/booking-requests', '/earnings', '/listings', '/bookings', '/cars'].find((k) => path === k || path.startsWith(`${k}/`)) || '';

export default function AppLayout() {
  const { user, signOut } = useSession();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => setDrawerOpen(false), [pathname]);
  useEffect(() => {
    api<Notification[]>('/api/notifications').then((n) => setUnread(n.length)).catch(() => setUnread(0));
  }, [pathname]);

  const items = useMemo(() => menuItems(user!.role), [user]);
  const key = selectedKey(pathname);
  const openKeys = ['cars', 'bookings', 'owner'];
  const menu = (
    <Menu mode="inline" items={items} selectedKeys={[key]} defaultOpenKeys={openKeys} aria-label="Main navigation" />
  );
  const notificationsPath = user!.role === 'Owner' ? '/booking-requests' : '/bookings';
  const denied = routeAccess(user, pathname);

  return (
    <Layout className="w2g-shell">
      <a href="#main" className="w2g-skip">Skip to main content</a>
      {!isMobile && (
        <Sider theme="light" width={220} collapsible collapsed={collapsed} collapsedWidth={64} breakpoint="lg"
          onBreakpoint={(broken) => setCollapsed(broken)} trigger={null} className="w2g-sider">
          <Link to="/" className="w2g-logo" aria-label="Wheels2Go home">
            <Typography.Text strong className="w2g-logo-text"><CarOutlined aria-hidden="true" />{!collapsed && ' Wheels2Go'}</Typography.Text>
          </Link>
          {menu}
        </Sider>
      )}
      <Layout className="w2g-minw0">
        <Header className="w2g-header">
          <Flex align="center" gap="small" className="w2g-minw0">
            {isMobile ? (
              <>
                <Tooltip title="Open menu">
                  <Button type="text" icon={<MenuOutlined />} aria-label="Open menu" onClick={() => setDrawerOpen(true)} className="w2g-touch" />
                </Tooltip>
                <Link to="/" className="w2g-logo-inline" aria-label="Wheels2Go home"><Typography.Text strong>Wheels2Go</Typography.Text></Link>
              </>
            ) : (
              <Tooltip title={collapsed ? 'Expand menu' : 'Collapse menu'}>
                <Button type="text" icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  aria-label={collapsed ? 'Expand menu' : 'Collapse menu'} onClick={() => setCollapsed(!collapsed)} />
              </Tooltip>
            )}
          </Flex>
          <Flex align="center" gap="small" className="w2g-minw0">
            <Tooltip title="Notifications">
              <Badge count={unread} size="small" overflowCount={99}>
                <Button type="text" icon={<BellOutlined />} aria-label={`Notifications (${unread})`}
                  onClick={() => navigate(notificationsPath)} className="w2g-touch" />
              </Badge>
            </Tooltip>
            <Dropdown trigger={['click']} menu={{
              items: [{ key: 'signout', icon: <LogoutOutlined />, label: 'Sign out' }],
              onClick: () => { signOut(); navigate('/'); },
            }}>
              <Button type="text" className="w2g-user-btn" data-testid="current-user" aria-label={`Account menu for ${userLabel(user!)}`}>
                <UserOutlined aria-hidden="true" />
                <Typography.Text ellipsis className="w2g-user-name">{userLabel(user!)}</Typography.Text>
              </Button>
            </Dropdown>
          </Flex>
        </Header>
        <Content id="main" className="w2g-content" tabIndex={-1}>
          {denied ? <NoPermission /> : <Outlet />}
        </Content>
      </Layout>
      {isMobile && (
        <Drawer placement="left" open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Wheels2Go" size="default" className="w2g-drawer">
          {menu}
        </Drawer>
      )}
    </Layout>
  );
}
