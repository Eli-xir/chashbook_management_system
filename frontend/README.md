# Cashbook frontend

Run `npm run dev` in this folder. Start the backend separately with `uvicorn main:app --reload` from its virtual environment. Vite proxies `/api` to localhost:8000, including cookie authentication, uploads and media downloads. No frontend environment file is needed for local development.

The existing mobile card workflow and admin sidebar/ledger use real backend data. `src/data/cashbookApi.ts` is the shared API boundary; no browser local-storage database or mock authentication remains. Old prototype data in the browser is left untouched and is not imported automatically.

See the [root setup guide](../README.md) for initial login and PostgreSQL startup, and the [API contract](../backend/README.md) for communication points.

Shared UI remains in `src/pages/Admin/components`; the same `UserPreview` drives user login, admin preview and crediting a user. `AttachmentInput` handles uploads/recording/review throughout. `src/pages/Ledger/ledgerModel.ts` owns filtering, head-branch selection, totals and frontend pagination; `ledgerExport.ts` exports those report rows to portrait PDF, XLSX and CSV, with PDF-based printing.

`ReportActions` provides the shared full-screen Preview / export dialog for both ledgers: all selected report pages, fit-width/zoom controls, PDF, Excel or CSV download, print and native file sharing. Portrait reports include the Sohail Malik Architects logo, branded headers, merged summary labels, aligned currency values and page footers. CSV is plain tabular data with UTF-8 BOM, escaped fields and formula-injection protection. Print opens the prepared PDF rather than printing the website; use the PDF viewer’s print control if the browser does not launch its dialog automatically. Its HTML preview uses the same report data as the exported files; PDF pagination may differ when long rows spill onto another page. Files are prepared before tapping Share so mobile user activation is preserved. Sharing opens the device's share sheet and requires a supporting browser and secure context (HTTPS or localhost). Available apps depend on the device; plain LAN HTTP or unsupported file types fall back to downloading and attaching the file manually. Reports are not uploaded or given public URLs.

Rightward finger swipes reveal the user's ledger with a slide transition; leftward swipes return to transaction entry. Hidden panes are inert, and reduced-motion preferences disable the transition.

No attachments or entry-ID column is included in reports. Normal users receive credit entries only and aggregate bill/payable figures, never their individual bill entries. Monetary inputs use at most two decimal places.

For local phone use, browse to the computer's LAN address on Vite's port. Direct microphone recording requires HTTPS or localhost; on plain LAN HTTP the upload-audio option is available. Camera/gallery file selection uses the mobile file picker.

The old mock API/storage tests were removed with that implementation. Existing pure tree/permissions/profile tests remain, but no tests or builds were run for this change at the user's request.
