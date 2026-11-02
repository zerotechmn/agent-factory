import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Alert, Breadcrumb, Button, Flex, Result, Typography } from 'antd';
// @ts-ignore shared JS module
import { NO_PERMISSION } from '../../../shared/access.js';

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · Wheels2Go`;
  }, [title]);
}

type Crumb = { title: string; to?: string };
export function PageHeader({ title, crumbs, extra, tag }: { title: string; crumbs?: Crumb[]; extra?: React.ReactNode; tag?: React.ReactNode }) {
  usePageTitle(title);
  return (
    <div className="w2g-page-header">
      {crumbs && crumbs.length > 0 && (
        <Breadcrumb items={crumbs.map((c) => ({ title: c.to ? <Link to={c.to}>{c.title}</Link> : c.title }))} />
      )}
      <Flex justify="space-between" align="center" wrap gap="middle">
        <Flex align="center" gap="small" wrap className="w2g-minw0">
          <Typography.Title level={3} className="w2g-title">{title}</Typography.Title>
          {tag}
        </Flex>
        {extra && <Flex gap="small" wrap>{extra}</Flex>}
      </Flex>
    </div>
  );
}

export function NoPermission({ message = NO_PERMISSION }: { message?: string }) {
  usePageTitle('No permission');
  return (
    <Result status="403" title="No permission" subTitle={<span data-testid="no-permission">{message}</span>}
      extra={<Link to="/"><Button type="primary">Go to my home page</Button></Link>} />
  );
}

export function NotFoundPage({ message = 'This page does not exist.', backTo = '/', backLabel = 'Go to my home page' }: { message?: string; backTo?: string; backLabel?: string }) {
  usePageTitle('Not found');
  return (
    <Result status="404" title="Not found" subTitle={<span data-testid="not-found">{message}</span>}
      extra={<Link to={backTo}><Button type="primary">{backLabel}</Button></Link>} />
  );
}

export function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <Alert type="error" showIcon role="alert" data-testid="load-error" title={message}
      action={<Button onClick={onRetry}>Try again</Button>} />
  );
}
