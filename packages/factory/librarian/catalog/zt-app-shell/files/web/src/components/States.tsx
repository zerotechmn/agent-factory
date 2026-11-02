import { Alert, Breadcrumb, Button, Flex, Result, Typography } from "antd";
import { useEffect, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { APP_NAME, COPY } from "../app.config";

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`;
  }, [title]);
}

type Crumb = { title: string; to?: string };

/** ZT §2 page header: Breadcrumb → one Title level 3 (with an optional status Tag) → actions on the right. */
export function PageHeader({ crumbs, extra, tag, title }: { crumbs?: Crumb[]; extra?: ReactNode; tag?: ReactNode; title: string }) {
  usePageTitle(title);
  return (
    <div className="zt-page-header">
      {crumbs && crumbs.length > 0 && <Breadcrumb items={crumbs.map((c) => ({ title: c.to ? <Link to={c.to}>{c.title}</Link> : c.title }))} />}
      <Flex align="center" gap="middle" justify="space-between" wrap>
        <Flex align="center" className="zt-minw0" gap="small" wrap>
          <Typography.Title className="zt-title" level={3}>
            {title}
          </Typography.Title>
          {tag}
        </Flex>
        {extra && (
          <Flex gap="small" wrap>
            {extra}
          </Flex>
        )}
      </Flex>
    </div>
  );
}

/** ZT §9 no-permission state. */
export function NoPermission({ message = COPY.noPermission, onBack }: { message?: string; onBack?: () => void }) {
  usePageTitle(COPY.noPermissionTitle);
  return (
    <Result
      extra={
        onBack ? (
          <Button onClick={onBack} type="primary">
            {COPY.backHome}
          </Button>
        ) : (
          <Link to="/">
            <Button type="primary">{COPY.backHome}</Button>
          </Link>
        )
      }
      status="403"
      subTitle={message}
      title={COPY.noPermissionTitle}
    />
  );
}

/** ZT §9 not-found state, with a link back (to the list, for a missing record). */
export function NotFoundPage({ backLabel = COPY.backHome, backTo = "/", message = COPY.notFound }: { backLabel?: string; backTo?: string; message?: string }) {
  usePageTitle(COPY.notFoundTitle);
  return (
    <Result
      extra={
        <Link to={backTo}>
          <Button type="primary">{backLabel}</Button>
        </Link>
      }
      status="404"
      subTitle={message}
      title={COPY.notFoundTitle}
    />
  );
}

/** ZT §9 section load error with a retry. A whole page that failed uses Result status="error" instead. */
export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <Alert action={<Button onClick={onRetry}>{COPY.retry}</Button>} role="alert" showIcon title={message} type="error" />;
}
