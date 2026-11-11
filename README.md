# Darkhold

A comic reading tracker for Android. Keep runs, events and reading orders in one place, see what to read next, review what you finish, and share it as an Instagram story.

Darkhold is in development and not public yet.

## What it does

- **Lists**: runs (one writer on one book), events, reading orders, eras (a writer across books) and collected editions. Chapter headings split long lists into phases.
- **Each issue is stored once.** Tick it in one list and it counts as read everywhere it appears.
- **Paste a whole reading order.** Label parts with `event:`, `run:`, `chapter:` and `issue:`. Darkhold files every issue into the right run or event, reuses issues you already have, and warns when a series has no year.
- **Connections** between lists: comes after, leads into, background, tie-in of.
- **Statuses you control.** Reading and On hold are only set when you choose them, Completed sets itself, and everything else is Plan to read.
- **Home**: Continue reading, Recently read, Release radar (new and upcoming issues of what you follow), On hold and Plan to read.
- **Reviews**: a verdict (Bad, Forgettable, Good enough, Generational, Peak) and a score out of 10 for any list or issue, with a 9:16 story card for Instagram.
- **Recap**: your week, month, year or all time in issues, characters and writers, also shareable as a story card. Tap a bar to open that day in History.
- **History**: a calendar of reading days; pick a day to see what you read on it.
- **Characters, writers and artists** each get a page, and the Library filters by them.
- **Rereads** are logged without losing the first read.
- **Covers and credits** come from Comic Vine with your own free key, and most credits come from the Grand Comics Database.
- **Backup and sharing**: export everything to one file, import it again, or send a single list to a friend.
- **Works offline.** Changes save on the phone first and sync to your account when you're online.

## Tech

- [Expo](https://expo.dev) SDK 58, Expo Router, React Native with the React Compiler, TypeScript
- `expo-sqlite` as the on-device database; [Supabase](https://supabase.com) (Postgres with row-level security) as the account backend
- EAS Build for the APK and EAS Update for over-the-air updates
- Vitest for the domain logic

```
src/app/      screens (file-based routes)
src/domain/   pure logic: parsing pastes, statuses, reviews, recap, release radar (with tests)
src/store/    local database, schema migrations, repository, sync
src/ui/       shared components
src/lib/      Supabase client, Comic Vine, backup, story-card sharing
supabase/     SQL migrations for the backend
scripts/      data tools (building and importing lists)
```

## Running it

1. Install dependencies.

   ```bash
   npm install
   ```

2. Create `.env.local` with your Supabase project (this file is git-ignored; never commit it).

   ```
   EXPO_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
   ```

3. Run the SQL files in `supabase/migrations/` in order on that project.

4. Start the app.

   ```bash
   npx expo start
   ```

   For the browser: `npm run web:preview` (port 8081). `npm run web:offline` (port 8082) skips sign-in and uses local data only.

## Checks

```bash
npx tsc --noEmit
npx expo lint
npm test
```

## Releases

- **Updates**: every push to `main` publishes an EAS Update (see `.github/workflows/update.yml`). Installed apps download it on open and apply it on the next open. Profile shows which update is running.
- **New APK**: needed only when native modules change, since the runtime version is the project fingerprint.

  ```bash
  npx eas-cli build -p android --profile production
  ```

  The Supabase URL and key are set as EAS environment variables (production), and `EXPO_TOKEN` is a GitHub secret.

## How sync works

Every row has `updated_at` and a soft-delete `deleted_at`. Local edits are marked dirty and uploaded first; then rows changed on the server since the last pull come down. A row with local changes that haven't been uploaded yet is never overwritten by a download. When two devices edit the same row, the last one to upload wins for that row.

## Credits

Credits data from the [Grand Comics Database](https://www.comics.org) (CC BY-SA 4.0). Covers and some credits from the [Comic Vine API](https://comicvine.gamespot.com/api/), using each user's own key.
