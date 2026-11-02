import enUS from "antd/locale/en_US";
import dayjs from "dayjs";
import "dayjs/locale/en";

// ZT §13 theme. colorPrimary is the only per-project value: take it from the UI design, and check it
// keeps white button text at 4.5:1. antd's default #1677ff gives only 4.1:1 and fails the browser
// check's contrast rule on primary buttons and the selected menu; blue-7 #0958d9 passes (5.6:1).
const COLOR_PRIMARY = "#0958d9";

// The UI language decides all three: e.g. antd/locale/mn_MN, "dayjs/locale/mn" and dayjs.locale("mn").
dayjs.locale("en");
export const antdLocale = enUS;

export const theme = {
  components: {
    // Danger link buttons and inline field errors are small text: red-7 (5.6:1) instead of colorError (3.3:1).
    Button: { colorError: "#cf1322", colorErrorActive: "#820014", colorErrorHover: "#a8071a" },
    Form: { colorError: "#cf1322" },
    // ZT §12: the default status colours are too light for small tag text (1.9–3.3:1). Darker steps of the
    // same palettes bring status tags to 4.5:1 on their tinted backgrounds.
    Tag: { colorError: "#a8071a", colorInfo: "#003eb3", colorSuccess: "#237804", colorWarning: "#874d00" },
  },
  token: {
    borderRadius: 6,
    colorInfo: COLOR_PRIMARY,
    colorPrimary: COLOR_PRIMARY,
    // ZT §12: description text (breadcrumbs, secondary Typography) must reach 4.5:1.
    colorTextDescription: "rgba(0,0,0,0.65)",
    fontSize: 14,
  },
};

/** ZT §13 status → Tag colour. Rename the keys to the PRD's statuses; keep the colours' meaning. */
export const statusColor = {
  approved: "success",
  cancelled: "default",
  draft: "default",
  inReview: "processing",
  pending: "warning",
  rejected: "error",
} as const;
