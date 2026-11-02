// ZT Design System §13 theme. colorPrimary from the UI design (#0958d9, WCAG AA).
export const theme = {
  token: {
    colorPrimary: '#0958d9',
    colorInfo: '#0958d9',
    // §12: description text (breadcrumbs, secondary Typography) must reach 4.5:1, so it uses colorTextSecondary's value.
    colorTextDescription: 'rgba(0,0,0,0.65)',
    borderRadius: 6,
    fontSize: 14,
  },
  components: {
    // §12: status colours are too light for small tag text (1.9–3.3:1). Tag text uses darker steps of the
    // same §1.3 palettes so status tags reach 4.5:1 on their tinted backgrounds.
    Tag: {
      colorSuccess: '#237804',
      colorWarning: '#874d00',
      colorInfo: '#003eb3',
      colorError: '#a8071a',
    },
    // Danger link buttons and inline field errors are small text: red-7 (5.6:1) instead of colorError (3.3:1).
    Button: { colorError: '#cf1322', colorErrorHover: '#a8071a', colorErrorActive: '#820014' },
    Form: { colorError: '#cf1322' },
  },
};

// Booking status → Tag colour (UI design change request: Pending=warning, Confirmed=success,
// Completed=processing, Cancelled=default).
export const bookingStatusColor: Record<string, string> = {
  Pending: 'warning',
  Confirmed: 'success',
  Completed: 'processing',
  Cancelled: 'default',
};

export const availabilityColor = (available: boolean) => (available ? 'success' : 'default');
