# Resell Profit

A simple, offline Windows desktop app for resellers. Record what you buy, mark items as sold, and see your profit at a glance.

- **Fully offline.** No accounts, no sign-ups, no internet connection. Your data never leaves your computer.
- **Portable.** One `.exe` file. Nothing to install.
- **Built for UK resellers.** All amounts are in GBP (£).

---

## Features

### Purchases
- Record the item name, description, order number, email used, quantity, price per item, order postage and purchase date.
- Only **name, purchase date and price** are required. Everything else is optional.
- **Remembers your emails.** Emails you've used before are suggested as you type, which helps if you use several.
- **Multi-quantity orders.** Buy 3 on one order and the app creates 3 separate items with the same order number, labelled "1 of 3", "2 of 3" and so on. The order postage is split evenly between them, down to the penny.
- **Duplicate button.** Bought the same item again on a different order? Duplicate it instead of typing everything again.

### Sales & profit
- Mark an item as sold with its sale price, sale postage, selling fees and sale date.
- Profit is worked out for you:
  `profit = sale price − sale postage − selling fees − (purchase price + share of purchase postage)`
- Each item has a profit breakdown, including **ROI** (profit ÷ total purchase cost).
- Losses are shown in red.

### Item list
- Columns: Item, Order Number, Email, Purchase Date, Purchase Price (including postage share), Sold Date, Sold Price, Profit.
- Filter by **All / Unsold / Sold**.
- **Search** by item name, description, order number or email. This is handy for finding an order when handling a return.

### Dashboard
- Stat tiles: **Total profit**, **This month**, **This year**, **ROI**, **Items sold**, **Average profit per item** and **Unsold stock value**.
- **Monthly profit chart** with a year switcher and a Chart/Table toggle.
- Profit counts towards the month an item was **sold**, not bought.

---

## Getting started (users)

1. Download `Resell Profit.exe` from the [Releases](../../releases) page.
2. Double-click to run it. No installation needed.

> **Windows SmartScreen warning:** The app isn't code-signed (signing costs money), so Windows may show *"Windows protected your PC"*. Click **More info → Run anyway**.

### Where is my data stored?

Everything is saved in one file:

```
C:\Users\<your name>\AppData\Roaming\Resell Profit\data.json
```

- **Back it up** by copying this file somewhere safe.
- **Move to a new PC** by copying it to the same location there.
- The app keeps a backup of the previous save (`data.json.bak`). If the main file ever gets damaged, the app keeps a copy of it and loads the backup instead.

---

## Technical overview

| | |
|---|---|
| **Framework** | [Electron](https://www.electronjs.org/) 44.7.0 |
| **Language** | Plain HTML, CSS and JavaScript. No frameworks or UI libraries. |
| **Packaging** | [electron-builder](https://www.electron.build/) 26.17.0 (Windows portable `.exe`) |
| **Storage** | A single local JSON file |
| **Runtime dependencies** | None |

### Project structure

```
profit-tracker/
├── main.js          # Electron main process: creates the window, loads/saves the data file
├── preload.js       # Secure bridge exposing only load() and save() to the page
├── src/
│   ├── index.html   # App layout (dashboard, item list, forms)
│   ├── styles.css   # Dark purple theme
│   └── renderer.js  # All app logic: items, sales, profit, dashboard, chart
├── build/
│   └── icon.png     # App icon
└── package.json     # Scripts and build settings
```

### How it works

- **Money is stored in pence** (whole numbers), so totals never pick up rounding errors. For example, £12.99 is stored as `1299`.
- **Safe saving.** Each save is written to a temporary file first, then swapped in, so a crash or power cut mid-save can't corrupt your data. The previous version is kept as `data.json.bak`.
- **Data format.** `data.json` looks like this:
  ```json
  {
    "version": 1,
    "items": [
      {
        "id": "…",
        "name": "Nike Dunk Low Panda",
        "description": "UK 9",
        "orderNumber": "123-456",
        "email": "me@example.com",
        "purchaseDate": "2026-10-01",
        "purchasePrice": 8000,
        "purchasePostage": 450,
        "group": { "id": "…", "index": 1, "size": 2 },
        "sale": { "price": 12000, "postage": 0, "fees": 1200, "date": "2026-10-15" },
        "createdAt": 1760000000000
      }
    ]
  }
  ```
  `group` is `null` for single items, and `sale` is `null` until the item is sold.
- **The chart** is hand-drawn SVG. There is no charting library.

### Security

- The app makes **no network connections**. Navigating away from the app and opening new windows are both blocked.
- The page runs with `contextIsolation`, `sandbox` turned on and `nodeIntegration` turned off. Through `preload.js`, it can only load and save its own data file.

---

## Building from source (developers)

Requirements: [Node.js](https://nodejs.org/) (LTS) on Windows.

```bash
# Install dependencies
npm install

# Run the app in development
npm start

# Build the portable exe → dist/Resell Profit.exe
npm run build
```

---

## IMPORTANT
- This app was created by Claude Code with some changes made by myself.
- As this app is majority AI Coded please use with caution!


## Licence

*MIT Licence*
