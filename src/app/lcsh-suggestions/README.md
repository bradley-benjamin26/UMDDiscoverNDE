# LCSH Suggestions customization

This component reads the active Primo NDE `query` route parameter and requests matching Library of Congress Subject Headings directly from `id.loc.gov`. It is included in the normal NDE customization package at `nde-search-results-top`.

## Build

```sh
npm run build
```

Upload `dist/01USMAI_UMCP-NDE.zip` in Alma under **Discovery > View List > Edit > Manage Customization Package**.

No add-on configuration or separate backend is required. The browser sends bounded candidate subject phrases to the Library of Congress; full Primo records and user identifiers are not sent.

The browser implementation uses per-session request caching and a three-second timeout. It depends on the Library of Congress continuing to permit cross-origin requests from Primo.