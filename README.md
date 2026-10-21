# Bond Check

**Bond Check** is an offline-first prize bond manager for Pakistan.  
It helps you save all your prize bonds in one place, import official National Savings draw results, and check every bond instantly — without checking numbers one by one.

Built for personal and family use, with a future plan for shared workspaces and multi-tenant support.

## Features

- Add bonds individually, by range, or by bulk paste
- Range preview with remove, edit, undo, and final save
- Save bond details: number, denomination, purchase date, holder, series, and location/note
- Import official National Savings draw results from TXT files
- Manually add historical draw links by denomination and year
- Automatically check all saved bonds against imported draws
- Detect missing draws using a coverage matrix
- Show winning bonds, prize rank, gross amount, and claim status
- Track claims: claim date, received amount, and pending claims
- Renew bonds while preserving win history
- Archive or mark bonds as cashed
- Delete bonds with undo
- View activity logs for every important action
- Search across bonds, draws, results, and logs
- Export data as CSV
- Offline-first local storage with SQLite
- Dark mode and large-text support

## Planned

- Supabase / PostgreSQL backend
- Shared family workspaces with invite codes
- Owner, Editor, and Viewer roles
- Cloud backup and sync
- PDF statements
- Photo OCR for bond-number extraction
- Urdu language support

## Supported Denominations

- Rs. 100
- Rs. 200
- Rs. 750
- Rs. 1,500
- Rs. 25,000 Premium
- Rs. 40,000 Premium

## Tech Stack

- React Native
- TypeScript
- SQLite
- React Navigation
- Zustand / Redux Toolkit / Riverpod-style state management
- Supabase / PostgreSQL (planned)

## Data Source

Draw results are imported from official National Savings Pakistan TXT files:

- https://savings.gov.pk/download-draws/
- https://savings.gov.pk/latest/results.php

The app parses official TXT files to identify:

- Draw number
- Draw date
- Denomination
- 1st prize numbers
- 2nd prize numbers
- 3rd prize numbers

Manual TXT file import and text-paste fallback are also supported.

## Important Notes

- Prize claims must generally be made within six years of the draw date.
- A bond must usually be at least 60 days old on the draw date to be eligible.
- Premium Prize Bonds are registered bonds; prize/profit payments are credited directly to the linked bank account.
- Tax treatment can change, so verify current withholding-tax rules with official sources before relying on calculated net amounts.

## Development

```bash
npm install
npx expo start
```

## License

MIT
