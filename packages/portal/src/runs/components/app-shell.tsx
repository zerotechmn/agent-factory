import { useState, type ReactNode } from "react";
import { useLocation } from "wouter";

import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

import { HomeSidebar } from "./home-sidebar";

/**
 * Every page sits beside the sidebar. `children` receives a key that changes on each "New run"
 * click, so the new-run page remounts with an empty composer even when it is already open.
 */
export function AppShell({ children }: { children: (newRunKey: number) => ReactNode }) {
  const [newRunKey, setNewRunKey] = useState(0);
  const [, navigate] = useLocation();

  const newRun = () => {
    setNewRunKey((key) => key + 1);
    navigate("/");
  };

  return (
    <TooltipProvider>
      <SidebarProvider>
        <HomeSidebar onNewRun={newRun} />
        <SidebarInset>
          <MobileSidebarTrigger />
          {children(newRunKey)}
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  );
}

/** On mobile the sidebar is an off-canvas sheet, so its own trigger is out of view; offer one in the page. */
function MobileSidebarTrigger() {
  const { isMobile } = useSidebar();
  if (!isMobile) return null;
  return <SidebarTrigger className="absolute top-3 left-3" />;
}
