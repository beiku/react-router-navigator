# React Router Navigator

Navigate to route module files directly from your React Router `routes.ts` / `routes.js` with **Cmd+Click** (Ctrl+Click on Windows/Linux).

## Features

### 🔗 Cmd+Click Navigation

Click on any file path string in your routes file to jump directly to that file.

![Navigation Demo](images/navigation-demo.gif)

### 📍 CodeLens Path Display

See the full URL path above each route definition. Supports nested `route()`, `index()`, `layout()`, and `prefix()`.

```typescript
// routes.ts
export default [
  index('./home.tsx'), // /
  route('about', './about.tsx'), // /about

  ...prefix('dashboard', [
    index('./dashboard/home.tsx'), // /dashboard
    route('settings', './dashboard/settings.tsx'), // /dashboard/settings
  ]),
] satisfies RouteConfig;
```

### ✨ Highlights

- **Full path highlighting** - The entire path string is highlighted on hover
- **Multiline support** - Works with multiline `route()` calls
- **Project-scoped search** - Only searches within the same project root
- **Supports both TypeScript and JavaScript**

## Supported Files

| File         | Navigation | CodeLens |
| ------------ | ---------- | -------- |
| `routes.ts`  | ✅         | ✅       |
| `routes.tsx` | ✅         | ✅       |
| `routes.js`  | ✅         | ✅       |
| `routes.jsx` | ✅         | ✅       |

## Extension Settings

| Setting                                    | Type       | Default                          | Description                           |
| ------------------------------------------ | ---------- | -------------------------------- | ------------------------------------- |
| `reactRouterNavigator.fileExtensions`      | `string[]` | `[".tsx", ".ts", ".jsx", ".js"]` | File extensions to search             |
| `reactRouterNavigator.excludeFolders`      | `string[]` | `["node_modules", "dist", ...]`  | Folders to exclude                    |
| `reactRouterNavigator.triggerFilePatterns` | `string[]` | `["routes"]`                     | File patterns that trigger navigation |
| `reactRouterNavigator.maxSearchResults`    | `number`   | `3`                              | Max search results                    |
| `reactRouterNavigator.enableCodeLens`      | `boolean`  | `true`                           | Show URL path as CodeLens             |

## Requirements

- VS Code 1.75.0 or higher
- React Router v7 project

## Release Notes

### 0.0.1

- Initial release
- Cmd+Click navigation to route module files
- CodeLens showing full URL paths
- Support for `route()`, `index()`, `layout()`, `prefix()`
- Multiline route definition support
- TypeScript and JavaScript support

---

**Enjoy!** 🚀
