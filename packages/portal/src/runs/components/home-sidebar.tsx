import { IconBook, IconEdit, IconFlowerFilled, IconLayoutSidebar, IconPlus } from "@tabler/icons-react";
import { Link, useLocation } from "wouter";

import { Button } from "@/components/ui/button";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import { useRecentRuns } from "../recent-runs";

export function HomeSidebar({ onNewRun }: { onNewRun: () => void }) {
  const [location] = useLocation();
  const recentRuns = useRecentRuns();
  const { setOpenMobile } = useSidebar();

  const newRun = () => {
    onNewRun();
    setOpenMobile(false);
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="flex-row items-center justify-between">
        <Link
          href="/"
          aria-label="Software Factory home"
          className="flex size-8 items-center justify-center group-data-[collapsible=icon]:hidden"
        >
          <IconFlowerFilled className="size-5" />
        </Link>
        <SidebarTrigger className="group-data-[collapsible=icon]:hidden" />
        <LogoToggle />
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={location === "/"} onClick={newRun} tooltip="New run">
                  <IconEdit />
                  <span>New run</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton isActive={location === "/librarian"} render={<Link href="/librarian" />} tooltip="Librarian">
                  <IconBook />
                  <span>Librarian</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup className="group-data-[collapsible=icon]:hidden">
          <SidebarGroupLabel>{recentRuns.length > 0 ? "Recent runs" : "No runs yet"}</SidebarGroupLabel>
          <SidebarGroupAction aria-label="New run" onClick={newRun}>
            <IconPlus />
          </SidebarGroupAction>
          <SidebarGroupContent>
            <SidebarMenu>
              {recentRuns.map((run) => (
                <SidebarMenuItem key={run.id}>
                  <SidebarMenuButton render={<Link href={`/runs/${run.id}`} />} title={run.prompt}>
                    <span className="truncate">{run.prompt}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="px-4 pb-4 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">Software Factory</SidebarFooter>
    </Sidebar>
  );
}

// Icon swap curve and timing from the emil-animations recipe: deep scale + blur cross-fade, firm ease-out.
const SWAP = "transition-[opacity,scale,filter] duration-300 ease-[cubic-bezier(0.25,0.1,0,1)] motion-reduce:transition-none";

/** In the collapsed rail the logo doubles as the expand button: hovering (or focusing) it cross-fades to the panel icon. */
function LogoToggle() {
  const { toggleSidebar } = useSidebar();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Expand sidebar"
      onClick={toggleSidebar}
      className="group/logo relative hidden group-data-[collapsible=icon]:inline-flex"
    >
      <IconFlowerFilled
        className={cn(
          "size-5 group-hover/logo:scale-[0.3] group-hover/logo:opacity-0 group-hover/logo:blur-[3px] group-focus-visible/logo:scale-[0.3] group-focus-visible/logo:opacity-0 group-focus-visible/logo:blur-[3px]",
          SWAP,
        )}
      />
      <IconLayoutSidebar
        className={cn(
          "absolute inset-0 m-auto scale-[0.3] opacity-0 blur-[3px] group-hover/logo:scale-100 group-hover/logo:opacity-100 group-hover/logo:blur-none group-focus-visible/logo:scale-100 group-focus-visible/logo:opacity-100 group-focus-visible/logo:blur-none",
          SWAP,
        )}
      />
    </Button>
  );
}
