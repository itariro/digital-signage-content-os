# Digital Signage Content OS

Digital Signage Content OS is a browser-based content authoring and playback system for digital photo frames, information displays, and ambient signage. It combines a visual editor, reusable layouts, media albums, live widgets, frame management, scheduling, and a public frame display route in a single Next.js application.

The project is designed around a simple workflow:

1. Create or select a frame.
2. Build one or more layouts in the editor.
3. Add widgets and configure their appearance.
4. Create albums from movie, TV, book, music, or photo artwork.
5. Attach albums to layouts and configure slideshow behavior.
6. Assign a layout to a frame and open the frame display URL on a screen.
7. Optionally schedule layouts and night-mode behavior.

## Product capabilities

### Frame management

The Frame Directory is the central place for managing display devices. A frame has an identifier, display name, resolution, optional physical screen dimensions, a persisted content document, and timestamps.

Frames support:

- A stable human-readable identifier used in display URLs.
- Configurable portrait resolutions, including `1080x1920` and `1440x2560`.
- A persisted set of layouts, presets, albums, fonts, and schedule settings.
- A dedicated display route at `/frame/[frameId]`.
- A manager route at `/frame` for browsing and opening frames.
- Explicit frame creation through the frame manager rather than implicit creation from arbitrary display URLs.

### Visual layout editor

The editor provides a canvas-oriented authoring workflow for arranging content on a frame. Layouts contain positioned widgets, layout-level display settings, and optional album associations.

Editor functionality includes:

- Add, select, move, resize, lock, hide, group, and delete widgets.
- Edit widget properties and visual styling.
- Layer ordering and layer visibility controls.
- Layout naming and layout settings.
- Resolution-aware canvas rendering.
- Snap-to-grid support with configurable grid size.
- Background color and dimming controls.
- Location configuration for weather data.
- Metric and imperial weather units.
- Album selection for media-backed layouts.
- Preset-based widget starting points.
- Custom font loading and font selection.
- Editor preview overlays and frame switching.

Layouts are stored as data documents, which makes them portable between the editor and the display renderer. A layout is not treated as a separate page; it is a structured composition of widgets and settings.

### Widget library

The application includes widgets for time, weather, planning, and decorative content:

- Digital clock
- Analog clock
- Date
- Current weather and forecast
- UV index
- Sunrise and sunset
- Calendar
- Text
- Icon
- World clock
- Hourly weather
- Moon phase
- Countdown
- Quote
- Now Showing

Each widget has a definition describing its label, category, icon, default dimensions, minimum dimensions, available templates, configurable properties, and default styling. This central definition is used by the editor and keeps widget creation consistent with rendering.

Widget styling supports:

- Font family and weight
- Letter spacing
- Text alignment
- Main and accent colors
- Background color and opacity
- Blur and corner radius
- Stroke and text stroke
- Overall opacity
- Shadows

### Albums and media collections

Albums are reusable media collections attached to layouts. They support several content themes:

- Movies
- TV series
- Books
- Music
- Photos

An album contains media items with a title, subtitle, year, artwork, source URL, and optional metadata such as genre, description, director, and rating. Albums also define slideshow behavior.

Supported presentation modes include:

- Fill
- Poster
- Book
- Vinyl
- Gallery

Slideshow configuration includes:

- Fade, slide, zoom, or no transition
- Optional Ken Burns motion
- Display interval
- Sequential or shuffled ordering
- Artwork size and position
- Blurred or solid backdrop
- Backdrop color

### Artwork search

Artwork search is implemented server-side through the `/api/artwork` route. The API supports normal text search and advanced multi-item searches.

Supported providers and search types include:

- Movies through Wikipedia search results and page images.
- TV series through TVMaze.
- Books through Open Library.
- Music albums through the iTunes Search API.

Artwork results are normalized into a common shape so the editor can render all content types through the same album-selection interface. Images are requested in high-resolution variants where the upstream provider supports them, while smaller thumbnails are used for browsing performance.

#### Pagination

Artwork search accepts a `page` query parameter and returns a page of results together with `hasMore`. The editor can move through additional result pages instead of being restricted to the first provider response.

Example:

```text
/api/artwork?theme=music&q=eminem&page=2
```

#### Advanced multi-item search

Advanced search accepts a JSON array in the `q` parameter. Entries may be plain strings or structured objects. Examples:

```json
[
  {"artist":"50 Cent","album":"Get Rich or Die Trying"},
  {"artist":"Eminem","album":"The Slim Shady LP"}
]
```

```json
[
  {"artist":"50 Cent"},
  {"artist":"Eminem"},
  {"artist":"Talib Kweli"}
]
```

Movie and TV searches can use `title`, `actor`, and `director`. Book searches can use `title` and `author`. Music searches can use `artist`, `album`, and `title`.

Advanced searches are validated and bounded to protect the upstream providers and the application:

- Up to 20 search items per request.
- Maximum JSON payload size of 12,000 bytes.
- Maximum individual field length of 120 characters.
- Partial failures are returned without discarding successful results.
- Duplicate artwork entries are removed before pagination.

### Now Showing widget

The Now Showing widget displays selected metadata from an active album item. Its content can be configured by media theme so a layout can show the information most relevant to the source:

Movie fields:

- Title
- Release year
- Synopsis
- Genre
- Director
- Rating

Music fields:

- Title
- Artist
- Release year
- Genre

Book fields:

- Title
- Author
- Release year
- Genre
- Synopsis or summary

The widget reads from the active slideshow item, allowing a single layout to keep its metadata synchronized with the currently displayed cover, poster, or album art.

### Live display playback

The display surface is available at `/frame/[frameId]`. It loads a persisted frame document and renders the active layout in display mode.

The playback layer includes:

- Full-screen frame rendering.
- Widget rendering from layout data.
- Album slideshow playback.
- Current time and date updates.
- Weather refreshes through SWR.
- Scheduled layout switching.
- Night mode with brightness, warmth, and optional hidden seconds.
- Cache-busting and synchronized content refresh behavior to avoid conflicting layout or album transitions.

The display route is intended to be opened on a kiosk, tablet, smart display, or other dedicated screen. It does not create arbitrary frames when a nonexistent identifier is visited; frames are expected to be created and managed through the Frame Directory.

### Scheduling and night mode

A frame can contain an optional schedule with layout rules. Each rule references a layout and includes:

- Days of the week.
- Start time.
- End time.

Night mode can be enabled independently and supports:

- Start and end time.
- Brightness adjustment.
- Warmth adjustment.
- Hiding seconds from clock widgets.

The playback renderer resolves the current active layout from the schedule and provides a consistent result to the display surface.

### Weather and location tools

Weather widgets use the configured latitude, longitude, and unit system from layout settings. The weather hook uses SWR for caching and periodic refresh.

Supporting API routes provide:

- Current weather and forecast data.
- Location search and geocoding.
- Location names and coordinates for layout configuration.

### Presets and fonts

Presets provide reusable widget compositions for quickly starting a layout. Custom fonts can be registered and selected by widgets. The editor includes a font panel and the API exposes font-related operations for the application.

## Application routes

### Pages

| Route | Purpose |
| --- | --- |
| `/` | Main editor entry point and workspace shell. |
| `/frame` | Frame Directory and frame management. |
| `/frame/[frameId]` | Public/display playback surface for a specific frame. |

### API routes

| Endpoint | Purpose |
| --- | --- |
| `GET/POST /api/store` | Read or persist the application/frame document store. |
| `/api/frames` | Create, list, update, and manage frames. |
| `/api/layouts` | Create and manage reusable layouts. |
| `/api/layouts/[id]` | Read, update, or delete a specific layout. |
| `/api/albums` | Create, list, and manage albums. |
| `/api/albums/[id]` | Read, update, or delete a specific album. |
| `/api/artwork` | Search and paginate movie, TV, book, and music artwork. |
| `/api/weather` | Fetch weather and forecast data. |
| `/api/geocode` | Search for locations and coordinates. |
| `/api/fonts` | Load or manage font data used by the editor. |
| `/api/presets` | Read available widget presets. |
| `/api/schedule` | Work with frame scheduling configuration. |
| `/api/active` | Resolve active playback/content information. |
| `/api/sources` | Manage content source records. |
| `/api/media` | List or serve stored media. |
| `/api/media/[file]` | Serve an individual media file. |

Exact request and response contracts are defined in the corresponding route handlers under `app/api`.

## Technical architecture

### Framework

- Next.js 16.3.3
- React 19
- App Router
- TypeScript 5.7
- Tailwind CSS 4
- shadcn-compatible UI components
- Base UI primitives
- Lucide icons

### Client state and data fetching

SWR is used for browser-side fetching, caching, deduplication, revalidation, and keeping UI state synchronized with API responses.

The main frame store hook, `hooks/use-frame-store.ts`, provides:

- A shared `/api/store` data source.
- Fallback data for fast initial rendering.
- Mutation helpers for POST, PUT, and DELETE operations.
- Store updates after mutations without requiring a full page reload.
- Weather and artwork-specific data hooks.

Artwork search uses a canonicalized query key so equivalent advanced JSON input does not create unnecessary duplicate requests.

### Server-side data and persistence

The persistence layer uses PostgreSQL with Drizzle ORM. Database connection helpers live under `lib/db`.

The core database tables are:

#### `frame_documents`

Stores frame identities and their serialized content documents.

Fields include:

- `id`
- `identifier`
- `name`
- `data` JSONB document
- `created_at`
- `updated_at`
- `resolution_width`
- `resolution_height`
- Optional physical screen dimensions

#### `frame_templates`

Stores reusable frame/layout template documents with names, serialized data, and timestamps.

#### `content_sources`

Stores named content sources associated with frames. Each source has a kind and JSON configuration, enabling future source-specific integrations without changing the frame document shape.

The application reads the database connection from `DATABASE_URL` or the connection variables supplied by the deployment environment.

### Shared domain types

`lib/types.ts` is the central domain model for the client and renderer. It defines:

- Widget types and widget props.
- Widget styling.
- Frame and layout settings.
- Album themes and presentations.
- Album items and slideshow configuration.
- Layouts, presets, schedules, and night mode.
- Weather response data.

Keeping these types shared reduces mismatches between the editor, API, and display surface.

## Project structure

```text
app/
  api/                  Route handlers for persistence and external data.
  frame/                Frame Directory and display routes.
  globals.css           Global Tailwind/theme styles.
  layout.tsx            Root layout and metadata.
  page.tsx              Main editor page.
components/
  editor/               Editor panels, canvas, controls, and inspectors.
  frame/                Display renderer, slideshow, scene, and widgets.
  ui/                   Reusable UI primitives.
hooks/
  use-editor.ts         Editor-specific state and actions.
  use-frame-store.ts    SWR-backed store, artwork, weather, and geocode hooks.
  use-now.ts            Current-time updates.
lib/
  albums.ts             Album helpers and defaults.
  db/                   Drizzle database connection and schema.
  fonts.ts              Font definitions and font utilities.
  frame-utils.ts        Frame/layout utility functions.
  media.ts              Media helpers.
  quotes.ts             Quote content/helpers.
  schedule.ts           Schedule resolution logic.
  schema.ts             Validation schemas.
  store.ts              Store defaults and persistence helpers.
  types.ts              Shared domain types.
  widgets.ts            Widget definitions, defaults, and field metadata.
```

## Getting started

### Requirements

- Node.js compatible with the Next.js 16 toolchain.
- pnpm 12 or another package manager capable of installing the declared dependencies.
- PostgreSQL for durable persistence.
- API access to the public artwork providers if artwork search is used.

### Install dependencies

```bash
pnpm install
```

### Configure environment variables

Create `.env.local` for local development. At minimum, configure the PostgreSQL connection used by the Drizzle database layer:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
```

Depending on the deployment environment, additional PostgreSQL variables may be provided, such as pooled and unpooled connection URLs. Do not commit credentials or local environment files.

### Start development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Build for production

```bash
pnpm build
pnpm start
```

## Typical usage

### Create a frame

1. Open `/frame`.
2. Use the Frame Directory to create a frame.
3. Choose a stable identifier, such as `living-room` or `hallway-display`.
4. Configure the frame name and resolution.
5. Open the frame in the editor.

The display URL is then:

```text
/frame/living-room
```

### Create a layout

1. Open the layout panel in the editor.
2. Add a new layout and name it.
3. Add widgets from the widget library.
4. Position and style the widgets on the canvas.
5. Configure resolution, background, location, and album settings.
6. Save the layout.

New layouts are propagated through the SWR-backed store so they become available to the Frame Directory and frame switcher without requiring a hard refresh.

### Build a media album

1. Open the Albums panel.
2. Select a theme: movies, TV, books, music, or photos.
3. Search for artwork.
4. Use pagination to inspect more results.
5. Optionally switch to Advanced Search and submit a JSON array.
6. Add selected items to the album.
7. Configure presentation, transitions, timing, ordering, and backdrop behavior.
8. Attach the album to a layout.

### Run a frame

Open the frame display route on the target device:

```text
https://your-domain.example/frame/living-room
```

Keep the display page open. It will render the persisted active layout, update live widgets, play album content, and apply schedule/night-mode rules.

## Design and implementation principles

- Frames are managed from one authoritative Frame Directory.
- Display routes read existing frame records and do not silently create unknown frames.
- Layouts and albums are structured data, not hardcoded page markup.
- External media results are normalized into a shared `AlbumItem` model.
- High-resolution artwork is preferred for playback; thumbnails are used for search grids.
- External requests use server-side route handlers rather than exposing provider logic in the browser.
- Zod validation protects advanced search inputs and API boundaries.
- SWR avoids unnecessary reloads and keeps editor/display data current.
- Abortable fetches and bounded upstream requests reduce wasted work.
- Semantic, reusable UI components are used across the editor and management surfaces.

## Known operational considerations

- Artwork metadata quality depends on the upstream provider. Some providers do not expose every requested field for every result.
- Public artwork APIs can impose rate limits or transient availability issues; the artwork route reports errors and partial failures rather than treating every request as all-or-nothing.
- Search result ordering is provider-dependent.
- External artwork URLs are remote resources and may change or become unavailable over time.
- A production deployment should use a managed PostgreSQL instance, secure environment variables, HTTPS, and appropriate monitoring.
- Display devices should use a stable browser/kiosk configuration and a persistent frame identifier.

## Development guidance

When changing the domain model, update the shared types, validation schema, persistence mapping, editor consumers, and display renderer together. When adding a widget, define it in `lib/widgets.ts`, add its rendering branch in the frame widget renderer, and expose its editor fields through the widget definition.

When adding a new artwork provider or media theme:

1. Add the normalized result mapping in `app/api/artwork/route.ts`.
2. Preserve the shared `ArtworkResult` contract.
3. Support pagination where the upstream API allows it.
4. Prefer high-resolution source artwork and separate thumbnail URLs.
5. Add theme-specific metadata fields only when they are optional and backward-compatible.
6. Update album/editor presentation logic and this README.

## Deployment

This repository is connected to a Vercel project and can be deployed through Vercel or the linked v0 workflow. Configure the production database and environment variables in the deployment project before publishing.

The application is suitable for deployment as:

- A hosted editor for managing frame content.
- A public or protected display endpoint for physical screens.
- A small internal signage network backed by PostgreSQL.

For a v0-managed workflow, continue development through the linked v0 project so changes can be reviewed and synchronized with the repository.

## License and project status

This repository does not currently declare a license in `package.json` or a dedicated license file. Treat the project as private unless the owners explicitly publish licensing terms.

The application is an actively evolving digital signage platform. Its core foundations are the frame manager, visual editor, structured layouts, media albums, high-resolution artwork search, display playback, scheduling, and live widgets.

## Useful links

- [Next.js documentation](https://nextjs.org/docs)
- [React documentation](https://react.dev)
- [Drizzle ORM documentation](https://orm.drizzle.team)
- [SWR documentation](https://swr.vercel.app)
- [Open Library API](https://openlibrary.org/developers/api)
- [TVMaze API](https://www.tvmaze.com/api)
- [Wikipedia API](https://www.mediawiki.org/wiki/API)
- [iTunes Search API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/)
- [v0 documentation](https://v0.app/docs)

## v0 project

This repository is linked to a [v0](https://v0.app) project. Changes can be continued through the linked workspace:

[Continue working on v0](https://v0.app/chat/projects/prj_KFvcEyeWt7bF0LATwAwagc4AD7Z4)

Every merge to the repository's deployment branch can be configured to deploy automatically through the connected Vercel project.

## License

No license file is currently included. All rights remain with the project owner unless a separate license is added.

## Acknowledgements

The project builds on Next.js, React, Drizzle ORM, SWR, Tailwind CSS, shadcn-compatible components, Lucide, and the public media/data APIs listed above.

## Support

For v0 platform or deployment support, use [Vercel Support](https://vercel.com/help). For project-specific issues, use the repository's issue tracker or the team maintaining the deployment.

## Quick reference

```text
Editor:          /
Frame Directory: /frame
Frame display:   /frame/[frameId]
Artwork search:  /api/artwork?theme=<theme>&q=<query>&page=<page>
Store:           /api/store
Database:        PostgreSQL + Drizzle ORM
Client cache:    SWR
Framework:       Next.js 16 App Router
```

## Contributing checklist

Before opening a change for review:

- Confirm TypeScript types still describe the persisted data.
- Confirm editor mutations update the SWR store without a manual refresh.
- Confirm unknown frame identifiers are rejected instead of created implicitly.
- Test the display route after switching layouts and albums.
- Verify artwork results have both browsing thumbnails and playback-quality images where available.
- Test normal and advanced searches, including malformed JSON and partial provider failures.
- Test pagination at the first, middle, and final result pages.
- Test empty albums, missing artwork, and missing optional metadata.
- Test both portrait resolutions and responsive editor behavior.
- Run a production build before deployment.

---

Digital Signage Content OS is intended to make building, managing, and displaying rich ambient content as direct as editing a layout and opening a frame URL.
