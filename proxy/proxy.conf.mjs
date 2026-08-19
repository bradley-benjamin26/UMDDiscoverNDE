import {PROXY_TARGET} from "./proxy.const.mjs";
import {customizationConfigOverride} from "./customization_config_override.mjs";
import {deepMerge} from "./proxy-utils.mjs";






const proxyRules = [
  {
    context: [
      '/custom/*/assets',
      '/custom/*/assets/**',
      '/nde/custom/*/assets',
      '/nde/custom/*/assets/**'
    ],
    target: 'not-needed',
    router: (req) => `${req.protocol}://${req.get('host')}`,
    changeOrigin: false,
    logLevel: 'debug',
    pathRewrite: (path, req) => {
      const rewritten = path.replace(/^\/(?:nde\/)?custom\/[^/]+\/assets\/?/, '/assets/');
      console.log('[proxy-assets]', { originalPath: path, rewrittenPath: rewritten, host: req.get('host') });
      return rewritten;
    },
  },
  {
    context: ['/primaws/rest/pub/configuration/vid/'],
    target: PROXY_TARGET,
    secure: true,
    changeOrigin: true,
    logLevel: 'debug',
    selfHandleResponse: true,
    onProxyRes(proxyRes, req, res) {
      const chunks = [];
      proxyRes.on('data', chunk => chunks.push(chunk));
      proxyRes.on('end', () => {
        try {
          const bodyStr = Buffer.concat(chunks).toString('utf8');
          console.log('[proxy-config-start]', { url: req.url, host: req.get('host'), customizationOverride: customizationConfigOverride });
          const json = JSON.parse(bodyStr);
          console.log('[proxy-config-before-merge]', {
            customizationKeys: json.customization ? Object.keys(json.customization) : [],
            overrideKeys: Object.keys(customizationConfigOverride),
            homepageBGImageOverride: customizationConfigOverride.homepage?.homepageBGImage,
            homepageHtmlKeys: customizationConfigOverride.homepage?.html ? Object.keys(customizationConfigOverride.homepage.html) : []
          });
          // MERGE instead of replace to retain unspecified fields
          json.customization = deepMerge(json.customization || {}, customizationConfigOverride);
          console.log('[proxy-config-after-merge]', {
            homepageBGImage: json.customization?.homepage?.homepageBGImage,
            viewSvg: json.customization?.viewSvg,
            libraryLogo: json.customization?.libraryLogo
          });
          const out = JSON.stringify(json);
          res.setHeader('content-type', 'application/json');
          res.end(out);
        } catch (e) {
          console.error('[proxy-config-parse-error]', { message: e.message, url: req.url, bodyPreview: Buffer.concat(chunks).slice(0, 500).toString('utf8') });
          res.end(Buffer.concat(chunks));
        }
      });
    }
  },
  {
    context: [
      '/nde/custom/**'
    ],
    target: 'not-needed',
    router: (req) => {
      const url = `${req.protocol}://${req.get('host')}`
      console.log(url);
      return url;

    },
    secure: true,
    logLevel: 'debug',
    pathRewrite: { '^/nde/custom/.*/': '' },

  },
  {
    context: [
      '**', '!/nde/custom/**'
    ],
    target: PROXY_TARGET,
    secure: true,
    changeOrigin: true,
    logLevel: 'debug',

  }
];



export default proxyRules;
