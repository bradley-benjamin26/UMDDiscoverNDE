# LCSH Suggestions add-on

This add-on reads the active Primo NDE `query` route parameter and requests matching Library of Congress Subject Headings from `id.loc.gov`. Selecting a suggestion starts an exact subject search in Primo.

## Build

```sh
npm run build:addon
```

Host the contents of `dist/LcshSuggestions` on an HTTPS server that permits cross-origin requests. In Alma Add-on Configuration, use:

- Add-on name: `LcshSuggestions`
- Exposed module: `./LcshSuggestions`
- Entry file: the hosted `remoteEntry.js`
- Placement: `nde-search-results-top`

Configure the add-on with the URL of the separately deployed backend:

```json
{
	"apiBaseUrl": "https://your-lcsh-service.example.edu"
}
```

The browser sends the query to this institutional service. The service extracts short candidate concepts before querying the Library of Congress API.