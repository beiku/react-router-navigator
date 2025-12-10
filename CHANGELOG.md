# Changelog

All notable changes to "React Router Navigator" will be documented in this file.

## [0.0.2] - 2025-12-10

### Fixed

- **Improved File Path Validation**: Only process strings ending with file extensions (`.tsx`, `.ts`, `.jsx`, `.js`)
- Prevents route path strings like `'dashboard'` or `'settings'` from being treated as file paths
- More accurate file path detection in `routes.ts` files

## [0.0.1] - 2025-12-10

### Added

- **Cmd+Click Navigation**: Jump to route module files directly from `routes.ts`/`routes.js`
- **CodeLens URL Display**: Show full URL path above each route definition
- **Route Type Support**: `route()`, `index()`, `layout()`, `prefix()`
- **Multiline Support**: Parse multiline route definitions correctly
- **Project-Scoped Search**: Search only within the same project root
- **TypeScript & JavaScript Support**: Works with `.ts`, `.tsx`, `.js`, `.jsx` files
- **Configurable Settings**: Customize file extensions, exclude folders, and more
