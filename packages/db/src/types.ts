export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type PlanType = "free" | "premium";
export type ProjectStatus = "active" | "archived" | "deleted";
export type AssetKind = "upload" | "generated" | "reference" | "export";
export type ChatRole = "user" | "assistant" | "system" | "tool";
export type AiJobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "enqueue_failed"
  | "cancelled";
export type SnapshotKind =
  | "initial"
  | "manual"
  | "close"
  | "job_checkpoint";
export type AiJobType =
  | "generate_concept"
  | "refine_concept"
  | "analyze_reference"
  | "export";
export type ExportFormat = "png" | "jpg" | "pdf";
export type ExportStatus = "queued" | "running" | "succeeded" | "failed";
export type LibraryAssetSourceType = "upload" | "ai-chat" | "manual";

type Table<Row, Insert, Update, Relationships extends readonly unknown[] = []> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: Relationships;
};

export interface Database {
  public: {
    Tables: {
      profiles: Table<
        {
          id: string;
          display_name: string | null;
          avatar_url: string | null;
          plan_type: PlanType;
          credits_amount: number;
          onboarding: Json;
          created_at: string;
          updated_at: string;
        },
        {
          id: string;
          display_name?: string | null;
          avatar_url?: string | null;
          plan_type?: PlanType;
          credits_amount?: number;
          onboarding?: Json;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          display_name?: string | null;
          avatar_url?: string | null;
          plan_type?: PlanType;
          credits_amount?: number;
          onboarding?: Json;
          created_at?: string;
          updated_at?: string;
        }
      >;
      library_folders: Table<
        {
          id: string;
          owner_id: string;
          title: string;
          slug: string;
          created_by: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          owner_id: string;
          title: string;
          slug: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          owner_id?: string;
          title?: string;
          slug?: string;
          created_by?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      library_assets: Table<
        {
          id: string;
          owner_id: string;
          folder_id: string;
          title: string;
          prompt: string | null;
          category: string | null;
          tags: string[];
          source_type: LibraryAssetSourceType;
          mime_type: string | null;
          width: number | null;
          height: number | null;
          size_bytes: number | null;
          thumb_storage_path: string;
          preview_storage_path: string;
          original_storage_path: string;
          thumb_url: string;
          preview_url: string;
          original_url: string;
          metadata: Json;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          owner_id: string;
          folder_id: string;
          title: string;
          prompt?: string | null;
          category?: string | null;
          tags?: string[];
          source_type?: LibraryAssetSourceType;
          mime_type?: string | null;
          width?: number | null;
          height?: number | null;
          size_bytes?: number | null;
          thumb_storage_path: string;
          preview_storage_path: string;
          original_storage_path: string;
          thumb_url: string;
          preview_url: string;
          original_url: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          owner_id?: string;
          folder_id?: string;
          title?: string;
          prompt?: string | null;
          category?: string | null;
          tags?: string[];
          source_type?: LibraryAssetSourceType;
          mime_type?: string | null;
          width?: number | null;
          height?: number | null;
          size_bytes?: number | null;
          thumb_storage_path?: string;
          preview_storage_path?: string;
          original_storage_path?: string;
          thumb_url?: string;
          preview_url?: string;
          original_url?: string;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        }
      >;
      projects: Table<
        {
          id: string;
          owner_id: string;
          name: string;
          description: string | null;
          status: ProjectStatus;
          current_canvas_snapshot_id: string | null;
          landscape_goal: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          owner_id: string;
          name: string;
          description?: string | null;
          status?: ProjectStatus;
          current_canvas_snapshot_id?: string | null;
          landscape_goal?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          owner_id?: string;
          name?: string;
          description?: string | null;
          status?: ProjectStatus;
          current_canvas_snapshot_id?: string | null;
          landscape_goal?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      project_canvas_drafts: Table<
        {
          project_id: string;
          owner_id: string;
          base_snapshot_id: string | null;
          revision: number;
          document_hash: string | null;
          canvas_json: Json;
          last_mutation_id: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          project_id: string;
          owner_id: string;
          base_snapshot_id?: string | null;
          revision?: number;
          document_hash?: string | null;
          canvas_json?: Json;
          last_mutation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          project_id?: string;
          owner_id?: string;
          base_snapshot_id?: string | null;
          revision?: number;
          document_hash?: string | null;
          canvas_json?: Json;
          last_mutation_id?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      landscape_briefs: Table<
        {
          id: string;
          project_id: string;
          property_type: string | null;
          location_text: string | null;
          climate_zone: string | null;
          yard_dimensions: string | null;
          sun_shade: string | null;
          soil_drainage: string | null;
          budget_range: string | null;
          style_preferences: string[] | null;
          must_keep_items: string[] | null;
          avoid_items: string[] | null;
          notes: Json;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          project_id: string;
          property_type?: string | null;
          location_text?: string | null;
          climate_zone?: string | null;
          yard_dimensions?: string | null;
          sun_shade?: string | null;
          soil_drainage?: string | null;
          budget_range?: string | null;
          style_preferences?: string[] | null;
          must_keep_items?: string[] | null;
          avoid_items?: string[] | null;
          notes?: Json;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          project_id?: string;
          property_type?: string | null;
          location_text?: string | null;
          climate_zone?: string | null;
          yard_dimensions?: string | null;
          sun_shade?: string | null;
          soil_drainage?: string | null;
          budget_range?: string | null;
          style_preferences?: string[] | null;
          must_keep_items?: string[] | null;
          avoid_items?: string[] | null;
          notes?: Json;
          created_at?: string;
          updated_at?: string;
        }
      >;
      canvas_snapshots: Table<
        {
          id: string;
          project_id: string;
          version: number;
          canvas_json: Json;
          thumbnail_asset_id: string | null;
          created_by: string;
          snapshot_kind: SnapshotKind;
          is_user_visible: boolean;
          document_hash: string | null;
          created_at: string;
        },
        {
          id?: string;
          project_id: string;
          version: number;
          canvas_json?: Json;
          thumbnail_asset_id?: string | null;
          created_by: string;
          snapshot_kind?: SnapshotKind;
          is_user_visible?: boolean;
          document_hash?: string | null;
          created_at?: string;
        },
        {
          id?: string;
          project_id?: string;
          version?: number;
          canvas_json?: Json;
          thumbnail_asset_id?: string | null;
          created_by?: string;
          snapshot_kind?: SnapshotKind;
          is_user_visible?: boolean;
          document_hash?: string | null;
          created_at?: string;
        }
      >;
      assets: Table<
        {
          id: string;
          project_id: string;
          owner_id: string;
          kind: AssetKind;
          storage_bucket: string;
          storage_path: string;
          mime_type: string | null;
          width: number | null;
          height: number | null;
          size_bytes: number | null;
          source_job_id: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          project_id: string;
          owner_id: string;
          kind: AssetKind;
          storage_bucket: string;
          storage_path: string;
          mime_type?: string | null;
          width?: number | null;
          height?: number | null;
          size_bytes?: number | null;
          source_job_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          project_id?: string;
          owner_id?: string;
          kind?: AssetKind;
          storage_bucket?: string;
          storage_path?: string;
          mime_type?: string | null;
          width?: number | null;
          height?: number | null;
          size_bytes?: number | null;
          source_job_id?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        }
      >;
      chat_threads: Table<
        {
          id: string;
          project_id: string;
          title: string;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          project_id: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          project_id?: string;
          title?: string;
          created_at?: string;
          updated_at?: string;
        }
      >;
      chat_messages: Table<
        {
          id: string;
          thread_id: string;
          project_id: string;
          role: ChatRole;
          content: string;
          referenced_asset_ids: string[] | null;
          referenced_canvas_object_ids: Json;
          metadata: Json;
          created_at: string;
        },
        {
          id?: string;
          thread_id: string;
          project_id: string;
          role: ChatRole;
          content: string;
          referenced_asset_ids?: string[] | null;
          referenced_canvas_object_ids?: Json;
          metadata?: Json;
          created_at?: string;
        },
        {
          id?: string;
          thread_id?: string;
          project_id?: string;
          role?: ChatRole;
          content?: string;
          referenced_asset_ids?: string[] | null;
          referenced_canvas_object_ids?: Json;
          metadata?: Json;
          created_at?: string;
        }
      >;
      ai_jobs: Table<
        {
          id: string;
          project_id: string;
          thread_id: string | null;
          created_by: string | null;
          status: AiJobStatus;
          job_type: AiJobType;
          prompt: string | null;
          input_snapshot_id: string | null;
          output_snapshot_id: string | null;
          input_asset_ids: string[] | null;
          output_asset_ids: string[] | null;
          idempotency_key: string | null;
          target_node_id: string | null;
          bull_job_id: string | null;
          last_error_code: string | null;
          last_error_message: string | null;
          last_attempt_at: string | null;
          job_payload: Json;
          job_result: Json;
          provider: string | null;
          provider_job_id: string | null;
          error_code: string | null;
          error_message: string | null;
          created_at: string;
          updated_at: string;
        },
        {
          id?: string;
          project_id: string;
          thread_id?: string | null;
          created_by?: string | null;
          status?: AiJobStatus;
          job_type: AiJobType;
          prompt?: string | null;
          input_snapshot_id?: string | null;
          output_snapshot_id?: string | null;
          input_asset_ids?: string[] | null;
          output_asset_ids?: string[] | null;
          idempotency_key?: string | null;
          target_node_id?: string | null;
          bull_job_id?: string | null;
          last_error_code?: string | null;
          last_error_message?: string | null;
          last_attempt_at?: string | null;
          job_payload?: Json;
          job_result?: Json;
          provider?: string | null;
          provider_job_id?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        },
        {
          id?: string;
          project_id?: string;
          thread_id?: string | null;
          created_by?: string | null;
          status?: AiJobStatus;
          job_type?: AiJobType;
          prompt?: string | null;
          input_snapshot_id?: string | null;
          output_snapshot_id?: string | null;
          input_asset_ids?: string[] | null;
          output_asset_ids?: string[] | null;
          idempotency_key?: string | null;
          target_node_id?: string | null;
          bull_job_id?: string | null;
          last_error_code?: string | null;
          last_error_message?: string | null;
          last_attempt_at?: string | null;
          job_payload?: Json;
          job_result?: Json;
          provider?: string | null;
          provider_job_id?: string | null;
          error_code?: string | null;
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        }
      >;
      design_versions: Table<
        {
          id: string;
          project_id: string;
          source_snapshot_id: string | null;
          output_snapshot_id: string | null;
          source_job_id: string | null;
          label: string | null;
          notes: string | null;
          created_by: string;
          created_at: string;
        },
        {
          id?: string;
          project_id: string;
          source_snapshot_id?: string | null;
          output_snapshot_id?: string | null;
          source_job_id?: string | null;
          label?: string | null;
          notes?: string | null;
          created_by: string;
          created_at?: string;
        },
        {
          id?: string;
          project_id?: string;
          source_snapshot_id?: string | null;
          output_snapshot_id?: string | null;
          source_job_id?: string | null;
          label?: string | null;
          notes?: string | null;
          created_by?: string;
          created_at?: string;
        }
      >;
      exports: Table<
        {
          id: string;
          project_id: string;
          asset_id: string | null;
          format: ExportFormat;
          resolution: string | null;
          status: ExportStatus;
          created_by: string;
          created_at: string;
        },
        {
          id?: string;
          project_id: string;
          asset_id?: string | null;
          format: ExportFormat;
          resolution?: string | null;
          status?: ExportStatus;
          created_by: string;
          created_at?: string;
        },
        {
          id?: string;
          project_id?: string;
          asset_id?: string | null;
          format?: ExportFormat;
          resolution?: string | null;
          status?: ExportStatus;
          created_by?: string;
          created_at?: string;
        }
      >;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      save_project_canvas_snapshot: {
        Args: {
          snapshot_canvas_json: Json;
          snapshot_document_hash?: string | null;
          snapshot_reason?: string | null;
          target_project_id: string;
        };
        Returns: {
          created_at: string;
          document_hash: string | null;
          is_user_visible: boolean;
          snapshot_kind: string;
          snapshot_id: string;
          version: number;
        }[];
      };
      upsert_project_canvas_draft: {
        Args: {
          draft_base_snapshot_id?: string | null;
          draft_canvas_json: Json;
          draft_document_hash?: string | null;
          draft_last_mutation_id?: string | null;
          expected_revision: number | null;
          target_project_id: string;
        };
        Returns: {
          base_snapshot_id: string | null;
          document_hash: string | null;
          last_mutation_id: string | null;
          owner_id: string;
          project_id: string;
          revision: number;
          updated_at: string;
        }[];
      };
      finalize_project_canvas_draft: {
        Args: {
          expected_revision: number;
          snapshot_reason?: string | null;
          target_project_id: string;
        };
        Returns: {
          base_snapshot_id: string | null;
          created_at: string;
          document_hash: string | null;
          draft_revision: number;
          is_user_visible: boolean;
          snapshot_id: string;
          snapshot_kind: string;
          version: number;
        }[];
      };
      create_ai_job_with_checkpoint: {
        Args: {
          checkpoint_document_hash?: string | null;
          checkpoint_snapshot_json?: Json | null;
          target_idempotency_key: string;
          target_input_asset_ids: string[] | null;
          target_job_payload: Json;
          target_job_type: AiJobType;
          target_project_id: string;
          target_prompt: string;
          target_target_node_id?: string | null;
          target_thread_id?: string | null;
        };
        Returns: {
          created_at: string;
          error_code: string | null;
          error_message: string | null;
          id: string;
          input_snapshot_id: string | null;
          job_type: AiJobType;
          output_asset_ids: string[] | null;
          output_snapshot_id: string | null;
          project_id: string;
          prompt: string | null;
          provider: string | null;
          status: AiJobStatus;
          thread_id: string | null;
          updated_at: string;
        }[];
      };
    };
    Enums: {
      plan_type: PlanType;
      project_status: ProjectStatus;
      asset_kind: AssetKind;
      chat_role: ChatRole;
      ai_job_status: AiJobStatus;
      ai_job_type: AiJobType;
      snapshot_kind: SnapshotKind;
      export_format: ExportFormat;
      export_status: ExportStatus;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
