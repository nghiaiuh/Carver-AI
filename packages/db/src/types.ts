// ─── Auto-generated Database Types từ Supabase ───────────────────────────────
// Để tự động sinh types từ Supabase project thực tế của bạn, chạy lệnh:
//
//   npx supabase gen types typescript --project-id <PROJECT_ID> > src/types.ts
//
// Hoặc nếu đang dùng Supabase CLI local:
//   npx supabase gen types typescript --local > src/types.ts
//
// Tham khảo: https://supabase.com/docs/guides/api/rest/generating-types
// ─────────────────────────────────────────────────────────────────────────────

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

// ─── Định nghĩa schema Database ───────────────────────────────────────────────
// Cập nhật interface này để phản ánh đúng schema của bạn trên Supabase.
// Mỗi table/view được khai báo trong Tables/Views với các kiểu Row, Insert, Update.
export interface Database {
  public: {
    Tables: {
      // ── Ví dụ: bảng projects ──────────────────────────────────────────────
      projects: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          owner_id: string;
          canvas_data: Json | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          owner_id: string;
          canvas_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          owner_id?: string;
          canvas_data?: Json | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "projects_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "users";
            referencedColumns: ["id"];
          }
        ];
      };

      // ── Ví dụ: bảng jobs (BullMQ job tracking) ───────────────────────────
      jobs: {
        Row: {
          id: string;
          project_id: string;
          type: string;
          status: "pending" | "running" | "completed" | "failed";
          payload: Json | null;
          result: Json | null;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          project_id: string;
          type: string;
          status?: "pending" | "running" | "completed" | "failed";
          payload?: Json | null;
          result?: Json | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          project_id?: string;
          type?: string;
          status?: "pending" | "running" | "completed" | "failed";
          payload?: Json | null;
          result?: Json | null;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "jobs_project_id_fkey";
            columns: ["project_id"];
            isOneToOne: false;
            referencedRelation: "projects";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}

// ─── Utility Types ────────────────────────────────────────────────────────────
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type InsertTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export type UpdateTables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
