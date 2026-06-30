export type LibraryAsset = {
  id: string;
  src: string;
  thumbnailSrc?: string;
  previewSrc?: string;
  originalSrc?: string;
  title?: string;
  prompt?: string;
  source?: "ai-chat" | "upload" | "manual";
  tags?: string[];
  category?: string;
  folderId?: string;
  createdAt: string;
  metadata?: {
    speciesName?: string;
    categoryHint?: string;
    model?: string;
    originalWidth?: number;
    originalHeight?: number;
    folderId?: string;
    folderTitle?: string;
    folderSlug?: string;
    imageUrls?: {
      thumb: string;
      preview: string;
      original: string;
    };
  };
};

export type LibraryFolder = {
  id: string;
  title: string;
  slug?: string;
  createdBy: "ai" | "user";
  createdAt: string;
  updatedAt: string;
  assets: LibraryAsset[];
};
