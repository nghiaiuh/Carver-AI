export type LibraryAsset = {
  id: string;
  src: string;
  thumbnailSrc?: string;
  title?: string;
  prompt?: string;
  source?: "ai-chat" | "upload" | "manual";
  createdAt: string;
  metadata?: {
    speciesName?: string;
    categoryHint?: string;
    model?: string;
    originalWidth?: number;
    originalHeight?: number;
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
