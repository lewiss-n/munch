# Manji — Reimagined Website

A responsive single-page Manji website built with plain HTML, CSS and vanilla JavaScript, now with a filesystem-backed catalogue admin route.

## Catalogue admin

The site includes an alternate admin page at:

`/admin/`

From there you can add, edit the catalogue section of, and delete catalogue products. New products accept a product image, product name, pack size/format and catalogue section. The server writes uploaded images directly to:

`assets/images/catalogue/`

and appends the new product card to `index.html`. Duplicate **product name + pack size** combinations are rejected automatically.

The management grid on `/admin/` lists the full catalogue with search and section filtering. Each product has an editable section dropdown and a **Save section** action, so products can be moved between Biscuits, Cream Biscuits, Crackers, Cookies, Budget Packs, Breakfast Cereals and Cake without re-uploading the image. Deleting a product removes its card from `index.html` and removes its image from `assets/images/catalogue/` when that image is not referenced by another product.

The admin accepts PNG, JPG and WEBP images up to 10 MB.

## Run locally

The public site can still be viewed as static HTML, but **filesystem uploads require the included Node server**.

No npm dependencies are required. With Node.js 18 or newer:

```bash
node server.js
```

Then visit:

- Public website: `http://localhost:8080/`
- Catalogue admin: `http://localhost:8080/admin/`

You can also run:

```bash
npm start
```

## Protect the admin route

Before exposing the server publicly, set an admin password. The server uses HTTP Basic authentication for `/admin/` and `/api/admin/*` when `ADMIN_PASSWORD` is set.

macOS / Linux:

```bash
ADMIN_PASSWORD='choose-a-strong-password' node server.js
```

Optionally set the username too:

```bash
ADMIN_USER='catalogue' ADMIN_PASSWORD='choose-a-strong-password' node server.js
```

PowerShell:

```powershell
$env:ADMIN_PASSWORD='choose-a-strong-password'
node server.js
```

If `ADMIN_PASSWORD` is not set, the admin route remains open and the admin page shows a warning.

## Deployment note

Because uploads are written directly to the project filesystem, deploy this version on a server/container with a **writable, persistent disk**. Read-only or ephemeral serverless hosting will not preserve catalogue uploads.

## Existing catalogue

- 73 unique catalogue cards at the time this admin route was added
- Sections: Biscuits, Cream Biscuits, Crackers, Cookies, Budget Packs, Breakfast Cereals and Cake
- Product lottery continues to use all catalogue cards on each public-page load

## Catalogue sections

Catalogue sections are stored in `catalogue-sections.json`. In the admin panel, use **Catalogue sections → Create section** to add a new section. The server adds it to the public catalogue filters automatically, and it becomes available in both the new-product form and every existing product editor.
