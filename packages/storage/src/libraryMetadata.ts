/*
 * Compatibility entry point for API routes that historically imported
 * `library-metadata`. The library lifecycle now has one implementation in
 * `library.ts`, so upload and deletion cannot drift apart.
 */

export {
  buildLibraryAssetRecord,
  buildLibraryFolderRecord,
  createLibraryFolder,
  deleteLibraryAsset,
  deleteLibraryFolder,
  humanizeSlug,
  listLibrary,
  renameLibraryFolder,
  slugify,
} from "./library";

export type {
  LibraryAssetRecord,
  LibraryAssetRow,
  LibraryFolderRecord,
  LibraryFolderRow,
} from "./library";
