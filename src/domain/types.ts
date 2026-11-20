/** A list's type. 'crisis' is shown as "Reading order"; it keeps its old name in the database. */
export type Kind = 'crisis' | 'run' | 'event' | 'era' | 'arc' | 'edition';
export type IssueStatus = 'unread' | 'reading' | 'read';
/** Which Darkhold this belongs to. Null or missing is a comic (everything from before books and manga). */
export type Format = 'comic' | 'manga' | 'book';
export const FORMATS: Format[] = ['comic', 'manga', 'book'];
/** How often a manga's next chapter comes out, for Release radar. */
export type ReleaseEvery = 'weekly' | 'biweekly' | 'monthly';
/** A manga's status as AniList reports it (or as you set it). */
export type ReleaseStatus = 'releasing' | 'hiatus' | 'finished';
export type DatePrecision = 'day' | 'unknown';

export interface Series {
  id: string;
  title: string;
  volume_year: number | null;
  publisher: string | null;
  /** The Comic Vine volume this series was matched to. */
  cv_volume_id?: number | null;
  /** When the series was added (Supabase keeps the first value; older ones are a best guess). */
  created_at?: string | null;
  format?: Format | null;
  /** Manga: a repeating schedule for the next chapter (null = none). */
  release_every?: ReleaseEvery | null;
  /** Manga: the day the next chapter is expected ("2026-11-24"); moves on by itself. */
  release_next?: string | null;
  /** Manga: you paused the schedule. */
  release_paused?: boolean;
  /** Manga: releasing, on hiatus or finished (from AniList, or set by hand). */
  release_status?: ReleaseStatus | null;
  /** The AniList manga this series was matched to. */
  anilist_id?: number | null;
  /** The Open Library work this book was matched to ("/works/OL45883W"). */
  ol_key?: string | null;
}

export interface Issue {
  id: string;
  series_id: string;
  /** Text so "0", "1/2" or "Annual 1" all work. Null means not identified yet. */
  number: string | null;
  /** Shown instead of the number when the number is unknown. */
  label: string | null;
  status: IssueStatus;
  completed_at: string | null;
  date_precision: DatePrecision;
  rating: number | null;
  notes: string | null;
  cover_path: string | null;
  pub_year: number | null;
  /** The story's name, e.g. "I Am Gotham, Part One". */
  story_title?: string | null;
  /** Comma-separated names, from Comic Vine or typed in. */
  writers?: string | null;
  artists?: string | null;
  /** "YYYY-MM-DD" as printed on the cover. */
  cover_date?: string | null;
  cv_issue_id?: number | null;
  /** Announced but not out yet. Clears itself once the release date passes, it's read, or Comic Vine has it. */
  upcoming?: boolean;
  /** Known release day ("2027-02-10") or month ("2027-02"); null when there's no date yet. */
  release_on?: string | null;
  /** Characters or teams in this issue, comma-separated ("Batman, Superman"). */
  characters?: string | null;
  /** When the issue was added (Supabase keeps the first value; older ones are a best guess). */
  created_at?: string | null;
}

export interface Collection {
  id: string;
  kind: Kind;
  title: string;
  publisher: string | null;
  writer: string | null;
  artist: string | null;
  characters: string | null;
  start_year: number | null;
  end_year: number | null;
  description: string | null;
  cover_path: string | null;
  on_hold: boolean;
  /** Still coming out: show "2024–present" rather than an end year. */
  ongoing: boolean;
  /** Set by you: on the "Plan to read" shelf until you start it. */
  planned?: boolean;
  /** Switched on when you're actively reading this list: only these show in Continue reading. */
  reading_now?: boolean;
  /** Set while you read a finished list again: the day the reread started. */
  reread_since?: string | null;
  /** Your own word for the type, shown instead of it ("Saga", "Omnibus"). */
  label?: string | null;
  /** When the list was added (Supabase keeps the first value). Lists from before this existed have a best guess. */
  created_at?: string | null;
  /** Comic (default), manga or book: which mode the list shows in. */
  format?: Format | null;
  /** Books: you have a physical copy (the Bought filter). */
  owned?: boolean;
  rating: number | null;
  notes: string | null;
}

/** One ordered line inside a collection: an issue or another collection. */
export interface Entry {
  id: string;
  parent_id: string;
  position: number;
  child_issue_id: string | null;
  child_collection_id: string | null;
  /** For an issue line: the run or event this issue is a slice of (crisis reading orders). */
  via_collection_id: string | null;
  /** A chapter heading line ("Phase 2 · The Incursions"): holds no issue or collection; note is its description. */
  heading?: string | null;
  note: string | null;
  /** Shown and tickable, skipped by Next up, counted toward progress only once read ("optional but recommended"). */
  optional?: boolean;
  /**
   * Worked out when the library loads, never stored: the list this line is shown as part of.
   * The pinned via_collection_id if there is one, else (in a reading order) the event or run the issue sits in.
   */
  part_of?: string | null;
}

export type LinkKind = 'follows' | 'background' | 'tie_in';

/**
 * A connection that isn't "inside": from follows to (comes after it), from has to as background
 * (reads better knowing it), or from is a tie-in of to. Each end is a list or one issue.
 */
export interface Link {
  id: string;
  kind: LinkKind;
  from_collection_id: string | null;
  from_issue_id: string | null;
  to_collection_id: string | null;
  to_issue_id: string | null;
  note: string | null;
}

export interface ReadLog {
  id: string;
  issue_id: string;
  read_on: string | null;
  date_precision: DatePrecision;
  rating: number | null;
  note: string | null;
  /** A reread: the issue had been read before this day. */
  reread?: boolean;
}

export type Verdict = 'bad' | 'forgettable' | 'good_enough' | 'generational' | 'peak';

/** Your review of one list (run, event, reading order…) or one issue. */
export interface Review {
  id: string;
  collection_id: string | null;
  issue_id: string | null;
  verdict: Verdict;
  /** Out of 10, up to two decimals; the stars are this halved. */
  score: number | null;
  body: string | null;
  /** The day you wrote it ("2026-11-10"). */
  reviewed_on: string | null;
}

export type CollectionStatus = 'not_started' | 'planned' | 'reading' | 'on_hold' | 'completed';
