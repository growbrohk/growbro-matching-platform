/** Default max rows for org-scoped list queries (products, events, orders, etc.). */
export const DEFAULT_LIST_LIMIT = 1000;

/** Max rows for public discovery/search surfaces. */
export const PUBLIC_LIST_LIMIT = 500;

/** Enquiry list rows shown per page before Load more. */
export const ENQUIRIES_PAGE_SIZE = 30;

/** Rows fetched per Enquiries feed page (initial load and each Load more). */
export const ENQUIRIES_INITIAL_FETCH = ENQUIRIES_PAGE_SIZE;
