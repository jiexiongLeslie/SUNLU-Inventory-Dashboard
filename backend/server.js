const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = Number(process.env.PORT) || 5002;
const MAX_BODY_SIZE = 10 * 1024 * 1024;
const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_FILE = path.join(ROOT_DIR, 'data', 'data.json');
const META_FILE = path.join(ROOT_DIR, 'data', 'meta.json');
const SKU_MAPPING_FILE = path.join(ROOT_DIR, 'data', 'sku_mappings.json');
const SHOPIFY_CACHE_FILE = path.join(ROOT_DIR, 'data', 'shopify_inventory_cache.json');
const AGE_DATA_FILE = path.join(ROOT_DIR, 'data', 'inventory_age.json');
const FRONTEND_DIR = path.join(ROOT_DIR, 'frontend');
const SHOPIFY_ENV_FILE = path.join(ROOT_DIR, 'shopify_token.env');
const SHOPIFY_API_VERSION = process.env.SHOPIFY_API_VERSION || '2025-10';
const SHOPIFY_STORE_DEFINITIONS = [
  { key: 'SHOPIFY_UK_STORE', label: 'UK', region: '英国' },
  { key: 'SHOPIFY_DE_STORE', label: 'EU', region: '欧洲' },
  { key: 'SHOPIFY_US_STORE', label: 'US', region: '美国', public_domain: 'store.sunlu.com' }
];
const SHOPIFY_LINK_ANALYTICS_STORE_DEFINITIONS = [
  { key: 'SHOPIFY_US_STORE', label: 'US', region: '美国', public_domain: 'store.sunlu.com' },
  { key: 'SHOPIFY_UK_STORE', label: 'UK', region: '英国', public_domain: 'uk.store.sunlu.com' },
  { key: 'SHOPIFY_FR_STORE', label: 'FR', region: '法国', public_domain: 'fr.store.sunlu.com' },
  { key: 'SHOPIFY_DE_STORE', label: 'DE', region: '德国', public_domain: 'de.store.sunlu.com' },
  { key: 'SHOPIFY_IT_STORE', label: 'IT', region: '意大利', public_domain: 'it.store.sunlu.com' }
];

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const optionalNumericFields = [
  'in_transit',
  'sales_7d_avg',
  'sales_7d',
  'sales_14d',
  'sales_30d',
  'days_of_cover'
];

const optionalStringFields = [
  'risk_level',
  'source_sheet'
];

const shopifyTokenCache = new Map();

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    return fallback;
  }
}

function writeJsonFile(filePath, payload) {
  const dataDir = path.dirname(filePath);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
}

function readRequestJson(req, limit = MAX_BODY_SIZE) {
  return new Promise((resolve, reject) => {
    let body = '';
    let bodyTooLarge = false;

    req.on('data', chunk => {
      if (bodyTooLarge) {
        return;
      }

      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > limit) {
        bodyTooLarge = true;
        reject(Object.assign(new Error('Request body is too large'), { statusCode: 413 }));
      }
    });

    req.on('end', () => {
      if (bodyTooLarge) {
        return;
      }

      try {
        resolve(JSON.parse(body || '{}'));
      } catch (e) {
        reject(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }));
      }
    });

    req.on('error', () => reject(Object.assign(new Error('Request failed'), { statusCode: 400 })));
  });
}

function normalizeShopDomain(value) {
  const shop = String(value || '').trim();
  if (!shop) {
    return '';
  }
  return shop.includes('.') ? shop : `${shop}.myshopify.com`;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return {};
  }

  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/).reduce((env, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      return env;
    }
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex < 0) {
      return env;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key) {
      env[key] = value;
    }
    return env;
  }, {});
}

function getShopifyConfig() {
  const fileEnv = readEnvFile(SHOPIFY_ENV_FILE);
  const env = { ...fileEnv, ...process.env };
  const clientId = env.SHOPIFY_CLIENT_ID || env.client_id;
  const clientSecret = env.SHOPIFY_CLIENT_SECRET || env.client_secret;
  const stores = SHOPIFY_STORE_DEFINITIONS
    .map(definition => ({
      ...definition,
      shop: normalizeShopDomain(env[definition.key])
    }))
    .filter(store => store.shop);

  return { clientId, clientSecret, stores };
}

function getShopifyLinkAnalyticsConfig() {
  const fileEnv = readEnvFile(SHOPIFY_ENV_FILE);
  const env = { ...fileEnv, ...process.env };
  const clientId = env.SHOPIFY_CLIENT_ID || env.client_id;
  const clientSecret = env.SHOPIFY_CLIENT_SECRET || env.client_secret;
  const stores = SHOPIFY_LINK_ANALYTICS_STORE_DEFINITIONS
    .map(definition => ({
      ...definition,
      shop: normalizeShopDomain(env[definition.key])
    }))
    .filter(store => store.shop);

  return { clientId, clientSecret, stores };
}

async function shopifyFetchJson(uri, options) {
  const response = await fetch(uri, options);
  const text = await response.text();
  let payload = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch (e) {
      payload = { error: text.slice(0, 500) };
    }
  }

  if (!response.ok) {
    const detail = payload?.errors || payload?.error || response.statusText;
    throw new Error(`Shopify request failed (${response.status}): ${JSON.stringify(detail)}`);
  }

  return payload;
}

async function getShopifyAccessToken(shop, clientId, clientSecret) {
  const cached = shopifyTokenCache.get(shop);
  if (cached && cached.expiresAt > Date.now() + 60 * 1000) {
    return cached.token;
  }

  const payload = await shopifyFetchJson(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret
    })
  });

  if (!payload?.access_token) {
    throw new Error('Shopify token response did not include access_token');
  }

  const expiresIn = Number(payload.expires_in) || 3600;
  shopifyTokenCache.set(shop, {
    token: payload.access_token,
    expiresAt: Date.now() + expiresIn * 1000
  });
  return payload.access_token;
}

async function shopifyGraphql(shop, token, query, variables) {
  const payload = await shopifyFetchJson(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Shopify-Access-Token': token
    },
    body: JSON.stringify({ query, variables })
  });

  if (payload.errors) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(payload.errors)}`);
  }

  return payload.data;
}

function normalizeKey(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function extractVariantColor(node) {
  const selectedOptions = Array.isArray(node.selectedOptions) ? node.selectedOptions : [];
  const colorOption = selectedOptions.find(option => /^(color|colour|颜色|顏色)$/i.test(String(option.name || '').trim()));
  if (colorOption?.value) {
    return String(colorOption.value).trim();
  }

  const title = String(node.title || '').trim();
  if (!title || title.toLowerCase() === 'default title') {
    return '';
  }

  return title
    .split(/\s*\/\s*/)
    .map(part => part.trim())
    .filter(Boolean)[0] || title;
}

function normalizeVariantNode(node, store, shop) {
  const product = node.product || {};
  const sku = String(node.sku || '').trim();
  const stock = Number(node.inventoryQuantity) || 0;
  const productTitle = product.title || '';
  const color = extractVariantColor(node);
  return {
    store_key: store.key,
    store_label: store.label,
    shop,
    product_id: product.id || '',
    product_title: productTitle,
    handle: product.handle || '',
    vendor: product.vendor || '',
    product_type: product.productType || '',
    status: product.status || '',
    tags: product.tags || [],
    variant_id: node.id || '',
    variant_title: node.title || '',
    color,
    sku,
    price: node.price || '',
    inventory_quantity: stock,
    inventory_tracked: Boolean(node.inventoryItem?.tracked),
    duplicate_count: 1,
    source_variant_ids: [node.id || ''].filter(Boolean),
    unique_key: [
      normalizeKey(store.key),
      normalizeKey(sku || productTitle)
    ].join('|'),
    risk_level: stock <= 0 ? 'out_of_stock' : stock < 10 ? 'low' : 'healthy'
  };
}

function mergeShopifyRecord(target, item) {
  target.duplicate_count += item.duplicate_count || 1;
  target.source_variant_ids.push(...item.source_variant_ids);
  if (item.product_title && !target.product_title.includes(item.product_title)) {
    target.product_title += ` / ${item.product_title}`;
  }
  if (item.color && !target.color.includes(item.color)) {
    target.color += ` / ${item.color}`;
  }
  if (item.variant_title && !target.variant_title.includes(item.variant_title)) {
    target.variant_title += ` / ${item.variant_title}`;
  }
  target.inventory_tracked = target.inventory_tracked || item.inventory_tracked;
}

function chooseRepresentativeInventory(items) {
  const groups = new Map();
  items.forEach(item => {
    const key = String(item.inventory_quantity);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(item);
  });

  const ranked = [...groups.entries()]
    .map(([inventory, groupItems]) => ({
      inventory: Number(inventory),
      items: groupItems,
      count: groupItems.length
    }))
    .sort((a, b) => b.count - a.count || b.inventory - a.inventory);

  const winner = ranked[0];
  const base = {
    ...winner.items[0],
    inventory_quantity: winner.inventory,
    duplicate_count: items.length,
    source_variant_ids: []
  };

  winner.items.slice(1).forEach(item => mergeShopifyRecord(base, item));
  base.duplicate_count = items.length;
  base.source_variant_ids = items.flatMap(item => item.source_variant_ids);
  base.inventory_values = ranked.map(group => ({
    inventory_quantity: group.inventory,
    count: group.count
  }));
  base.inventory_conflict = ranked.length > 1;
  base.conflict_count = ranked.length;
  base.risk_level = base.inventory_quantity <= 0 ? 'out_of_stock' : base.inventory_quantity < 10 ? 'low' : 'healthy';
  return base;
}

function dedupeShopifyInventory(records) {
  const byKey = new Map();
  records.forEach(item => {
    const key = item.unique_key;
    if (!byKey.has(key)) {
      byKey.set(key, []);
    }
    byKey.get(key).push(item);
  });
  return [...byKey.values()].map(chooseRepresentativeInventory);
}

async function fetchShopifyInventoryForStore(store, clientId, clientSecret) {
  const token = await getShopifyAccessToken(store.shop, clientId, clientSecret);
  const query = `
    query ProductVariants($cursor: String) {
      productVariants(first: 250, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          title
          sku
          price
          inventoryQuantity
          selectedOptions { name value }
          inventoryItem { tracked }
          product {
            id
            title
            handle
            vendor
            productType
            status
            tags
          }
        }
      }
    }
  `;

  const records = [];
  let cursor = null;
  let pageCount = 0;
  do {
    const data = await shopifyGraphql(store.shop, token, query, { cursor });
    const connection = data.productVariants;
    records.push(...connection.nodes.map(node => normalizeVariantNode(node, store, store.shop)));
    cursor = connection.pageInfo.hasNextPage ? connection.pageInfo.endCursor : null;
    pageCount += 1;
  } while (cursor && pageCount < 40);

  return {
    store_key: store.key,
    store_label: store.label,
    shop: store.shop,
    records,
    page_count: pageCount
  };
}

function summarizeShopifyInventory(records) {
  const skuSet = new Set(records.map(item => item.sku).filter(Boolean));
  const productSet = new Set(records.map(item => [item.store_key, item.product_title].join('|')).filter(Boolean));
  return {
    products: productSet.size,
    variants: records.reduce((sum, item) => sum + (Number(item.duplicate_count) || 1), 0),
    unique_items: records.length,
    skus: skuSet.size,
    total_inventory: records.reduce((sum, item) => sum + item.inventory_quantity, 0),
    zero_stock_variants: records.filter(item => item.inventory_quantity <= 0).length,
    low_stock_variants: records.filter(item => item.inventory_quantity > 0 && item.inventory_quantity < 10).length,
    active_variants: records.filter(item => item.status === 'ACTIVE').length,
    duplicate_groups: records.filter(item => item.duplicate_count > 1).length,
    inventory_conflicts: records.filter(item => item.inventory_conflict).length
  };
}

function isValidDateString(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function toTitleCaseSlug(slug) {
  return String(slug || '')
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(word => (/^(3d|pla|petg|abs|sunlu|2025|moq|kg|ams|s4|fda|eu|uk|us|uv|pc|tpu)$/i.test(word)
      ? word.toUpperCase()
      : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

function getProductHandleFromLandingPath(landingPath) {
  const parts = String(landingPath || '').split('/').filter(Boolean);
  const index = parts.indexOf('products');
  return index >= 0 && parts[index + 1] ? parts[index + 1] : '';
}

async function resolveShopifyLandingTitle(store, landingPath, landingType) {
  const cleanPath = String(landingPath || '').split('?')[0] || '/';
  if (cleanPath === '/') {
    return `SUNLU ${store.label} Store 首页`;
  }
  if (cleanPath === '/cart') {
    return 'Cart 购物车';
  }

  const productHandle = getProductHandleFromLandingPath(cleanPath);
  if (productHandle) {
    try {
      const payload = await shopifyFetchJson(`https://${store.shop}/products/${productHandle}.js`, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0' }
      });
      if (payload?.title) {
        return String(payload.title);
      }
    } catch (e) {
      // Public product JSON is best-effort only; fall back to a readable path title.
    }
    return toTitleCaseSlug(productHandle);
  }

  const parts = cleanPath.split('/').filter(Boolean);
  const lastPart = parts[parts.length - 1] || landingType || cleanPath;
  const suffix = landingType === 'Collection' ? ' Collection' : '';
  return `${toTitleCaseSlug(lastPart)}${suffix}`;
}

async function runShopifyQl(shop, token, shopifyql) {
  const query = `
    query ShopifyQl($query: String!) {
      shopifyqlQuery(query: $query) {
        tableData { columns { name dataType displayName } rows }
        parseErrors
      }
    }
  `;
  const payload = await shopifyGraphql(shop, token, query, { query: shopifyql });
  const result = payload.shopifyqlQuery;
  if (result?.parseErrors?.length) {
    throw new Error(`ShopifyQL parse errors: ${result.parseErrors.join('; ')}`);
  }
  return result?.tableData?.rows || [];
}

const LINK_ANALYTICS_RATE_FIELDS = [
  'bounce_rate',
  'added_to_cart_rate',
  'reached_checkout_rate',
  'completed_checkout_rate',
  'checkout_conversion_rate',
  'conversion_rate'
];

function numberValue(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function addWeightedMetric(target, row, field) {
  const sessions = numberValue(row.sessions);
  const value = numberValue(row[field]);
  target[`${field}_weighted_sum`] += value * sessions;
  target[`${field}_weight`] += sessions;
}

function finalizeWeightedMetric(target, field) {
  const weight = target[`${field}_weight`];
  target[field] = weight ? target[`${field}_weighted_sum`] / weight : 0;
  delete target[`${field}_weighted_sum`];
  delete target[`${field}_weight`];
}

function createLinkAnalyticsGroup(store, row) {
  const landingPath = row.landing_page_path || '/';
  const group = {
    store_key: store.key,
    store_label: store.label,
    shop_name: row.shop_name || store.label,
    url: `https://${store.public_domain || store.shop}${landingPath}`,
    landing_page_type: row.landing_page_type || '',
    landing_page_path: landingPath,
    online_store_visitors: 0,
    sessions: 0,
    sessions_that_reached_checkout: 0,
    sessions_that_reached_and_completed_checkout: 0,
    sessions_that_completed_checkout: 0,
    pageviews: 0,
    average_session_duration_weighted_sum: 0,
    average_session_duration_weight: 0,
    referring_channels: new Set(),
    traffic_types: new Set(),
    days: new Set()
  };
  LINK_ANALYTICS_RATE_FIELDS.forEach(field => {
    group[`${field}_weighted_sum`] = 0;
    group[`${field}_weight`] = 0;
  });
  return group;
}

function addLinkAnalyticsRow(group, row) {
  const sessions = numberValue(row.sessions);
  group.online_store_visitors += numberValue(row.online_store_visitors);
  group.sessions += sessions;
  group.sessions_that_reached_checkout += numberValue(row.sessions_that_reached_checkout);
  group.sessions_that_reached_and_completed_checkout += numberValue(row.sessions_that_reached_and_completed_checkout);
  group.sessions_that_completed_checkout += numberValue(row.sessions_that_completed_checkout);
  group.pageviews += numberValue(row.pageviews);
  group.average_session_duration_weighted_sum += numberValue(row.average_session_duration) * sessions;
  group.average_session_duration_weight += sessions;
  if (row.referring_channel) group.referring_channels.add(row.referring_channel);
  if (row.traffic_type) group.traffic_types.add(row.traffic_type);
  if (row.day) group.days.add(row.day);
  LINK_ANALYTICS_RATE_FIELDS.forEach(field => addWeightedMetric(group, row, field));
}

function finalizeLinkAnalyticsGroup(group) {
  group.average_session_duration = group.average_session_duration_weight
    ? group.average_session_duration_weighted_sum / group.average_session_duration_weight
    : 0;
  delete group.average_session_duration_weighted_sum;
  delete group.average_session_duration_weight;
  LINK_ANALYTICS_RATE_FIELDS.forEach(field => finalizeWeightedMetric(group, field));
  group.referring_channel = [...group.referring_channels].filter(Boolean).join(' / ');
  group.traffic_type = [...group.traffic_types].filter(Boolean).join(' / ');
  group.day_count = group.days.size;
  delete group.referring_channels;
  delete group.traffic_types;
  delete group.days;
  return group;
}

function aggregateLinkAnalyticsRows(store, rows) {
  const groups = new Map();
  rows.forEach(row => {
    const landingPath = row.landing_page_path || '/';
    const key = [store.key, row.landing_page_type || '', landingPath].join('|');
    if (!groups.has(key)) {
      groups.set(key, createLinkAnalyticsGroup(store, row));
    }
    addLinkAnalyticsRow(groups.get(key), row);
  });
  return [...groups.values()].map(finalizeLinkAnalyticsGroup);
}

function summarizeLinkAnalyticsTotals(storeResults) {
  const totals = {
    online_store_visitors: 0,
    sessions: 0,
    sessions_that_reached_checkout: 0,
    sessions_that_reached_and_completed_checkout: 0,
    sessions_that_completed_checkout: 0,
    pageviews: 0,
    average_session_duration_weighted_sum: 0,
    average_session_duration_weight: 0
  };
  LINK_ANALYTICS_RATE_FIELDS.forEach(field => {
    totals[`${field}_weighted_sum`] = 0;
    totals[`${field}_weight`] = 0;
  });

  storeResults.forEach(result => {
    const row = result.raw_first_row || {};
    const sessions = numberValue(row.sessions__totals);
    totals.online_store_visitors += numberValue(row.online_store_visitors__totals);
    totals.sessions += sessions;
    totals.sessions_that_reached_checkout += numberValue(row.sessions_that_reached_checkout__totals);
    totals.sessions_that_reached_and_completed_checkout += numberValue(row.sessions_that_reached_and_completed_checkout__totals);
    totals.sessions_that_completed_checkout += numberValue(row.sessions_that_completed_checkout__totals);
    totals.pageviews += numberValue(row.pageviews__totals);
    totals.average_session_duration_weighted_sum += numberValue(row.average_session_duration__totals) * sessions;
    totals.average_session_duration_weight += sessions;
    LINK_ANALYTICS_RATE_FIELDS.forEach(field => {
      totals[`${field}_weighted_sum`] += numberValue(row[`${field}__totals`]) * sessions;
      totals[`${field}_weight`] += sessions;
    });
  });

  totals.average_session_duration = totals.average_session_duration_weight
    ? totals.average_session_duration_weighted_sum / totals.average_session_duration_weight
    : 0;
  delete totals.average_session_duration_weighted_sum;
  delete totals.average_session_duration_weight;
  LINK_ANALYTICS_RATE_FIELDS.forEach(field => finalizeWeightedMetric(totals, field));
  return totals;
}

async function fetchShopifyLinkAnalytics(store, config, options) {
  const token = await getShopifyAccessToken(store.shop, config.clientId, config.clientSecret);
  const since = options.since;
  const until = options.until;
  const limit = Math.max(1, Math.min(Number(options.limit) || 1000, 1000));
  const shopifyql = `
FROM sessions
  SHOW online_store_visitors, sessions, sessions_that_reached_checkout,
    sessions_that_reached_and_completed_checkout, sessions_that_completed_checkout,
    pageviews, bounce_rate, average_session_duration, added_to_cart_rate,
    reached_checkout_rate, completed_checkout_rate, checkout_conversion_rate,
    conversion_rate
  WHERE landing_page_path IS NOT NULL
    AND human_or_bot_session IN ('human', 'bot')
  GROUP BY day, shop_name, landing_page_type, landing_page_path,
    referring_channel, traffic_type WITH TOTALS
  SINCE ${since} UNTIL ${until}
  ORDER BY day ASC
  LIMIT ${limit}
`;
  const rows = await runShopifyQl(store.shop, token, shopifyql);
  const grouped = aggregateLinkAnalyticsRows(store, rows).sort((a, b) => b.sessions - a.sessions);
  const mapped = await Promise.all(grouped.map(async row => ({
    ...row,
    title: await resolveShopifyLandingTitle(store, row.landing_page_path, row.landing_page_type || '')
  })));
  const first = rows[0] || {};
  return {
    generated_at: new Date().toISOString(),
    store: {
      key: store.key,
      label: store.label,
      region: store.region,
      public_domain: store.public_domain || store.shop,
      shop: store.shop
    },
    since,
    until,
    limit,
    raw_rows: rows.length,
    totals: {
      online_store_visitors: numberValue(first.online_store_visitors__totals),
      sessions: numberValue(first.sessions__totals),
      sessions_that_reached_checkout: numberValue(first.sessions_that_reached_checkout__totals),
      sessions_that_reached_and_completed_checkout: numberValue(first.sessions_that_reached_and_completed_checkout__totals),
      sessions_that_completed_checkout: numberValue(first.sessions_that_completed_checkout__totals),
      pageviews: numberValue(first.pageviews__totals),
      bounce_rate: numberValue(first.bounce_rate__totals),
      average_session_duration: numberValue(first.average_session_duration__totals),
      added_to_cart_rate: numberValue(first.added_to_cart_rate__totals),
      reached_checkout_rate: numberValue(first.reached_checkout_rate__totals),
      completed_checkout_rate: numberValue(first.completed_checkout_rate__totals),
      checkout_conversion_rate: numberValue(first.checkout_conversion_rate__totals),
      conversion_rate: numberValue(first.conversion_rate__totals)
    },
    raw_first_row: first,
    rows: mapped
  };
}

async function fetchShopifyLinkAnalyticsPayload(stores, config, options) {
  const storeResults = [];
  for (const store of stores) {
    storeResults.push(await fetchShopifyLinkAnalytics(store, config, options));
  }
  const rows = storeResults.flatMap(result => result.rows);
  return {
    generated_at: new Date().toISOString(),
    since: options.since,
    until: options.until,
    limit: Number(options.limit) || 1000,
    stores: storeResults.map(result => ({
      ...result.store,
      raw_rows: result.raw_rows,
      rows: result.rows.length
    })),
    totals: summarizeLinkAnalyticsTotals(storeResults),
    rows: rows.sort((a, b) => b.sessions - a.sessions)
  };
}

function getShopifyCacheKey(stores) {
  return stores.map(store => store.key).sort().join('+') || 'all';
}

function readShopifyCache() {
  const cache = readJsonFile(SHOPIFY_CACHE_FILE, { version: 1, entries: {} });
  if (!cache || typeof cache !== 'object' || !cache.entries) {
    return { version: 1, entries: {} };
  }
  return cache;
}

function getShopifyCacheEntry(cacheKey) {
  return readShopifyCache().entries[cacheKey] || null;
}

function saveShopifyCacheEntry(cacheKey, payload) {
  const cache = readShopifyCache();
  cache.version = 1;
  cache.entries[cacheKey] = {
    saved_at: new Date().toISOString(),
    payload
  };
  writeJsonFile(SHOPIFY_CACHE_FILE, cache);
}

async function fetchShopifyInventoryPayload(selectedStores, config) {
  const storeResults = [];
  const rawRecords = [];
  for (const store of selectedStores) {
    const result = await fetchShopifyInventoryForStore(store, config.clientId, config.clientSecret);
    storeResults.push({
      store_key: result.store_key,
      store_label: result.store_label,
      store_region: store.region,
      shop: result.shop,
      records: result.records.length,
      page_count: result.page_count
    });
    rawRecords.push(...result.records);
  }
  const records = dedupeShopifyInventory(rawRecords);

  return {
    generated_at: new Date().toISOString(),
    api_version: SHOPIFY_API_VERSION,
    stores: storeResults,
    raw_records: rawRecords.length,
    dedupe_key: 'store + sku, inventory selected by most frequent value',
    summary: summarizeShopifyInventory(records),
    records
  };
}

async function handleShopifyShops(req, res) {
  const config = getShopifyConfig();
  sendJson(res, 200, {
    api_version: SHOPIFY_API_VERSION,
    has_client_id: Boolean(config.clientId),
    has_client_secret: Boolean(config.clientSecret),
    stores: config.stores.map(store => ({
      key: store.key,
      label: store.label,
      region: store.region,
      public_domain: store.public_domain || store.shop,
      shop: store.shop
    }))
  });
}

async function handleShopifyInventory(parsedUrl, res) {
  const config = getShopifyConfig();
  if (!config.clientId || !config.clientSecret) {
    sendJson(res, 500, { error: 'Missing Shopify client_id/client_secret' });
    return;
  }

  const storeParam = parsedUrl.query.store;
  const selectedStores = storeParam
    ? config.stores.filter(store => store.key === storeParam || store.label === storeParam || store.shop === storeParam)
    : config.stores;

  if (!selectedStores.length) {
    sendJson(res, 404, { error: 'No matching Shopify store configured' });
    return;
  }

  const cacheKey = getShopifyCacheKey(selectedStores);
  const shouldRefresh = parsedUrl.query.refresh === '1';
  const cacheEntry = getShopifyCacheEntry(cacheKey);

  if (!shouldRefresh && cacheEntry?.payload) {
    sendJson(res, 200, {
      ...cacheEntry.payload,
      from_cache: true,
      cache_key: cacheKey,
      cached_at: cacheEntry.saved_at
    });
    return;
  }

  try {
    const payload = await fetchShopifyInventoryPayload(selectedStores, config);
    saveShopifyCacheEntry(cacheKey, payload);
    sendJson(res, 200, {
      ...payload,
      from_cache: false,
      cache_key: cacheKey,
      cached_at: new Date().toISOString()
    });
  } catch (e) {
    if (cacheEntry?.payload) {
      sendJson(res, 200, {
        ...cacheEntry.payload,
        from_cache: true,
        cache_key: cacheKey,
        cached_at: cacheEntry.saved_at,
        warning: e.message || 'Refresh failed, returned cached Shopify inventory'
      });
      return;
    }
    sendJson(res, 502, { error: e.message || 'Failed to fetch Shopify inventory' });
  }
}

async function handleShopifyLinkAnalytics(parsedUrl, res) {
  const config = getShopifyLinkAnalyticsConfig();
  if (!config.clientId || !config.clientSecret) {
    sendJson(res, 500, { error: 'Missing Shopify client_id/client_secret' });
    return;
  }

  const storeParam = parsedUrl.query.store || 'ALL';
  const stores = storeParam === 'ALL'
    ? config.stores
    : config.stores.filter(item => item.key === storeParam || item.label === storeParam || item.shop === storeParam);
  if (!stores.length) {
    sendJson(res, 404, { error: 'No matching Shopify store configured' });
    return;
  }

  const since = String(parsedUrl.query.since || '').trim();
  const until = String(parsedUrl.query.until || '').trim();
  if (!isValidDateString(since) || !isValidDateString(until)) {
    sendJson(res, 400, { error: 'since/until must use YYYY-MM-DD format' });
    return;
  }
  if (new Date(`${since}T00:00:00Z`) > new Date(`${until}T00:00:00Z`)) {
    sendJson(res, 400, { error: 'since must be earlier than or equal to until' });
    return;
  }

  try {
    const payload = await fetchShopifyLinkAnalyticsPayload(stores, config, {
      since,
      until,
      limit: parsedUrl.query.limit
    });
    sendJson(res, 200, payload);
  } catch (e) {
    sendJson(res, 502, { error: e.message || 'Failed to fetch Shopify link analytics' });
  }
}

function isValidInventoryItem(item) {
  return item
    && typeof item === 'object'
    && typeof item.category === 'string'
    && typeof item.color === 'string'
    && typeof item.store_sku === 'string'
    && typeof item.region === 'string'
    && item.category.length > 0
    && item.region.length > 0
    && Number.isFinite(item.stock)
    && item.stock >= 0;
}

function normalizeInventoryData(data) {
  if (!Array.isArray(data)) {
    throw new Error('Data must be an array');
  }

  return data.map((item, index) => {
    const stock = Number(item && item.stock);
    const normalized = {
      category: String(item?.category ?? '').trim(),
      color: String(item?.color ?? '').trim(),
      store_sku: String(item?.store_sku ?? '').trim(),
      stock,
      region: String(item?.region ?? '').trim()
    };

    optionalNumericFields.forEach(field => {
      if (item && item[field] !== undefined && item[field] !== null && item[field] !== '') {
        const value = Number(item[field]);
        if (!Number.isFinite(value) || value < 0) {
          throw new Error(`Invalid ${field} at index ${index}`);
        }
        normalized[field] = field === 'days_of_cover' ? Number(value.toFixed(1)) : Number(value.toFixed(2));
      }
    });

    optionalStringFields.forEach(field => {
      if (item && item[field] !== undefined && item[field] !== null) {
        normalized[field] = String(item[field]).trim();
      }
    });

    if (!isValidInventoryItem(normalized)) {
      throw new Error(`Invalid inventory item at index ${index}`);
    }

    normalized.stock = Math.round(normalized.stock);
    return normalized;
  });
}

function normalizeDashboardMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    throw new Error('Meta must be an object');
  }

  const uploadedAt = String(meta.uploaded_at || '').trim();
  const uploadedAtDate = uploadedAt ? new Date(uploadedAt) : new Date();
  if (Number.isNaN(uploadedAtDate.getTime())) {
    throw new Error('Invalid uploaded_at');
  }

  return {
    source_file: String(meta.source_file || '').trim().slice(0, 255),
    inventory_label: String(meta.inventory_label || '').trim().slice(0, 80),
    uploaded_at: uploadedAtDate.toISOString(),
    regions: Array.isArray(meta.regions)
      ? meta.regions.map(region => String(region || '').trim()).filter(Boolean).slice(0, 10)
      : []
  };
}

function normalizeSkuMappingList(payload) {
  const items = Array.isArray(payload) ? payload : payload.items;
  if (!Array.isArray(items)) {
    throw new Error('Mappings must be an array');
  }

  return {
    version: 1,
    updated_at: new Date().toISOString(),
    items: items.map((item, index) => {
      const sku = String(item?.sku || '').trim();
      const kind = String(item?.kind || 'single').trim();
      if (!sku) {
        throw new Error(`Missing sku at index ${index}`);
      }
      if (!['single', 'excluded'].includes(kind)) {
        throw new Error(`Invalid kind at index ${index}`);
      }

      return {
        sku,
        kind,
        category: String(item?.category || '').trim().slice(0, 120),
        note: String(item?.note || '').trim().slice(0, 500),
        updated_at: item?.updated_at || new Date().toISOString()
      };
    })
  };
}

function normalizeAgeRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row, index) => {
    const skuCode = String(row?.sku_code || '').trim();
    if (!skuCode) {
      throw new Error(`Missing sku_code at index ${index}`);
    }
    const qty = Number(row?.qty);
    const age = Number(row?.age);
    if (!Number.isFinite(qty) || qty < 0) {
      throw new Error(`Invalid qty at index ${index}`);
    }
    if (!Number.isFinite(age) || age < 0) {
      throw new Error(`Invalid age at index ${index}`);
    }

    return {
      sku_code: skuCode,
      sku_name: String(row?.sku_name || '').trim(),
      warehouse: String(row?.warehouse || '').trim(),
      warehouse_raw: String(row?.warehouse_raw || row?.warehouse || '').trim(),
      warehouse_region: String(row?.warehouse_region || '').trim(),
      age,
      qty,
      bucket: String(row?.bucket || '').trim()
    };
  });
}

function normalizeAgePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Age data must be an object');
  }

  const current = payload.current || {};
  const previous = payload.previous || null;
  const history = Array.isArray(payload.history) ? payload.history : [];
  const meta = payload.meta || {};

  return {
    version: 1,
    updated_at: new Date().toISOString(),
    current: {
      rows: normalizeAgeRows(current.rows || payload.rows || []),
      date: String(current.date || payload.date || '').trim(),
      column_map: current.column_map || payload.column_map || null,
      meta: {
        file_name: String(meta.file_name || current.meta?.file_name || '').trim().slice(0, 255),
        data_label: String(meta.data_label || current.meta?.data_label || '').trim().slice(0, 80),
        uploaded_at: String(meta.uploaded_at || current.meta?.uploaded_at || new Date().toISOString()).trim(),
        record_count: Number(meta.record_count || current.meta?.record_count || 0),
        total_qty: Number(meta.total_qty || current.meta?.total_qty || 0),
        warehouse_count: Number(meta.warehouse_count || current.meta?.warehouse_count || 0)
      }
    },
    previous: previous ? {
      rows: normalizeAgeRows(previous.rows || []),
      date: String(previous.date || '').trim(),
      column_map: previous.column_map || null,
      meta: previous.meta || null
    } : null,
    history: history.slice(-30)
  };
}

function resolveFrontendPath(pathname) {
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  let decodedPath;

  try {
    decodedPath = decodeURIComponent(requestedPath);
  } catch (e) {
    return null;
  }

  const filePath = path.resolve(FRONTEND_DIR, `.${decodedPath}`);
  const relativePath = path.relative(FRONTEND_DIR, filePath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  return filePath;
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (pathname === '/api/data' && req.method === 'GET') {
    fs.readFile(DATA_FILE, 'utf8', (err, data) => {
      if (err) {
        sendJson(res, 404, { error: 'No data file found' });
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(data);
    });
    return;
  }

  if (pathname === '/api/data' && req.method === 'POST') {
    let body = '';
    let bodyTooLarge = false;

    req.on('data', chunk => {
      if (bodyTooLarge) {
        return;
      }

      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > MAX_BODY_SIZE) {
        bodyTooLarge = true;
        sendJson(res, 413, { error: 'Request body is too large' });
      }
    });

    req.on('end', () => {
      if (bodyTooLarge) {
        return;
      }

      try {
        const data = normalizeInventoryData(JSON.parse(body));
        const dataDir = path.dirname(DATA_FILE);

        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2), 'utf8', (err) => {
          if (err) {
            sendJson(res, 500, { error: 'Failed to save data' });
            return;
          }
          sendJson(res, 200, { success: true, records: data.length });
        });
      } catch (e) {
        sendJson(res, 400, { error: e.message || 'Invalid JSON' });
      }
    });

    req.on('error', () => {
      if (!res.headersSent) {
        sendJson(res, 400, { error: 'Request failed' });
      }
    });

    return;
  }

  if (pathname === '/api/meta' && req.method === 'GET') {
    fs.readFile(META_FILE, 'utf8', (err, data) => {
      if (err) {
        fs.stat(DATA_FILE, (statErr, stats) => {
          sendJson(res, 200, statErr ? {} : {
            source_file: path.basename(DATA_FILE),
            inventory_label: '',
            uploaded_at: stats.mtime.toISOString(),
            regions: []
          });
        });
        return;
      }

      try {
        sendJson(res, 200, JSON.parse(data));
      } catch (e) {
        sendJson(res, 200, {});
      }
    });
    return;
  }

  if (pathname === '/api/meta' && req.method === 'POST') {
    let body = '';
    let bodyTooLarge = false;

    req.on('data', chunk => {
      if (bodyTooLarge) {
        return;
      }

      body += chunk;
      if (Buffer.byteLength(body, 'utf8') > 1024 * 1024) {
        bodyTooLarge = true;
        sendJson(res, 413, { error: 'Request body is too large' });
      }
    });

    req.on('end', () => {
      if (bodyTooLarge) {
        return;
      }

      try {
        const meta = normalizeDashboardMeta(JSON.parse(body || '{}'));
        const dataDir = path.dirname(META_FILE);

        if (!fs.existsSync(dataDir)) {
          fs.mkdirSync(dataDir, { recursive: true });
        }

        fs.writeFile(META_FILE, JSON.stringify(meta, null, 2), 'utf8', (err) => {
          if (err) {
            sendJson(res, 500, { error: 'Failed to save metadata' });
            return;
          }
          sendJson(res, 200, { success: true, meta });
        });
      } catch (e) {
        sendJson(res, 400, { error: e.message || 'Invalid JSON' });
      }
    });

    req.on('error', () => {
      if (!res.headersSent) {
        sendJson(res, 400, { error: 'Request failed' });
      }
    });

    return;
  }

  if (pathname === '/api/shopify/shops' && req.method === 'GET') {
    handleShopifyShops(req, res).catch(e => sendJson(res, 500, { error: e.message || 'Failed to read Shopify config' }));
    return;
  }

  if (pathname === '/api/shopify/inventory' && req.method === 'GET') {
    handleShopifyInventory(parsedUrl, res);
    return;
  }

  if (pathname === '/api/shopify/link-analytics' && req.method === 'GET') {
    handleShopifyLinkAnalytics(parsedUrl, res);
    return;
  }

  if (pathname === '/api/shopify/cache' && req.method === 'GET') {
    const cache = readShopifyCache();
    sendJson(res, 200, {
      entries: Object.keys(cache.entries).map(key => ({
        key,
        saved_at: cache.entries[key].saved_at,
        records: cache.entries[key].payload?.records?.length || 0,
        stores: cache.entries[key].payload?.stores || [],
        summary: cache.entries[key].payload?.summary || {}
      }))
    });
    return;
  }

  if (pathname === '/api/sku-mappings' && req.method === 'GET') {
    sendJson(res, 200, readJsonFile(SKU_MAPPING_FILE, { version: 1, updated_at: null, items: [] }));
    return;
  }

  if (pathname === '/api/sku-mappings' && req.method === 'POST') {
    readRequestJson(req, 1024 * 1024)
      .then(payload => {
        const mappings = normalizeSkuMappingList(payload);
        writeJsonFile(SKU_MAPPING_FILE, mappings);
        sendJson(res, 200, { success: true, count: mappings.items.length, updated_at: mappings.updated_at });
      })
      .catch(e => sendJson(res, e.statusCode || 400, { error: e.message || 'Invalid mappings' }));
    return;
  }

  if (pathname === '/api/age-data' && req.method === 'GET') {
    sendJson(res, 200, readJsonFile(AGE_DATA_FILE, { version: 1, updated_at: null, current: null, previous: null, history: [] }));
    return;
  }

  if (pathname === '/api/age-data' && req.method === 'POST') {
    readRequestJson(req, MAX_BODY_SIZE)
      .then(payload => {
        const ageData = normalizeAgePayload(payload);
        writeJsonFile(AGE_DATA_FILE, ageData);
        sendJson(res, 200, {
          success: true,
          updated_at: ageData.updated_at,
          records: ageData.current.rows.length,
          history: ageData.history.length
        });
      })
      .catch(e => sendJson(res, e.statusCode || 400, { error: e.message || 'Invalid age data' }));
    return;
  }

  const filePath = resolveFrontendPath(pathname);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('File not found');
      } else {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Server error');
      }
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Data file: ${DATA_FILE}`);
  console.log(`Frontend dir: ${FRONTEND_DIR}`);
});
