import { lazy } from "react";

// Streamdown and Shiki are most of the bundle; load them with the first page that renders a response.
export const LazyMessageResponse = lazy(() => import("./response").then((m) => ({ default: m.MessageResponse })));
