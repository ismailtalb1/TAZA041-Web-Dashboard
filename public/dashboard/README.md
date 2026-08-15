# Dashboard structure

The employee dashboard is organized into shared infrastructure and role-specific files:

- `assets/js/config.js`: API client, authentication, role checks, language, theme, formatting, modal behavior, and shared utilities.
- `assets/js/dashboard-components.js`: sidebar, topbar, and notification-panel markup for all employee roles.
- `assets/js/employee-profile.js`: the shared employee profile UI and behavior.
- `assets/js/pages/<role>/*.js`: data loading and interactions grouped by employee role and feature.
- `assets/js/pages/general-manager/*.js`: general-manager features split by employees, customers, orders, reports, loyalty, settings, and notifications.
- `assets/js/pages/inventory-manager/*.js`: inventory features split by products, offers, notifications, and overview.
- `assets/js/pages/communication-manager/*.js`: communication features split by restaurant content, gallery, suggestions, reviews, and notifications.
- `assets/js/pages/delivery-manager/*.js`: delivery features split by live operations, active deliveries, assignment, drivers, settings, and notifications.
- `assets/js/pages/order-manager/*.js`: order features split by orders, reservations, notifications, and overview.
- `assets/js/pages/finance-manager/*.js`: finance features split by accounts, transactions, reports, notifications, and overview.
- `assets/js/pages/driver/*.js`: driver features split by active deliveries, history, ratings, notifications, and overview.
- `assets/css/dashboard.css`: shared visual system and reusable components.
- `assets/css/dashboard-readable.css`: opt-in large, readable presentation for sections marked with `readable-section`; separately redesigned sections stay outside this layer.
- `assets/css/<role>.css`: styles that belong to one role only.
- `<role>.html`: page content, tables, forms, and modal markup only; no inline CSS or JavaScript.

## Change rules

1. Add shared navigation or topbar changes in `dashboard-components.js`, not in every HTML page.
2. Add authentication, permission, translation, formatting, or generic modal behavior in `config.js`.
3. Add profile changes in `employee-profile.js` so every role receives them.
4. Keep role-specific API calls and table rendering in that role's file or feature directory under `assets/js/pages`.
5. Keep external values escaped with `TAZA.Utils.escapeHtml` before inserting them into HTML templates.
6. Add `readable-section` to standard manager sections instead of copying typography, spacing, card, table, form, notification, and responsive rules into every role stylesheet.
7. Keep feature-specific redesigns outside `readable-section` when their own role stylesheet already defines the complete visual behavior.

The architecture test in `tests/Feature/SecurityHardeningTest.php` prevents role pages from returning to inline styles/scripts or duplicating the shared dashboard chrome.
Role-specific profile scripts are intentionally not used; every employee dashboard delegates profile loading and editing to `employee-profile.js`.

## Order record lifecycle

- The general-manager and order-manager dashboards use the shared `/api/orders/{id}` record-management endpoints.
- Active orders cannot be archived or deleted. Complete or cancel the operational workflow first.
- Archived orders are hidden from active lists and can be restored from the archive filter.
- Deletion is a soft delete for the order and its delivery/reservation extension, so it disappears from all employee and customer operational views.
- Payment, loyalty, and order-item rows remain available for financial and audit integrity.
