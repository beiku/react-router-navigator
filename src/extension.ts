import * as vscode from 'vscode';
import * as path from 'path';

// Configuration interface
interface ExtensionConfig {
  fileExtensions: string[];
  excludeFolders: string[];
  triggerFilePatterns: string[];
  maxSearchResults: number;
  enableCodeLens: boolean;
}

// Route information for CodeLens
interface RouteInfo {
  type: 'route' | 'index' | 'layout' | 'prefix';
  path: string;
  fullPath: string;
  line: number;
  range: vscode.Range;
}

// Get configuration from settings
function getConfig(): ExtensionConfig {
  const config = vscode.workspace.getConfiguration('reactRouterNavigator');
  return {
    fileExtensions: config.get<string[]>('fileExtensions', ['.tsx', '.ts', '.jsx', '.js']),
    excludeFolders: config.get<string[]>('excludeFolders', ['node_modules', 'dist', 'build', '.git', '.react-router']),
    triggerFilePatterns: config.get<string[]>('triggerFilePatterns', ['routes']),
    maxSearchResults: config.get<number>('maxSearchResults', 3),
    enableCodeLens: config.get<boolean>('enableCodeLens', true),
  };
}

// Find the project root from a file path (looks for package.json or common project markers)
function findProjectRoot(filePath: string): string {
  let currentDir = path.dirname(filePath);
  const workspaceFolders = vscode.workspace.workspaceFolders;

  // Get the workspace root as a fallback
  const workspaceRoot = workspaceFolders?.[0]?.uri.fsPath || currentDir;

  // Walk up the directory tree looking for project markers
  const projectMarkers = ['package.json', 'tsconfig.json', '.git'];

  while (currentDir !== path.dirname(currentDir)) {
    // Don't go above the workspace root
    if (currentDir.length < workspaceRoot.length) {
      break;
    }

    for (const marker of projectMarkers) {
      try {
        const markerPath = path.join(currentDir, marker);
        // Check if this looks like a project root by checking if marker exists
        // We use vscode.workspace.fs for async check but for simplicity, we'll use the sync approach
        if (require('fs').existsSync(markerPath)) {
          return currentDir;
        }
      } catch {
        // Continue searching
      }
    }

    currentDir = path.dirname(currentDir);
  }

  return path.dirname(filePath);
}

// Build exclude pattern from folders
function buildExcludePattern(folders: string[]): string {
  return `**/{${folders.join(',')}}/**`;
}

// Check if file matches trigger patterns
function isTriggerFile(fileName: string, patterns: string[]): boolean {
  const lowerFileName = fileName.toLowerCase();
  return patterns.some((pattern) => lowerFileName.includes(pattern.toLowerCase()));
}

// Check if path looks like a file path
// Must end with a file extension (.tsx, .ts, .jsx, .js)
function looksLikePath(rawPath: string, extensions: string[]): boolean {
  return extensions.some((ext) => rawPath.endsWith(ext));
}

// Search for files matching the pattern within the same project root
async function searchFiles(
  searchPattern: string,
  documentUri: vscode.Uri,
  config: ExtensionConfig,
  token: vscode.CancellationToken
): Promise<vscode.Uri[]> {
  const excludePattern = buildExcludePattern(config.excludeFolders);
  const projectRoot = findProjectRoot(documentUri.fsPath);

  // Create a relative pattern to search only within the project root
  const relativePattern = new vscode.RelativePattern(projectRoot, `**/${searchPattern}`);

  // Search with exact pattern first
  let files = await vscode.workspace.findFiles(relativePattern, excludePattern, config.maxSearchResults);

  if (token.isCancellationRequested) {
    return [];
  }

  // If no results and pattern has no extension, try with supported extensions
  if (files.length === 0 && !config.fileExtensions.some((ext) => searchPattern.endsWith(ext))) {
    for (const ext of config.fileExtensions) {
      if (token.isCancellationRequested) {
        return [];
      }

      const patternWithExt = new vscode.RelativePattern(projectRoot, `**/${searchPattern}${ext}`);
      const filesWithExt = await vscode.workspace.findFiles(
        patternWithExt,
        excludePattern,
        Math.floor(config.maxSearchResults / 2)
      );
      files.push(...filesWithExt);
    }
  }

  return files;
}

// Extract path from text at position
function extractPathAtPosition(
  document: vscode.TextDocument,
  position: vscode.Position
): { range: vscode.Range; rawPath: string } | null {
  // Use [^'"]* instead of [^'"]+ to also match empty strings like ''
  const range = document.getWordRangeAtPosition(position, /(['"])([^'"]*)\1/);
  if (!range) {
    return null;
  }

  const text = document.getText(range);
  const rawPath = text.replace(/['"]/g, '');

  return { range, rawPath };
}

// ============================================
// Route Parser for React Router v7 routes.ts
// Based on: https://reactrouter.com/start/framework/routing
// Supports multiline route() calls
// ============================================

// Token types for parsing
interface RouteToken {
  type: 'route' | 'index' | 'layout' | 'prefix';
  path: string;
  startIndex: number;
  endIndex: number;
  hasChildren: boolean;
  childrenStartIndex?: number;
}

// Get line number from character index
function getLineFromIndex(text: string, index: number): number {
  const substring = text.substring(0, index);
  return (substring.match(/\n/g) || []).length;
}

// Get column from character index
function getColumnFromIndex(text: string, index: number): number {
  const lastNewline = text.lastIndexOf('\n', index - 1);
  return index - lastNewline - 1;
}

// Extract string content from quotes (handles both ' and ")
function extractStringArg(text: string, startFrom: number): { value: string; endIndex: number } | null {
  // Skip whitespace and commas
  let i = startFrom;
  while (i < text.length && /[\s,]/.test(text[i])) {
    i++;
  }

  if (i >= text.length) {
    return null;
  }

  const quote = text[i];
  if (quote !== '"' && quote !== "'") {
    return null;
  }

  i++; // skip opening quote
  let value = '';
  while (i < text.length && text[i] !== quote) {
    if (text[i] === '\\' && i + 1 < text.length) {
      value += text[i + 1];
      i += 2;
    } else {
      value += text[i];
      i++;
    }
  }

  if (i >= text.length) {
    return null;
  }

  return { value, endIndex: i + 1 }; // +1 to skip closing quote
}

// Find matching closing parenthesis
function findMatchingParen(text: string, openIndex: number): number {
  let depth = 1;
  let i = openIndex + 1;

  while (i < text.length && depth > 0) {
    if (text[i] === '(') {
      depth++;
    } else if (text[i] === ')') {
      depth--;
    } else if (text[i] === '"' || text[i] === "'") {
      // Skip string content
      const quote = text[i];
      i++;
      while (i < text.length && text[i] !== quote) {
        if (text[i] === '\\') {
          i++;
        }
        i++;
      }
    }
    i++;
  }

  return depth === 0 ? i - 1 : -1;
}

// Check if route/layout has children array
function findChildrenArray(text: string, afterFileArg: number, closeParenIndex: number): number | null {
  let i = afterFileArg;
  let foundComma = false;

  while (i < closeParenIndex) {
    if (text[i] === ',') {
      foundComma = true;
    } else if (text[i] === '[' && foundComma) {
      return i;
    } else if (!/\s/.test(text[i]) && text[i] !== ',') {
      // If we hit non-whitespace that's not a comma or [, check if it's spread operator
      if (text.substring(i, i + 3) === '...') {
        // This is a spread, not a direct children array at this position
        // but we should continue looking
        i += 3;
        continue;
      }
    }
    i++;
  }

  return null;
}

// Parse all route tokens from text
function parseRouteTokens(text: string): RouteToken[] {
  const tokens: RouteToken[] = [];

  // Match route, index, layout, prefix calls
  const patterns = [
    { regex: /\broute\s*\(/g, type: 'route' as const, hasPath: true },
    { regex: /\bindex\s*\(/g, type: 'index' as const, hasPath: false },
    { regex: /\blayout\s*\(/g, type: 'layout' as const, hasPath: false },
    { regex: /\bprefix\s*\(/g, type: 'prefix' as const, hasPath: true },
  ];

  for (const { regex, type, hasPath } of patterns) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const startIndex = match.index;
      const openParenIndex = text.indexOf('(', startIndex);
      const closeParenIndex = findMatchingParen(text, openParenIndex);

      if (closeParenIndex === -1) {
        continue;
      }

      let path = '';
      let afterPathIndex = openParenIndex + 1;

      if (hasPath) {
        // Extract path argument (first string)
        const pathArg = extractStringArg(text, openParenIndex + 1);
        if (!pathArg) {
          continue;
        }
        path = pathArg.value;
        afterPathIndex = pathArg.endIndex;
      }

      // For route/layout, extract file path argument
      let afterFileIndex = afterPathIndex;
      if (type === 'route' || type === 'layout' || type === 'index') {
        const fileArg = extractStringArg(text, afterPathIndex);
        if (fileArg) {
          afterFileIndex = fileArg.endIndex;
        }
      }

      // Check for children array
      let hasChildren = false;
      let childrenStartIndex: number | undefined;

      if (type === 'prefix') {
        // prefix always has children as second argument
        const childrenStart = findChildrenArray(text, afterPathIndex, closeParenIndex);
        if (childrenStart !== null) {
          hasChildren = true;
          childrenStartIndex = childrenStart;
        }
      } else if (type === 'route' || type === 'layout') {
        // route/layout may have optional children as third argument
        const childrenStart = findChildrenArray(text, afterFileIndex, closeParenIndex);
        if (childrenStart !== null) {
          hasChildren = true;
          childrenStartIndex = childrenStart;
        }
      }

      tokens.push({
        type,
        path,
        startIndex,
        endIndex: closeParenIndex,
        hasChildren,
        childrenStartIndex,
      });
    }
  }

  // Sort by start index
  tokens.sort((a, b) => a.startIndex - b.startIndex);

  return tokens;
}

// Parse routes.ts and extract route information with full paths
function parseRoutesFile(document: vscode.TextDocument): RouteInfo[] {
  const text = document.getText();
  const routes: RouteInfo[] = [];
  const tokens = parseRouteTokens(text);

  // Build a tree structure to calculate full paths
  interface TreeNode {
    token: RouteToken;
    children: TreeNode[];
    parent?: TreeNode;
  }

  // Find parent-child relationships based on position
  const buildTree = (): TreeNode[] => {
    const roots: TreeNode[] = [];
    const nodes: TreeNode[] = tokens.map((token) => ({ token, children: [] }));

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      let foundParent = false;

      // Find the closest parent that contains this node in its children array
      for (let j = i - 1; j >= 0; j--) {
        const potentialParent = nodes[j];
        if (
          potentialParent.token.hasChildren &&
          potentialParent.token.childrenStartIndex !== undefined &&
          node.token.startIndex > potentialParent.token.childrenStartIndex &&
          node.token.endIndex <= potentialParent.token.endIndex
        ) {
          // Check if there's a closer parent
          let isClosestParent = true;
          for (let k = j + 1; k < i; k++) {
            const middle = nodes[k];
            if (
              middle.token.hasChildren &&
              middle.token.childrenStartIndex !== undefined &&
              node.token.startIndex > middle.token.childrenStartIndex &&
              node.token.endIndex <= middle.token.endIndex
            ) {
              isClosestParent = false;
              break;
            }
          }

          if (isClosestParent) {
            potentialParent.children.push(node);
            node.parent = potentialParent;
            foundParent = true;
            break;
          }
        }
      }

      if (!foundParent) {
        roots.push(node);
      }
    }

    return roots;
  };

  // Calculate full path for a node
  const calculateFullPath = (node: TreeNode): string => {
    const pathParts: string[] = [];
    let current: TreeNode | undefined = node;

    while (current) {
      if (current.token.type !== 'layout' && current.token.path) {
        pathParts.unshift(current.token.path);
      }
      current = current.parent;
    }

    const combined = pathParts.join('/').replace(/\/+/g, '/');
    return '/' + combined.replace(/^\/+/, '');
  };

  // Traverse tree and collect routes
  const traverse = (node: TreeNode) => {
    const fullPath = calculateFullPath(node) || '/';
    const line = getLineFromIndex(text, node.token.startIndex);
    const col = getColumnFromIndex(text, node.token.startIndex);

    // Only add route, index, layout (not prefix) to the routes list
    if (node.token.type !== 'prefix') {
      routes.push({
        type: node.token.type,
        path: node.token.path,
        fullPath,
        line,
        range: new vscode.Range(line, col, line, col + node.token.type.length),
      });
    }

    for (const child of node.children) {
      traverse(child);
    }
  };

  const roots = buildTree();
  for (const root of roots) {
    traverse(root);
  }

  return routes;
}

// ============================================
// CodeLens Provider
// ============================================

class RouteCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor() {
    // Refresh CodeLens when document changes
    vscode.workspace.onDidChangeTextDocument(() => {
      this._onDidChangeCodeLenses.fire();
    });
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] | null {
    const config = getConfig();

    if (!config.enableCodeLens) {
      return null;
    }

    // Only process routes.ts/js files
    const fileName = document.fileName.toLowerCase();
    if (
      !fileName.endsWith('routes.ts') &&
      !fileName.endsWith('routes.tsx') &&
      !fileName.endsWith('routes.js') &&
      !fileName.endsWith('routes.jsx')
    ) {
      return null;
    }

    const routes = parseRoutesFile(document);
    const codeLenses: vscode.CodeLens[] = [];

    for (const route of routes) {
      const lens = new vscode.CodeLens(route.range, {
        title: `${route.fullPath}`,
        command: '',
        tooltip: `Full URL path: ${route.fullPath}`,
      });
      codeLenses.push(lens);
    }

    return codeLenses;
  }
}

export function activate(context: vscode.ExtensionContext) {
  console.log('✅ Open File for Routes extension activated!');

  // Definition Provider - enables Cmd+Click navigation
  const definitionProvider = vscode.languages.registerDefinitionProvider(
    ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'],
    {
      async provideDefinition(document, position, token): Promise<vscode.LocationLink[] | null> {
        try {
          const config = getConfig();
          const extracted = extractPathAtPosition(document, position);

          if (!extracted) {
            return null;
          }

          const { range, rawPath } = extracted;
          const isTrigger = isTriggerFile(document.fileName, config.triggerFilePatterns);

          // Always check if it looks like a file path (even in routes.ts files)
          // Only process actual file paths, not route path strings like 'dashboard'
          if (!looksLikePath(rawPath, config.fileExtensions)) {
            return null;
          }

          if (token.isCancellationRequested) {
            return null;
          }

          // Clean up path prefix
          const searchPattern = rawPath.replace(/^[\.\/]+/, '');

          if (!searchPattern || searchPattern.length < 2) {
            return null;
          }

          const files = await searchFiles(searchPattern, document.uri, config, token);

          if (files.length === 0) {
            return null;
          }

          // Return all matches as LocationLinks
          return files.map((file) => ({
            originSelectionRange: range,
            targetUri: file,
            targetRange: new vscode.Range(0, 0, 0, 0),
            targetSelectionRange: new vscode.Range(0, 0, 0, 0),
          }));
        } catch (e) {
          console.error('🔥 Error in definition provider:', e);
          return null;
        }
      },
    }
  );

  // CodeLens Provider - shows full URL path above route definitions
  const codeLensProvider = vscode.languages.registerCodeLensProvider(
    { language: 'typescript', pattern: '**/routes.ts' },
    new RouteCodeLensProvider()
  );

  const codeLensProviderTsx = vscode.languages.registerCodeLensProvider(
    { language: 'typescriptreact', pattern: '**/routes.tsx' },
    new RouteCodeLensProvider()
  );

  const codeLensProviderJs = vscode.languages.registerCodeLensProvider(
    { language: 'javascript', pattern: '**/routes.js' },
    new RouteCodeLensProvider()
  );

  const codeLensProviderJsx = vscode.languages.registerCodeLensProvider(
    { language: 'javascriptreact', pattern: '**/routes.jsx' },
    new RouteCodeLensProvider()
  );

  context.subscriptions.push(
    definitionProvider,
    codeLensProvider,
    codeLensProviderTsx,
    codeLensProviderJs,
    codeLensProviderJsx
  );
}

export function deactivate() {}
