import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Route, Switch } from "wouter";

import "./index.css";
import { LibrarianPage } from "./librarian/components/librarian-page";
import { RunLibrarianPage } from "./librarian/components/run-librarian-page";
import { AppShell } from "./runs/components/app-shell";
import { NewRunPage } from "./runs/components/new-run-page";
import { RunBoardPage } from "./runs/components/run-board-page";
import { RunDetailsPage } from "./runs/components/run-details-page";
import { RunStatusPage } from "./runs/components/run-status-page";

if (import.meta.env.DEV) {
  import("react-grab");
}

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppShell>
        {(newRunKey) => (
          <Switch>
            <Route path="/">
              <NewRunPage key={newRunKey} />
            </Route>
            <Route path="/runs/:id">{(params) => <RunStatusPage id={params.id} />}</Route>
            <Route path="/runs/:id/board">{(params) => <RunBoardPage id={params.id} />}</Route>
            <Route path="/runs/:id/details">{(params) => <RunDetailsPage id={params.id} />}</Route>
            <Route path="/runs/:id/librarian">{(params) => <RunLibrarianPage id={params.id} />}</Route>
            <Route path="/librarian" component={LibrarianPage} />
          </Switch>
        )}
      </AppShell>
    </QueryClientProvider>
  </StrictMode>,
);
