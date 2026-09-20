'use strict';

const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const INDEX_FILE = path.join(ROOT, 'index.html');
const CATALOGUE_DIR = path.join(ROOT, 'assets', 'images', 'catalogue');
const CATALOGUE_SECTIONS_FILE = path.join(ROOT, 'catalogue-sections.json');
const ADMIN_DIR = path.join(ROOT, 'admin');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = 'password123';
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const DEFAULT_CATALOGUE_SECTIONS = [
  { id: 'biscuits', label: 'Biscuits' },
  { id: 'cream-biscuits', label: 'Cream Biscuits' },
  { id: 'crackers', label: 'Crackers' },
  { id: 'cookies', label: 'Cookies' },
  { id: 'budget-packs', label: 'Budget Packs' },
  { id: 'breakfast-cereals', label: 'Breakfast Cereals' },
  { id: 'cake', label: 'Cake' }
];

const DEFAULT_CATEGORY_LABELS = Object.fromEntries(
  DEFAULT_CATALOGUE_SECTIONS.map((section) => [section.id, section.label.toUpperCase()])
);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

let catalogueWriteQueue = Promise.resolve();

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function decodeHtml(value) {
  return String(value)
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

function normalizeKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('en');
}

function slugify(value) {
  const slug = String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90);
  return slug || `product-${Date.now()}`;
}

function catalogueProductId(product) {
  const source = `${normalizeKey(product.name)}\0${normalizeKey(product.pack)}\0${String(product.image || '').trim()}`;
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 20);
}

function sanitizeCatalogueSections(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value.flatMap((section) => {
    const id = String(section?.id || '').trim();
    const label = String(section?.label || '').trim().replace(/\s+/g, ' ');
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !label || label.length > 50 || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label }];
  });
}

async function readCatalogueSections() {
  try {
    const stored = JSON.parse(await fsp.readFile(CATALOGUE_SECTIONS_FILE, 'utf8'));
    const sections = sanitizeCatalogueSections(stored);
    return sections.length ? sections : DEFAULT_CATALOGUE_SECTIONS.map((section) => ({ ...section }));
  } catch (error) {
    if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) console.error('Could not read catalogue sections:', error);
    return DEFAULT_CATALOGUE_SECTIONS.map((section) => ({ ...section }));
  }
}

async function writeCatalogueSections(sections) {
  const safeSections = sanitizeCatalogueSections(sections);
  if (!safeSections.length) throw new Error('Catalogue sections cannot be empty.');
  const tempPath = `${CATALOGUE_SECTIONS_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tempPath, `${JSON.stringify(safeSections, null, 2)}
`, 'utf8');
  await fsp.rename(tempPath, CATALOGUE_SECTIONS_FILE);
}

function catalogueSectionById(sections, id) {
  return sections.find((section) => section.id === id) || null;
}

function renderCatalogueFilterMarkup(sections) {
  const buttons = sections.map((section, index) => {
    const active = index === 0;
    return `<button aria-pressed="${active}" class="catalogue-filter${active ? ' is-active' : ''}" data-filter="${escapeHtml(section.id)}" data-label="${escapeHtml(section.label)}" type="button">${escapeHtml(section.label.toUpperCase())}</button>`;
  }).join('');
  return `<div aria-label="Filter product catalogue" class="catalogue-filters reveal">${buttons}</div>`;
}

function syncCatalogueSectionFilters(html, sections) {
  const filterRegex = /<div aria-label="Filter product catalogue" class="catalogue-filters reveal">[\s\S]*?<\/div>/;
  if (!filterRegex.test(html)) throw new Error('Could not locate catalogue filters in index.html.');
  return html.replace(filterRegex, renderCatalogueFilterMarkup(sections));
}

async function addCatalogueSection(fields) {
  const label = String(fields.name || fields.label || '').trim().replace(/\s+/g, ' ');
  if (!label || label.length > 50) {
    throw Object.assign(new Error('Enter a catalogue section name up to 50 characters.'), { statusCode: 400 });
  }

  const id = slugify(label);
  const sections = await readCatalogueSections();
  const duplicate = sections.find((section) => section.id === id || normalizeKey(section.label) === normalizeKey(label));
  if (duplicate) {
    throw Object.assign(new Error(`${duplicate.label} already exists as a catalogue section.`), { statusCode: 409, duplicate });
  }

  const section = { id, label };
  const nextSections = [...sections, section];
  const html = await fsp.readFile(INDEX_FILE, 'utf8');
  const updatedHtml = syncCatalogueSectionFilters(html, nextSections);
  const tempIndexPath = `${INDEX_FILE}.${process.pid}.${Date.now()}.tmp`;

  await fsp.writeFile(tempIndexPath, updatedHtml, 'utf8');
  try {
    await writeCatalogueSections(nextSections);
    await fsp.rename(tempIndexPath, INDEX_FILE);
  } catch (error) {
    await fsp.rm(tempIndexPath, { force: true });
    throw error;
  }

  return { section, sections: nextSections };
}

function parseCatalogue(html) {
  const products = [];
  const cardRegex = /<article class="product-card[^\"]*" data-category="([^\"]+)">([\s\S]*?)<\/article>/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const category = match[1];
    const body = match[2];
    const nameMatch = body.match(/<h3>([\s\S]*?)<\/h3>/i);
    const infoMatch = body.match(/<div class="product-info">[\s\S]*?<h3>[\s\S]*?<\/h3>\s*<span>([\s\S]*?)<\/span>/i);
    const imageMatch = body.match(/<img[^>]*src="([^"]+)"[^>]*>/i);
    const categoryMatch = body.match(/<span class="product-category">([\s\S]*?)<\/span>/i);
    if (!nameMatch) continue;

    const strip = (text) => decodeHtml(String(text || '').replace(/<[^>]+>/g, '').trim());
    const product = {
      name: strip(nameMatch[1]),
      pack: strip(infoMatch?.[1] || ''),
      category,
      categoryLabel: strip(categoryMatch?.[1] || DEFAULT_CATEGORY_LABELS[category] || category),
      image: imageMatch?.[1] || ''
    };
    product.id = catalogueProductId(product);
    products.push(product);
  }

  return products;
}

function safeTimingEqual(a, b) {
  const aBuffer = Buffer.from(String(a));
  const bBuffer = Buffer.from(String(b));
  if (aBuffer.length !== bBuffer.length) return false;
  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

// Replace the auth helper with a length-safe implementation.
function adminAuthorized(req, res) {
  if (!ADMIN_PASSWORD) return true;
  const header = req.headers.authorization || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
      const separator = decoded.indexOf(':');
      const user = separator >= 0 ? decoded.slice(0, separator) : decoded;
      const password = separator >= 0 ? decoded.slice(separator + 1) : '';
      if (safeTimingEqual(user, ADMIN_USER) && safeTimingEqual(password, ADMIN_PASSWORD)) return true;
    } catch (_) {
      // Fall through.
    }
  }
  res.writeHead(401, {
    'WWW-Authenticate': 'Basic realm="Manji Catalogue Admin", charset="UTF-8"',
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end('Admin authentication required.');
  return false;
}

function parseMultipart(req) {
  return new Promise((resolve, reject) => {
    const contentType = req.headers['content-type'] || '';
    const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
    if (!boundaryMatch) {
      reject(Object.assign(new Error('Expected multipart/form-data.'), { statusCode: 400 }));
      return;
    }

    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const chunks = [];
    let total = 0;

    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_UPLOAD_BYTES) {
        reject(Object.assign(new Error('Upload is too large. Maximum request size is 12 MB.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      try {
        const body = Buffer.concat(chunks);
        const delimiter = Buffer.from(`--${boundary}`);
        const closing = Buffer.from(`--${boundary}--`);
        const fields = {};
        const files = {};
        let cursor = body.indexOf(delimiter);

        while (cursor !== -1 && cursor < body.length) {
          cursor += delimiter.length;
          if (body.subarray(cursor, cursor + 2).equals(Buffer.from('--'))) break;
          if (body.subarray(cursor, cursor + 2).equals(Buffer.from('\r\n'))) cursor += 2;

          const headerEnd = body.indexOf(Buffer.from('\r\n\r\n'), cursor);
          if (headerEnd === -1) break;
          const headerText = body.subarray(cursor, headerEnd).toString('utf8');
          const contentStart = headerEnd + 4;
          const nextMarker = body.indexOf(Buffer.from(`\r\n--${boundary}`), contentStart);
          if (nextMarker === -1) break;
          const content = body.subarray(contentStart, nextMarker);

          const disposition = headerText.match(/content-disposition:\s*form-data;\s*name="([^"]+)"(?:;\s*filename="([^"]*)")?/i);
          if (disposition) {
            const fieldName = disposition[1];
            const fileName = disposition[2];
            if (fileName !== undefined) {
              const typeMatch = headerText.match(/content-type:\s*([^\r\n]+)/i);
              files[fieldName] = {
                filename: path.basename(fileName),
                contentType: (typeMatch?.[1] || 'application/octet-stream').trim().toLowerCase(),
                data: Buffer.from(content)
              };
            } else {
              fields[fieldName] = content.toString('utf8').trim();
            }
          }

          cursor = nextMarker + 2;
          if (body.subarray(cursor, cursor + closing.length).equals(closing)) break;
          cursor = body.indexOf(delimiter, cursor);
        }

        resolve({ fields, files });
      } catch (error) {
        reject(error);
      }
    });

    req.on('error', reject);
  });
}


function parseJsonBody(req, maxBytes = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(Object.assign(new Error('Request body is too large.'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8').trim();
        resolve(raw ? JSON.parse(raw) : {});
      } catch (_) {
        reject(Object.assign(new Error('Expected a valid JSON request body.'), { statusCode: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function detectImageExtension(file) {
  const mimeMap = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/webp': '.webp'
  };
  if (mimeMap[file.contentType]) return mimeMap[file.contentType];

  const ext = path.extname(file.filename || '').toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp'].includes(ext)) return ext === '.jpeg' ? '.jpg' : ext;
  return null;
}

async function uniqueImageFilename(base, ext) {
  let candidate = `${base}${ext}`;
  let counter = 2;
  while (true) {
    try {
      await fsp.access(path.join(CATALOGUE_DIR, candidate));
      candidate = `${base}-${counter}${ext}`;
      counter += 1;
    } catch (_) {
      return candidate;
    }
  }
}

function buildProductCard({ name, pack, category, categoryLabel, imagePath }) {
  const displayCategoryLabel = categoryLabel || category.toUpperCase();
  const alt = `Manji ${name}${pack ? ` ${pack}` : ''} product pack`;
  return `\n<article class="product-card reveal" data-category="${escapeHtml(category)}">\n<div class="product-media">\n<span class="product-category">${escapeHtml(displayCategoryLabel.toUpperCase())}</span>\n<img alt="${escapeHtml(alt)}" decoding="async" loading="lazy" src="${escapeHtml(imagePath)}"/>\n</div>\n<div class="product-info">\n<h3>${escapeHtml(name.toUpperCase())}</h3>\n<span>${escapeHtml((pack || 'NEW').toUpperCase())}</span>\n</div>\n</article>`;
}

function updateCatalogueCounts(html, count) {
  let updated = html.replace(/<span><b>\d+<\/b> packs in play<\/span>/, `<span><b>${count}</b> packs in play</span>`);
  updated = updated.replace(/<p class="catalogue-count"><strong>\d+<\/strong><span>packs in catalogue<\/span><\/p>/, `<p class="catalogue-count"><strong>${count}</strong><span>packs in catalogue</span></p>`);
  return updated;
}

function injectProductCard(html, cardHtml, nextCount) {
  const emptyMarker = '<p class="catalogue-empty"';
  const markerIndex = html.indexOf(emptyMarker);
  if (markerIndex === -1) throw new Error('Could not locate the catalogue insertion point in index.html.');

  const gridCloseIndex = html.lastIndexOf('</div>', markerIndex);
  if (gridCloseIndex === -1) throw new Error('Could not locate the product grid closing tag in index.html.');

  const updated = `${html.slice(0, gridCloseIndex)}${cardHtml}\n${html.slice(gridCloseIndex)}`;
  return updateCatalogueCounts(updated, nextCount);
}

function removeProductCard(html, productId) {
  const cardRegex = /<article class="product-card[^\"]*" data-category="([^\"]+)">[\s\S]*?<\/article>/g;
  let match;
  while ((match = cardRegex.exec(html)) !== null) {
    const parsed = parseCatalogue(match[0])[0];
    if (parsed && catalogueProductId(parsed) === productId) {
      return {
        html: `${html.slice(0, match.index)}${html.slice(cardRegex.lastIndex)}`,
        product: parsed
      };
    }
  }
  return null;
}

async function updateCatalogueProduct(fields, files = {}) {
  const id = String(fields.id || '').trim();
  if (!/^[a-f0-9]{20}$/.test(id)) {
    throw Object.assign(new Error('Choose a valid catalogue product to edit.'), { statusCode: 400 });
  }

  const html = await fsp.readFile(INDEX_FILE, 'utf8');
  const products = parseCatalogue(html);
  const cardRegex = /<article class="product-card[^\"]*" data-category="([^\"]+)">[\s\S]*?<\/article>/g;
  let match;

  while ((match = cardRegex.exec(html)) !== null) {
    const product = parseCatalogue(match[0])[0];
    if (!product || catalogueProductId(product) !== id) continue;

    const name = fields.name === undefined
      ? product.name
      : String(fields.name || '').trim().replace(/\s+/g, ' ');
    const pack = fields.pack === undefined
      ? product.pack
      : String(fields.pack || '').trim().replace(/\s+/g, ' ');
    const category = fields.category === undefined
      ? product.category
      : String(fields.category || '').trim();
    const image = files.image;

    if (!name || name.length > 80) throw Object.assign(new Error('Enter a product name up to 80 characters.'), { statusCode: 400 });
    if (pack.length > 60) throw Object.assign(new Error('Pack size must be 60 characters or fewer.'), { statusCode: 400 });
    const sections = await readCatalogueSections();
    const selectedSection = catalogueSectionById(sections, category);
    if (!selectedSection) throw Object.assign(new Error('Choose a valid catalogue section.'), { statusCode: 400 });

    const displayPack = pack || 'NEW';
    const duplicate = products.find((candidate) =>
      candidate.id !== id &&
      normalizeKey(candidate.name) === normalizeKey(name) &&
      normalizeKey(candidate.pack) === normalizeKey(displayPack)
    );
    if (duplicate) {
      throw Object.assign(new Error(`${duplicate.name}${duplicate.pack ? ` (${duplicate.pack})` : ''} is already in the catalogue.`), {
        statusCode: 409,
        duplicate
      });
    }

    let imagePath = product.image;
    let absoluteImagePath = null;
    if (image && image.data?.length) {
      if (image.data.length > 10 * 1024 * 1024) throw Object.assign(new Error('Image must be 10 MB or smaller.'), { statusCode: 413 });
      const ext = detectImageExtension(image);
      if (!ext) throw Object.assign(new Error('Use a PNG, JPG, or WEBP image.'), { statusCode: 415 });

      await fsp.mkdir(CATALOGUE_DIR, { recursive: true });
      const baseSlug = slugify(`${name}-${displayPack}`);
      const imageFilename = await uniqueImageFilename(baseSlug, ext);
      absoluteImagePath = path.join(CATALOGUE_DIR, imageFilename);
      imagePath = `assets/images/catalogue/${imageFilename}`;
      await fsp.writeFile(absoluteImagePath, image.data, { flag: 'wx' });
    }

    const displayName = name.toUpperCase();
    const displayPackUpper = displayPack.toUpperCase();
    const nameChanged = displayName !== product.name;
    const packChanged = displayPackUpper !== product.pack;
    const categoryChanged = category !== product.category;
    const imageChanged = imagePath !== product.image;
    const altName = /^manji\b/i.test(name) ? name : `Manji ${name}`;
    const alt = `${altName}${displayPack ? ` ${displayPack}` : ''} product pack`;
    let updatedCard = match[0];

    if (categoryChanged) {
      updatedCard = updatedCard
        .replace(/data-category="[^"]+"/, `data-category="${escapeHtml(category)}"`)
        .replace(/<span class="product-category">[\s\S]*?<\/span>/i, `<span class="product-category">${escapeHtml(selectedSection.label.toUpperCase())}</span>`);
    }
    if (nameChanged) updatedCard = updatedCard.replace(/<h3>[\s\S]*?<\/h3>/i, `<h3>${escapeHtml(displayName)}</h3>`);
    if (packChanged) {
      updatedCard = updatedCard.replace(/(<div class="product-info">[\s\S]*?<h3>[\s\S]*?<\/h3>\s*<span>)[\s\S]*?(<\/span>)/i, `$1${escapeHtml(displayPackUpper)}$2`);
    }

    if (imageChanged || nameChanged || packChanged) {
      updatedCard = updatedCard.replace(/<img\b[^>]*>/i, (imgTag) => {
        let nextTag = imgTag;
        if (imageChanged) {
          if (/\bsrc="[^"]*"/i.test(nextTag)) nextTag = nextTag.replace(/\bsrc="[^"]*"/i, `src="${escapeHtml(imagePath)}"`);
          else nextTag = nextTag.replace(/^<img\b/i, `<img src="${escapeHtml(imagePath)}"`);
        }
        if (nameChanged || packChanged) {
          if (/\balt="[^"]*"/i.test(nextTag)) nextTag = nextTag.replace(/\balt="[^"]*"/i, `alt="${escapeHtml(alt)}"`);
          else nextTag = nextTag.replace(/^<img\b/i, `<img alt="${escapeHtml(alt)}"`);
        }
        return nextTag;
      });
    }

    const updatedHtml = `${html.slice(0, match.index)}${updatedCard}${html.slice(cardRegex.lastIndex)}`;
    const tempIndexPath = `${INDEX_FILE}.${process.pid}.${Date.now()}.tmp`;

    try {
      await fsp.writeFile(tempIndexPath, updatedHtml, 'utf8');
      await fsp.rename(tempIndexPath, INDEX_FILE);
    } catch (error) {
      if (absoluteImagePath) await fsp.rm(absoluteImagePath, { force: true });
      await fsp.rm(tempIndexPath, { force: true });
      throw error;
    }

    let imageDeleted = false;
    let imageWarning = '';
    if (absoluteImagePath && imagePath !== product.image) {
      const updatedProducts = parseCatalogue(updatedHtml);
      const oldImageStillUsed = updatedProducts.some((candidate) => candidate.image === product.image);
      const oldImagePath = String(product.image || '').replace(/^\/+/, '');
      if (!oldImageStillUsed && oldImagePath.startsWith('assets/images/catalogue/')) {
        const oldAbsoluteImagePath = path.resolve(ROOT, oldImagePath);
        const catalogueRoot = path.resolve(CATALOGUE_DIR) + path.sep;
        if (oldAbsoluteImagePath.startsWith(catalogueRoot)) {
          try {
            await fsp.rm(oldAbsoluteImagePath, { force: true });
            imageDeleted = true;
          } catch (error) {
            console.error('Could not remove replaced catalogue image:', error);
            imageWarning = 'The product was updated, but its previous image file could not be deleted.';
          }
        }
      }
    }

    const updatedProduct = parseCatalogue(updatedCard)[0];
    return {
      ...updatedProduct,
      imageDeleted,
      imageWarning
    };
  }

  throw Object.assign(new Error('That catalogue product no longer exists.'), { statusCode: 404 });
}

async function deleteCatalogueProduct(productId) {
  const id = String(productId || '').trim();
  if (!/^[a-f0-9]{20}$/.test(id)) {
    throw Object.assign(new Error('Choose a valid catalogue product to delete.'), { statusCode: 400 });
  }

  const html = await fsp.readFile(INDEX_FILE, 'utf8');
  const removal = removeProductCard(html, id);
  if (!removal) throw Object.assign(new Error('That catalogue product no longer exists.'), { statusCode: 404 });

  const remainingProducts = parseCatalogue(removal.html);
  const updatedHtml = updateCatalogueCounts(removal.html, remainingProducts.length);
  const tempIndexPath = `${INDEX_FILE}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tempIndexPath, updatedHtml, 'utf8');
  await fsp.rename(tempIndexPath, INDEX_FILE);

  let imageDeleted = false;
  let imageWarning = '';
  const imagePath = String(removal.product.image || '').replace(/^\/+/, '');
  const imageStillUsed = remainingProducts.some((product) => product.image === removal.product.image);
  if (!imageStillUsed && imagePath.startsWith('assets/images/catalogue/')) {
    const absoluteImagePath = path.resolve(ROOT, imagePath);
    const catalogueRoot = path.resolve(CATALOGUE_DIR) + path.sep;
    if (absoluteImagePath.startsWith(catalogueRoot)) {
      try {
        await fsp.rm(absoluteImagePath, { force: true });
        imageDeleted = true;
      } catch (error) {
        console.error('Could not remove catalogue image:', error);
        imageWarning = 'The product was removed, but its image file could not be deleted.';
      }
    }
  }

  return {
    ...removal.product,
    total: remainingProducts.length,
    imageDeleted,
    imageWarning
  };
}

async function addCatalogueProduct(fields, files) {
  const name = String(fields.name || '').trim().replace(/\s+/g, ' ');
  const pack = String(fields.pack || '').trim().replace(/\s+/g, ' ');
  const category = String(fields.category || '').trim();
  const image = files.image;

  if (!name || name.length > 80) throw Object.assign(new Error('Enter a product name up to 80 characters.'), { statusCode: 400 });
  if (pack.length > 60) throw Object.assign(new Error('Pack size must be 60 characters or fewer.'), { statusCode: 400 });
  const sections = await readCatalogueSections();
  const selectedSection = catalogueSectionById(sections, category);
  if (!selectedSection) throw Object.assign(new Error('Choose a valid catalogue section.'), { statusCode: 400 });
  if (!image || !image.data?.length) throw Object.assign(new Error('Choose a product image to upload.'), { statusCode: 400 });
  if (image.data.length > 10 * 1024 * 1024) throw Object.assign(new Error('Image must be 10 MB or smaller.'), { statusCode: 413 });

  const ext = detectImageExtension(image);
  if (!ext) throw Object.assign(new Error('Use a PNG, JPG, or WEBP image.'), { statusCode: 415 });

  await fsp.mkdir(CATALOGUE_DIR, { recursive: true });
  const html = await fsp.readFile(INDEX_FILE, 'utf8');
  const products = parseCatalogue(html);
  const duplicate = products.find((product) =>
    normalizeKey(product.name) === normalizeKey(name) && normalizeKey(product.pack) === normalizeKey(pack || 'NEW')
  );
  if (duplicate) {
    throw Object.assign(new Error(`${duplicate.name}${duplicate.pack ? ` (${duplicate.pack})` : ''} is already in the catalogue.`), {
      statusCode: 409,
      duplicate
    });
  }

  const baseSlug = slugify(`${name}-${pack || 'new'}`);
  const imageFilename = await uniqueImageFilename(baseSlug, ext);
  const absoluteImagePath = path.join(CATALOGUE_DIR, imageFilename);
  const publicImagePath = `assets/images/catalogue/${imageFilename}`;
  const nextCount = products.length + 1;
  const cardHtml = buildProductCard({ name, pack, category, categoryLabel: selectedSection.label, imagePath: publicImagePath });
  const updatedHtml = injectProductCard(html, cardHtml, nextCount);
  const tempIndexPath = `${INDEX_FILE}.${process.pid}.${Date.now()}.tmp`;

  await fsp.writeFile(absoluteImagePath, image.data, { flag: 'wx' });
  try {
    await fsp.writeFile(tempIndexPath, updatedHtml, 'utf8');
    await fsp.rename(tempIndexPath, INDEX_FILE);
  } catch (error) {
    await fsp.rm(absoluteImagePath, { force: true });
    await fsp.rm(tempIndexPath, { force: true });
    throw error;
  }

  return {
    name: name.toUpperCase(),
    pack: (pack || 'NEW').toUpperCase(),
    category,
    categoryLabel: selectedSection.label.toUpperCase(),
    image: publicImagePath,
    total: nextCount
  };
}

async function serveFile(res, filePath, { noStore = false } = {}) {
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) throw Object.assign(new Error('Not found'), { code: 'ENOENT' });
    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
      'X-Content-Type-Options': 'nosniff'
    };
    if (noStore || ext === '.html') headers['Cache-Control'] = 'no-cache';
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error');
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    if (pathname === '/admin') {
      if (!adminAuthorized(req, res)) return;
      res.writeHead(302, { Location: '/admin/' });
      res.end();
      return;
    }

    if (pathname === '/admin/' || pathname.startsWith('/admin/')) {
      if (!adminAuthorized(req, res)) return;
      const adminRelative = pathname === '/admin/' ? 'index.html' : pathname.slice('/admin/'.length);
      const filePath = path.resolve(ADMIN_DIR, adminRelative);
      if (!filePath.startsWith(path.resolve(ADMIN_DIR) + path.sep) && filePath !== path.join(ADMIN_DIR, 'index.html')) {
        res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Forbidden');
        return;
      }
      await serveFile(res, filePath, { noStore: true });
      return;
    }

    if (pathname === '/api/admin/sections' && req.method === 'POST') {
      if (!adminAuthorized(req, res)) return;
      let body;
      try {
        body = await parseJsonBody(req);
      } catch (error) {
        sendJson(res, error.statusCode || 400, { ok: false, error: error.message });
        return;
      }

      const operation = catalogueWriteQueue.then(() => addCatalogueSection(body));
      catalogueWriteQueue = operation.catch(() => undefined);

      try {
        const result = await operation;
        sendJson(res, 201, { ok: true, ...result });
      } catch (error) {
        console.error('Catalogue section create error:', error);
        sendJson(res, error.statusCode || 500, {
          ok: false,
          error: error.message || 'Could not create the catalogue section.'
        });
      }
      return;
    }

    if (pathname === '/api/admin/products' && req.method === 'GET') {
      if (!adminAuthorized(req, res)) return;
      const html = await fsp.readFile(INDEX_FILE, 'utf8');
      const products = parseCatalogue(html);
      const sections = await readCatalogueSections();
      sendJson(res, 200, {
        products,
        sections,
        total: products.length,
        authEnabled: Boolean(ADMIN_PASSWORD),
        uploadDirectory: 'assets/images/catalogue/'
      });
      return;
    }

    if (pathname === '/api/admin/products' && req.method === 'POST') {
      if (!adminAuthorized(req, res)) return;
      let multipart;
      try {
        multipart = await parseMultipart(req);
      } catch (error) {
        sendJson(res, error.statusCode || 400, { ok: false, error: error.message });
        return;
      }

      const operation = catalogueWriteQueue.then(() => addCatalogueProduct(multipart.fields, multipart.files));
      catalogueWriteQueue = operation.catch(() => undefined);

      try {
        const product = await operation;
        sendJson(res, 201, { ok: true, product });
      } catch (error) {
        console.error('Catalogue upload error:', error);
        sendJson(res, error.statusCode || 500, {
          ok: false,
          error: error.message || 'Could not save the product.',
          duplicate: error.duplicate || null
        });
      }
      return;
    }

    if (pathname === '/api/admin/products' && req.method === 'PATCH') {
      if (!adminAuthorized(req, res)) return;
      let fields;
      let files = {};
      try {
        const contentType = req.headers['content-type'] || '';
        if (contentType.toLowerCase().startsWith('multipart/form-data')) {
          const multipart = await parseMultipart(req);
          fields = multipart.fields;
          files = multipart.files;
        } else {
          fields = await parseJsonBody(req);
        }
      } catch (error) {
        sendJson(res, error.statusCode || 400, { ok: false, error: error.message });
        return;
      }

      const operation = catalogueWriteQueue.then(() => updateCatalogueProduct(fields, files));
      catalogueWriteQueue = operation.catch(() => undefined);

      try {
        const product = await operation;
        sendJson(res, 200, { ok: true, product });
      } catch (error) {
        console.error('Catalogue edit error:', error);
        sendJson(res, error.statusCode || 500, {
          ok: false,
          error: error.message || 'Could not update the product.',
          duplicate: error.duplicate || null
        });
      }
      return;
    }

    if (pathname === '/api/admin/products' && req.method === 'DELETE') {
      if (!adminAuthorized(req, res)) return;
      let body;
      try {
        body = await parseJsonBody(req);
      } catch (error) {
        sendJson(res, error.statusCode || 400, { ok: false, error: error.message });
        return;
      }

      const operation = catalogueWriteQueue.then(() => deleteCatalogueProduct(body.id));
      catalogueWriteQueue = operation.catch(() => undefined);

      try {
        const product = await operation;
        sendJson(res, 200, { ok: true, product });
      } catch (error) {
        console.error('Catalogue delete error:', error);
        sendJson(res, error.statusCode || 500, {
          ok: false,
          error: error.message || 'Could not delete the product.'
        });
      }
      return;
    }

    if (pathname.startsWith('/api/')) {
      sendJson(res, 404, { ok: false, error: 'Not found.' });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Method not allowed');
      return;
    }

    const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const resolved = path.resolve(ROOT, relativePath);
    if (!resolved.startsWith(path.resolve(ROOT) + path.sep) && resolved !== INDEX_FILE) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    let target = resolved;
    try {
      const stat = await fsp.stat(target);
      if (stat.isDirectory()) target = path.join(target, 'index.html');
    } catch (_) {
      // serveFile will return 404.
    }
    await serveFile(res, target);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'Internal server error.' });
    else res.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Manji site running at http://localhost:${PORT}`);
  console.log(`Admin route: http://localhost:${PORT}/admin/`);
  if (!ADMIN_PASSWORD) {
    console.warn('WARNING: ADMIN_PASSWORD is not set. The admin route is currently unprotected.');
  }
});
