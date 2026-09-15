# Frontend: your implementation

This folder intentionally contains no application code, package manifest, dependencies, or generated assets.

Start after authentication, assigned heads, and transaction creation work in the new backend. Switch to `frontend_local` and merge your committed backend changes.

Create your frontend project yourself. React with TypeScript and Vite is compatible with the previous stack, but no tooling has been initialized here.

Build in this order:

1. Sign-in screen and session handling.
2. User entry screen: assigned heads, amount, debit/credit, payment medium, optional image and voice note, and a clear submission confirmation.
3. Separate admin screens for heads, users and permissions, transactions and corrections.
4. Loading states, useful validation messages, duplicate-submit protection, mobile layout, and keyboard accessibility.

Regular users should not get transaction lists, reports, or amendment screens. Hiding controls is not security: the backend must enforce those restrictions.

Once local development works, configure frontend allowed hosts and backend allowed origins for the actual deployment addresses. Never place database credentials in frontend configuration.
