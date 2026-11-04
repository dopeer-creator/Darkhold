export type Kind = 'crisis' | 'run' | 'event';
export type IssueStatus = 'unread' | 'reading' | 'read';
export type DatePrecision = 'day' | 'unknown';

export interface Series {
  id: string;
  title: string;
  volume_year: number | null;
  publisher: string | null;
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
}

export interface ReadLog {
  id: string;
  issue_id: string;
  read_on: string | null;
  date_precision: DatePrecision;
  rating: number | null;
  note: string | null;
}

export type CollectionStatus = 'not_started' | 'reading' | 'on_hold' | 'completed';
