import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App as AntApp, ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import dayjs from 'dayjs';
import 'dayjs/locale/en';
import { theme } from './theme';
import { SessionProvider } from './session';
import App from './App';
import './styles.css';

dayjs.locale('en');

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider locale={enUS} theme={theme}>
      <AntApp>
        <BrowserRouter>
          <SessionProvider>
            <App />
          </SessionProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  </React.StrictMode>,
);
