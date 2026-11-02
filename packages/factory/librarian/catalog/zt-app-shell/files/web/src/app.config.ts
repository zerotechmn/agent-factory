// Everything product-specific about the shell lives here, so adapting it is
// one file: the product name and the shell's own UI copy. Write the copy in
// the UI language (ZT §11); the Mongolian strings from ZT §9 are in comments.

export const APP_NAME = "App name"; // the PRD's product name

export const COPY = {
  account: (name: string) => `Account menu for ${name}`,
  backHome: "Go to the home page",
  collapseMenu: "Collapse menu",
  expandMenu: "Expand menu",
  home: `${APP_NAME} home`,
  mainNavigation: "Main navigation",
  noPermission: "You don't have permission to view this page.", // mn: "Танд энэ хуудсыг үзэх эрх байхгүй байна."
  noPermissionTitle: "No permission",
  notFound: "This page does not exist.", // mn: "Хайсан бичлэг олдсонгүй."
  notFoundTitle: "Not found",
  notifications: (count: number) => `Notifications (${count})`,
  openMenu: "Open menu",
  retry: "Try again", // mn: "Дахин оролдох"
  signOut: "Sign out",
  skipToContent: "Skip to main content",
} as const;
