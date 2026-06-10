# Project Skills & Standards

## Development Environment
- **Node.js & Package Manager:** The project uses specific versions of Node.js and `pnpm`. 
  - **Always prefix terminal commands with `fnm use`** (e.g., `fnm use && pnpm test`) or use a persistent terminal session initialized with `fnm use`. 
  - This ensures the correct node version is active and avoids wasted time on version mismatches or `pnpm` availability issues.

## Quality Expectations
This project adheres to high-quality standards in line with its existing codebase:
- **Strict Typing:** Leverage TypeScript's most advanced and strict features. Avoid `any` types. Ensure deep integration with schemas (Zod/ArkType/Standard Schema).
- **Performance:** Keep the library lightweight. Avoid unnecessary allocations. The core mission is to provide type safety around raw SQL with zero overhead.
- **Modern Toolchain:** The project uses modern, fast tools (Oxlint, Oxfmt, Tsdown, TypeScript 6+). Do not revert to older tools.
- **Testing:** Ensure all new features or refactorings are fully covered by tests using the existing Node.js test runner structure. Run `pnpm test` frequently to avoid regressions.
- **Clean Architecture:** Respect the adapter pattern (e.g., BetterSqlite3, NodeSqlite) and the core library separation. Avoid cross-coupling.
