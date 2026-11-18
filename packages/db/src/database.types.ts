export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      audio_tracks: {
        Row: {
          character_id: string | null;
          created_at: string;
          duration_ms: number | null;
          episode_id: string;
          id: string;
          line_id: string | null;
          start_ms: number;
          status: Database['public']['Enums']['asset_status'];
          text: string | null;
          type: Database['public']['Enums']['audio_type'];
          url: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          character_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          episode_id: string;
          id?: string;
          line_id?: string | null;
          start_ms?: number;
          status?: Database['public']['Enums']['asset_status'];
          text?: string | null;
          type: Database['public']['Enums']['audio_type'];
          url?: string | null;
          workspace_id: string;
        };
        Update: {
          character_id?: string | null;
          created_at?: string;
          duration_ms?: number | null;
          episode_id?: string;
          id?: string;
          line_id?: string | null;
          start_ms?: number;
          status?: Database['public']['Enums']['asset_status'];
          text?: string | null;
          type?: Database['public']['Enums']['audio_type'];
          url?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'audio_tracks_character_id_fkey';
            columns: ['character_id'];
            isOneToOne: false;
            referencedRelation: 'characters';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audio_tracks_episode_id_workspace_id_fkey';
            columns: ['episode_id', 'workspace_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id', 'workspace_id'];
          },
        ];
      };
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          details: NonNullable<Json>;
          id: number;
          ip: unknown;
          target_id: string | null;
          target_type: string | null;
          workspace_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: never;
          ip?: unknown;
          target_id?: string | null;
          target_type?: string | null;
          workspace_id?: string | null;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          details?: NonNullable<Json>;
          id?: never;
          ip?: unknown;
          target_id?: string | null;
          target_type?: string | null;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'audit_log_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      automations: {
        Row: {
          created_at: string;
          enabled: boolean;
          id: string;
          platforms: string[];
          project_id: string;
          require_approval: boolean;
          schedule: NonNullable<Json>;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          platforms?: string[];
          project_id: string;
          require_approval?: boolean;
          schedule: NonNullable<Json>;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          enabled?: boolean;
          id?: string;
          platforms?: string[];
          project_id?: string;
          require_approval?: boolean;
          schedule?: NonNullable<Json>;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'automations_project_id_workspace_id_fkey';
            columns: ['project_id', 'workspace_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id', 'workspace_id'];
          },
        ];
      };
      characters: {
        Row: {
          age: number | null;
          backstory: string;
          created_at: string;
          id: string;
          locked_at: string | null;
          look: string;
          name: string;
          project_id: string;
          ref_images: NonNullable<Json>;
          role: string;
          sample_line: string;
          speech_style: string;
          traits: string[];
          updated_at: string;
          voice_id: string | null;
          voice_provider: string | null;
          voice_settings: NonNullable<Json>;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          age?: number | null;
          backstory?: string;
          created_at?: string;
          id?: string;
          locked_at?: string | null;
          look?: string;
          name: string;
          project_id: string;
          ref_images?: NonNullable<Json>;
          role?: string;
          sample_line?: string;
          speech_style?: string;
          traits?: string[];
          updated_at?: string;
          voice_id?: string | null;
          voice_provider?: string | null;
          voice_settings?: NonNullable<Json>;
          workspace_id: string;
        };
        Update: {
          age?: number | null;
          backstory?: string;
          created_at?: string;
          id?: string;
          locked_at?: string | null;
          look?: string;
          name?: string;
          project_id?: string;
          ref_images?: NonNullable<Json>;
          role?: string;
          sample_line?: string;
          speech_style?: string;
          traits?: string[];
          updated_at?: string;
          voice_id?: string | null;
          voice_provider?: string | null;
          voice_settings?: NonNullable<Json>;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'characters_project_id_workspace_id_fkey';
            columns: ['project_id', 'workspace_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id', 'workspace_id'];
          },
        ];
      };
      credit_allocations: {
        Row: {
          amount: number;
          job_id: string;
          lot_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          job_id: string;
          lot_id: string;
        };
        Update: {
          amount?: number;
          job_id?: string;
          lot_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'credit_allocations_lot_id_fkey';
            columns: ['lot_id'];
            isOneToOne: false;
            referencedRelation: 'credit_lots';
            referencedColumns: ['id'];
          },
        ];
      };
      credit_balances: {
        Row: {
          balance: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          balance?: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          balance?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      credit_ledger: {
        Row: {
          amount: number;
          created_at: string;
          description: string;
          expires_at: string | null;
          id: string;
          job_id: string | null;
          lot_id: string | null;
          metadata: NonNullable<Json>;
          reference: string | null;
          type: Database['public']['Enums']['ledger_type'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          created_at?: string;
          description?: string;
          expires_at?: string | null;
          id?: string;
          job_id?: string | null;
          lot_id?: string | null;
          metadata?: NonNullable<Json>;
          reference?: string | null;
          type: Database['public']['Enums']['ledger_type'];
          user_id: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          description?: string;
          expires_at?: string | null;
          id?: string;
          job_id?: string | null;
          lot_id?: string | null;
          metadata?: NonNullable<Json>;
          reference?: string | null;
          type?: Database['public']['Enums']['ledger_type'];
          user_id?: string;
        };
        Relationships: [];
      };
      credit_lots: {
        Row: {
          created_at: string;
          expires_at: string;
          id: string;
          original: number;
          remaining: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          expires_at: string;
          id: string;
          original: number;
          remaining: number;
          user_id: string;
        };
        Update: {
          created_at?: string;
          expires_at?: string;
          id?: string;
          original?: number;
          remaining?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      episodes: {
        Row: {
          approved_at: string | null;
          approved_by: string | null;
          created_at: string;
          id: string;
          number: number;
          project_id: string;
          status: Database['public']['Enums']['episode_status'];
          synopsis: string;
          title: string;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          id?: string;
          number: number;
          project_id: string;
          status?: Database['public']['Enums']['episode_status'];
          synopsis?: string;
          title?: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          approved_at?: string | null;
          approved_by?: string | null;
          created_at?: string;
          id?: string;
          number?: number;
          project_id?: string;
          status?: Database['public']['Enums']['episode_status'];
          synopsis?: string;
          title?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'episodes_approved_by_fkey';
            columns: ['approved_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'episodes_project_id_workspace_id_fkey';
            columns: ['project_id', 'workspace_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id', 'workspace_id'];
          },
        ];
      };
      jobs: {
        Row: {
          action: string;
          attempts: number;
          billing_mode: Database['public']['Enums']['billing_mode'];
          category: Database['public']['Enums']['ai_category'] | null;
          cost: number;
          cost_breakdown: NonNullable<Json>;
          created_at: string;
          episode_id: string | null;
          error: string | null;
          finished_at: string | null;
          id: string;
          idempotency_key: string;
          input: NonNullable<Json>;
          model: string | null;
          output: Json | null;
          progress: number;
          project_id: string | null;
          provider: string | null;
          started_at: string | null;
          status: Database['public']['Enums']['job_status'];
          type: Database['public']['Enums']['job_type'];
          user_id: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          attempts?: number;
          billing_mode?: Database['public']['Enums']['billing_mode'];
          category?: Database['public']['Enums']['ai_category'] | null;
          cost?: number;
          cost_breakdown?: NonNullable<Json>;
          created_at?: string;
          episode_id?: string | null;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          idempotency_key: string;
          input?: NonNullable<Json>;
          model?: string | null;
          output?: Json | null;
          progress?: number;
          project_id?: string | null;
          provider?: string | null;
          started_at?: string | null;
          status?: Database['public']['Enums']['job_status'];
          type: Database['public']['Enums']['job_type'];
          user_id: string;
          workspace_id: string;
        };
        Update: {
          action?: string;
          attempts?: number;
          billing_mode?: Database['public']['Enums']['billing_mode'];
          category?: Database['public']['Enums']['ai_category'] | null;
          cost?: number;
          cost_breakdown?: NonNullable<Json>;
          created_at?: string;
          episode_id?: string | null;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          idempotency_key?: string;
          input?: NonNullable<Json>;
          model?: string | null;
          output?: Json | null;
          progress?: number;
          project_id?: string | null;
          provider?: string | null;
          started_at?: string | null;
          status?: Database['public']['Enums']['job_status'];
          type?: Database['public']['Enums']['job_type'];
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'jobs_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'jobs_project_id_fkey';
            columns: ['project_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'jobs_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'jobs_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      locations: {
        Row: {
          created_at: string;
          description: string;
          id: string;
          name: string;
          project_id: string;
          ref_images: NonNullable<Json>;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string;
          id?: string;
          name: string;
          project_id: string;
          ref_images?: NonNullable<Json>;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          id?: string;
          name?: string;
          project_id?: string;
          ref_images?: NonNullable<Json>;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'locations_project_id_workspace_id_fkey';
            columns: ['project_id', 'workspace_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id', 'workspace_id'];
          },
        ];
      };
      moderation_events: {
        Row: {
          categories: string[];
          created_at: string;
          excerpt: string | null;
          id: string;
          job_id: string | null;
          reviewed_at: string | null;
          reviewed_by: string | null;
          stage: string;
          user_id: string | null;
          verdict: string;
          workspace_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          categories?: string[];
          created_at?: string;
          excerpt?: string | null;
          id?: string;
          job_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          stage: string;
          user_id?: string | null;
          verdict: string;
          workspace_id?: string | null;
        };
        Update: {
          categories?: string[];
          created_at?: string;
          excerpt?: string | null;
          id?: string;
          job_id?: string | null;
          reviewed_at?: string | null;
          reviewed_by?: string | null;
          stage?: string;
          user_id?: string | null;
          verdict?: string;
          workspace_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'moderation_events_job_id_fkey';
            columns: ['job_id'];
            isOneToOne: false;
            referencedRelation: 'jobs';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moderation_events_reviewed_by_fkey';
            columns: ['reviewed_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moderation_events_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'moderation_events_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          age_confirmed_at: string | null;
          created_at: string;
          data_consent_at: string | null;
          deletion_requested_at: string | null;
          display_name: string | null;
          email: string;
          id: string;
          is_admin: boolean;
          locale: string;
          plan: Database['public']['Enums']['plan_tier'];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          age_confirmed_at?: string | null;
          created_at?: string;
          data_consent_at?: string | null;
          deletion_requested_at?: string | null;
          display_name?: string | null;
          email: string;
          id: string;
          is_admin?: boolean;
          locale?: string;
          plan?: Database['public']['Enums']['plan_tier'];
          updated_at?: string;
        };
        Update: {
          age_confirmed_at?: string | null;
          created_at?: string;
          data_consent_at?: string | null;
          deletion_requested_at?: string | null;
          display_name?: string | null;
          email?: string;
          id?: string;
          is_admin?: boolean;
          locale?: string;
          plan?: Database['public']['Enums']['plan_tier'];
          updated_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          archived_at: string | null;
          aspect_ratio: Database['public']['Enums']['aspect_ratio'];
          budget_caps: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          episode_count: number;
          format: Database['public']['Enums']['film_format'];
          genre: string;
          id: string;
          language: string;
          target_duration_sec: number;
          title: string;
          updated_at: string;
          visual_style: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          aspect_ratio?: Database['public']['Enums']['aspect_ratio'];
          budget_caps?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          episode_count?: number;
          format?: Database['public']['Enums']['film_format'];
          genre?: string;
          id?: string;
          language?: string;
          target_duration_sec?: number;
          title: string;
          updated_at?: string;
          visual_style?: string;
          workspace_id: string;
        };
        Update: {
          archived_at?: string | null;
          aspect_ratio?: Database['public']['Enums']['aspect_ratio'];
          budget_caps?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          episode_count?: number;
          format?: Database['public']['Enums']['film_format'];
          genre?: string;
          id?: string;
          language?: string;
          target_duration_sec?: number;
          title?: string;
          updated_at?: string;
          visual_style?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'projects_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'projects_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      prompt_templates: {
        Row: {
          body: string;
          created_at: string;
          format: string;
          genre: string;
          id: string;
          notes: string;
          output_schema: string | null;
          stage: string;
          version: number;
          weight: number;
        };
        ComputedFields: never;
        Insert: {
          body: string;
          created_at?: string;
          format?: string;
          genre?: string;
          id?: string;
          notes?: string;
          output_schema?: string | null;
          stage: string;
          version: number;
          weight?: number;
        };
        Update: {
          body?: string;
          created_at?: string;
          format?: string;
          genre?: string;
          id?: string;
          notes?: string;
          output_schema?: string | null;
          stage?: string;
          version?: number;
          weight?: number;
        };
        Relationships: [];
      };
      provider_settings: {
        Row: {
          category: Database['public']['Enums']['ai_category'];
          encrypted_key: string | null;
          id: string;
          key_hint: string | null;
          mode: Database['public']['Enums']['billing_mode'];
          model: string;
          provider: string;
          tier: Database['public']['Enums']['ai_tier'];
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          category: Database['public']['Enums']['ai_category'];
          encrypted_key?: string | null;
          id?: string;
          key_hint?: string | null;
          mode?: Database['public']['Enums']['billing_mode'];
          model: string;
          provider: string;
          tier?: Database['public']['Enums']['ai_tier'];
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          category?: Database['public']['Enums']['ai_category'];
          encrypted_key?: string | null;
          id?: string;
          key_hint?: string | null;
          mode?: Database['public']['Enums']['billing_mode'];
          model?: string;
          provider?: string;
          tier?: Database['public']['Enums']['ai_tier'];
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'provider_settings_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      publications: {
        Row: {
          ai_label: boolean;
          attempts: number;
          created_at: string;
          episode_id: string | null;
          error: string | null;
          id: string;
          metadata: NonNullable<Json>;
          platform: Database['public']['Enums']['platform'];
          platform_video_id: string | null;
          privacy: string;
          published_at: string | null;
          render_id: string;
          scheduled_at: string | null;
          social_account_id: string;
          status: Database['public']['Enums']['publication_status'];
          variant: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          ai_label?: boolean;
          attempts?: number;
          created_at?: string;
          episode_id?: string | null;
          error?: string | null;
          id?: string;
          metadata?: NonNullable<Json>;
          platform: Database['public']['Enums']['platform'];
          platform_video_id?: string | null;
          privacy?: string;
          published_at?: string | null;
          render_id: string;
          scheduled_at?: string | null;
          social_account_id: string;
          status?: Database['public']['Enums']['publication_status'];
          variant: string;
          workspace_id: string;
        };
        Update: {
          ai_label?: boolean;
          attempts?: number;
          created_at?: string;
          episode_id?: string | null;
          error?: string | null;
          id?: string;
          metadata?: NonNullable<Json>;
          platform?: Database['public']['Enums']['platform'];
          platform_video_id?: string | null;
          privacy?: string;
          published_at?: string | null;
          render_id?: string;
          scheduled_at?: string | null;
          social_account_id?: string;
          status?: Database['public']['Enums']['publication_status'];
          variant?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'publications_episode_id_fkey';
            columns: ['episode_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'publications_render_id_fkey';
            columns: ['render_id'];
            isOneToOne: false;
            referencedRelation: 'renders';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'publications_social_account_id_fkey';
            columns: ['social_account_id'];
            isOneToOne: false;
            referencedRelation: 'social_accounts';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'publications_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      rates: {
        Row: {
          category: Database['public']['Enums']['ai_category'];
          credits_per_unit: number;
          tier: Database['public']['Enums']['ai_tier'];
          unit_label: string;
          updated_at: string;
          updated_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          category: Database['public']['Enums']['ai_category'];
          credits_per_unit: number;
          tier: Database['public']['Enums']['ai_tier'];
          unit_label: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          category?: Database['public']['Enums']['ai_category'];
          credits_per_unit?: number;
          tier?: Database['public']['Enums']['ai_tier'];
          unit_label?: string;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'rates_updated_by_fkey';
            columns: ['updated_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      renders: {
        Row: {
          aspect_ratio: Database['public']['Enums']['aspect_ratio'];
          created_at: string;
          duration_sec: number | null;
          episode_id: string;
          error: string | null;
          finished_at: string | null;
          id: string;
          progress: number;
          resolution: string;
          status: Database['public']['Enums']['asset_status'];
          timeline_id: string | null;
          url: string | null;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          aspect_ratio: Database['public']['Enums']['aspect_ratio'];
          created_at?: string;
          duration_sec?: number | null;
          episode_id: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          progress?: number;
          resolution: string;
          status?: Database['public']['Enums']['asset_status'];
          timeline_id?: string | null;
          url?: string | null;
          workspace_id: string;
        };
        Update: {
          aspect_ratio?: Database['public']['Enums']['aspect_ratio'];
          created_at?: string;
          duration_sec?: number | null;
          episode_id?: string;
          error?: string | null;
          finished_at?: string | null;
          id?: string;
          progress?: number;
          resolution?: string;
          status?: Database['public']['Enums']['asset_status'];
          timeline_id?: string | null;
          url?: string | null;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'renders_episode_id_workspace_id_fkey';
            columns: ['episode_id', 'workspace_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id', 'workspace_id'];
          },
          {
            foreignKeyName: 'renders_timeline_id_fkey';
            columns: ['timeline_id'];
            isOneToOne: false;
            referencedRelation: 'timelines';
            referencedColumns: ['id'];
          },
        ];
      };
      scripts: {
        Row: {
          content: NonNullable<Json>;
          created_at: string;
          created_by: string | null;
          episode_id: string;
          id: string;
          note: string;
          version: number;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          content: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          episode_id: string;
          id?: string;
          note?: string;
          version: number;
          workspace_id: string;
        };
        Update: {
          content?: NonNullable<Json>;
          created_at?: string;
          created_by?: string | null;
          episode_id?: string;
          id?: string;
          note?: string;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'scripts_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'scripts_episode_id_workspace_id_fkey';
            columns: ['episode_id', 'workspace_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id', 'workspace_id'];
          },
        ];
      };
      series_bible: {
        Row: {
          continuity_facts: NonNullable<Json>;
          logline: string;
          premise: string;
          project_id: string;
          research: string;
          rules: NonNullable<Json>;
          tone: string;
          topic: string;
          updated_at: string;
          workspace_id: string;
          world: string;
        };
        ComputedFields: never;
        Insert: {
          continuity_facts?: NonNullable<Json>;
          logline?: string;
          premise?: string;
          project_id: string;
          research?: string;
          rules?: NonNullable<Json>;
          tone?: string;
          topic?: string;
          updated_at?: string;
          workspace_id: string;
          world?: string;
        };
        Update: {
          continuity_facts?: NonNullable<Json>;
          logline?: string;
          premise?: string;
          project_id?: string;
          research?: string;
          rules?: NonNullable<Json>;
          tone?: string;
          topic?: string;
          updated_at?: string;
          workspace_id?: string;
          world?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'series_bible_project_id_workspace_id_fkey';
            columns: ['project_id', 'workspace_id'];
            isOneToOne: false;
            referencedRelation: 'projects';
            referencedColumns: ['id', 'workspace_id'];
          },
        ];
      };
      shots: {
        Row: {
          approved: boolean;
          camera: string;
          character_ids: string[];
          clip_progress: number;
          clip_status: Database['public']['Enums']['asset_status'];
          clip_url: string | null;
          created_at: string;
          description: string;
          dialog: string | null;
          duration_sec: number;
          episode_id: string;
          id: string;
          keyframe_status: Database['public']['Enums']['asset_status'];
          keyframe_url: string | null;
          order_index: number;
          prompt: string;
          scene_no: number;
          shot_type: string;
          updated_at: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          approved?: boolean;
          camera?: string;
          character_ids?: string[];
          clip_progress?: number;
          clip_status?: Database['public']['Enums']['asset_status'];
          clip_url?: string | null;
          created_at?: string;
          description?: string;
          dialog?: string | null;
          duration_sec: number;
          episode_id: string;
          id?: string;
          keyframe_status?: Database['public']['Enums']['asset_status'];
          keyframe_url?: string | null;
          order_index: number;
          prompt?: string;
          scene_no: number;
          shot_type: string;
          updated_at?: string;
          workspace_id: string;
        };
        Update: {
          approved?: boolean;
          camera?: string;
          character_ids?: string[];
          clip_progress?: number;
          clip_status?: Database['public']['Enums']['asset_status'];
          clip_url?: string | null;
          created_at?: string;
          description?: string;
          dialog?: string | null;
          duration_sec?: number;
          episode_id?: string;
          id?: string;
          keyframe_status?: Database['public']['Enums']['asset_status'];
          keyframe_url?: string | null;
          order_index?: number;
          prompt?: string;
          scene_no?: number;
          shot_type?: string;
          updated_at?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'shots_episode_id_workspace_id_fkey';
            columns: ['episode_id', 'workspace_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id', 'workspace_id'];
          },
        ];
      };
      social_accounts: {
        Row: {
          audited: boolean;
          avatar_url: string | null;
          channel_id: string;
          channel_name: string;
          created_at: string;
          encrypted_tokens: string;
          id: string;
          last_error: string | null;
          platform: Database['public']['Enums']['platform'];
          scopes: string[];
          status: Database['public']['Enums']['connection_status'];
          token_expires_at: string | null;
          updated_at: string;
          user_id: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          audited?: boolean;
          avatar_url?: string | null;
          channel_id: string;
          channel_name?: string;
          created_at?: string;
          encrypted_tokens: string;
          id?: string;
          last_error?: string | null;
          platform: Database['public']['Enums']['platform'];
          scopes?: string[];
          status?: Database['public']['Enums']['connection_status'];
          token_expires_at?: string | null;
          updated_at?: string;
          user_id: string;
          workspace_id: string;
        };
        Update: {
          audited?: boolean;
          avatar_url?: string | null;
          channel_id?: string;
          channel_name?: string;
          created_at?: string;
          encrypted_tokens?: string;
          id?: string;
          last_error?: string | null;
          platform?: Database['public']['Enums']['platform'];
          scopes?: string[];
          status?: Database['public']['Enums']['connection_status'];
          token_expires_at?: string | null;
          updated_at?: string;
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'social_accounts_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'social_accounts_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      timelines: {
        Row: {
          created_at: string;
          created_by: string | null;
          data: NonNullable<Json>;
          episode_id: string;
          id: string;
          note: string;
          source: string;
          version: number;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          created_by?: string | null;
          data: NonNullable<Json>;
          episode_id: string;
          id?: string;
          note?: string;
          source?: string;
          version: number;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          created_by?: string | null;
          data?: NonNullable<Json>;
          episode_id?: string;
          id?: string;
          note?: string;
          source?: string;
          version?: number;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'timelines_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'timelines_episode_id_workspace_id_fkey';
            columns: ['episode_id', 'workspace_id'];
            isOneToOne: false;
            referencedRelation: 'episodes';
            referencedColumns: ['id', 'workspace_id'];
          },
        ];
      };
      topup_orders: {
        Row: {
          amount_idr: number;
          created_at: string;
          credits: number;
          gateway: string;
          gateway_ref: string | null;
          id: string;
          pack_id: string;
          paid_at: string | null;
          payment_method: string | null;
          status: Database['public']['Enums']['order_status'];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_idr: number;
          created_at?: string;
          credits: number;
          gateway: string;
          gateway_ref?: string | null;
          id?: string;
          pack_id: string;
          paid_at?: string | null;
          payment_method?: string | null;
          status?: Database['public']['Enums']['order_status'];
          user_id: string;
        };
        Update: {
          amount_idr?: number;
          created_at?: string;
          credits?: number;
          gateway?: string;
          gateway_ref?: string | null;
          id?: string;
          pack_id?: string;
          paid_at?: string | null;
          payment_method?: string | null;
          status?: Database['public']['Enums']['order_status'];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'topup_orders_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      workspace_members: {
        Row: {
          created_at: string;
          role: Database['public']['Enums']['workspace_role'];
          user_id: string;
          workspace_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          role?: Database['public']['Enums']['workspace_role'];
          user_id: string;
          workspace_id: string;
        };
        Update: {
          created_at?: string;
          role?: Database['public']['Enums']['workspace_role'];
          user_id?: string;
          workspace_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspace_members_user_id_fkey';
            columns: ['user_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'workspace_members_workspace_id_fkey';
            columns: ['workspace_id'];
            isOneToOne: false;
            referencedRelation: 'workspaces';
            referencedColumns: ['id'];
          },
        ];
      };
      workspaces: {
        Row: {
          brand_kit: NonNullable<Json>;
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          brand_kit?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          brand_kit?: NonNullable<Json>;
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'workspaces_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      _allocate_credits: {
        Args: { p_amount: number; p_job_id: string; p_now: string; p_user_id: string };
        Returns: undefined;
      };
      can_edit_workspace: { Args: { ws: string }; Returns: boolean };
      charge_and_enqueue: {
        Args: {
          p_action: string;
          p_billing: Json;
          p_episode_id: string;
          p_expected_total?: number;
          p_idempotency_key: string;
          p_input: Json;
          p_items: Json;
          p_model: string;
          p_now?: string;
          p_project_id: string;
          p_provider: string;
          p_type: Database['public']['Enums']['job_type'];
          p_user_id: string;
          p_workspace_id: string;
        };
        Returns: {
          action: string;
          attempts: number;
          billing_mode: Database['public']['Enums']['billing_mode'];
          category: Database['public']['Enums']['ai_category'] | null;
          cost: number;
          cost_breakdown: NonNullable<Json>;
          created_at: string;
          episode_id: string | null;
          error: string | null;
          finished_at: string | null;
          id: string;
          idempotency_key: string;
          input: NonNullable<Json>;
          model: string | null;
          output: Json | null;
          progress: number;
          project_id: string | null;
          provider: string | null;
          started_at: string | null;
          status: Database['public']['Enums']['job_status'];
          type: Database['public']['Enums']['job_type'];
          user_id: string;
          workspace_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'jobs';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      compute_cost: { Args: { p_billing?: Json; p_items: Json }; Returns: Json };
      credit_topup: {
        Args: {
          p_amount: number;
          p_description?: string;
          p_now?: string;
          p_reference: string;
          p_user_id: string;
        };
        Returns: string;
      };
      dearmor: { Args: { '': string }; Returns: string };
      expire_due_credits: { Args: { p_now?: string; p_user_id: string }; Returns: number };
      gen_random_uuid: { Args: Record<PropertyKey, never>; Returns: string };
      gen_salt: { Args: { '': string }; Returns: string };
      is_workspace_member: { Args: { ws: string }; Returns: boolean };
      job_fail: { Args: { p_error: string; p_job_id: string }; Returns: number };
      job_finish_partial: {
        Args: { p_job_id: string; p_output: Json; p_reason?: string; p_refund: number };
        Returns: number;
      };
      job_mark_running: {
        Args: { p_job_id: string };
        Returns: {
          action: string;
          attempts: number;
          billing_mode: Database['public']['Enums']['billing_mode'];
          category: Database['public']['Enums']['ai_category'] | null;
          cost: number;
          cost_breakdown: NonNullable<Json>;
          created_at: string;
          episode_id: string | null;
          error: string | null;
          finished_at: string | null;
          id: string;
          idempotency_key: string;
          input: NonNullable<Json>;
          model: string | null;
          output: Json | null;
          progress: number;
          project_id: string | null;
          provider: string | null;
          started_at: string | null;
          status: Database['public']['Enums']['job_status'];
          type: Database['public']['Enums']['job_type'];
          user_id: string;
          workspace_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'jobs';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      job_progress: { Args: { p_job_id: string; p_progress: number }; Returns: undefined };
      job_succeed: {
        Args: { p_job_id: string; p_output: Json };
        Returns: {
          action: string;
          attempts: number;
          billing_mode: Database['public']['Enums']['billing_mode'];
          category: Database['public']['Enums']['ai_category'] | null;
          cost: number;
          cost_breakdown: NonNullable<Json>;
          created_at: string;
          episode_id: string | null;
          error: string | null;
          finished_at: string | null;
          id: string;
          idempotency_key: string;
          input: NonNullable<Json>;
          model: string | null;
          output: Json | null;
          progress: number;
          project_id: string | null;
          provider: string | null;
          started_at: string | null;
          status: Database['public']['Enums']['job_status'];
          type: Database['public']['Enums']['job_type'];
          user_id: string;
          workspace_id: string;
        };
        SetofOptions: {
          from: '*';
          to: 'jobs';
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      pgp_armor_headers: { Args: { '': string }; Returns: Record<string, unknown>[] };
      refund_job: { Args: { p_job_id: string; p_reason?: string }; Returns: number };
      spendable_credits: { Args: { p_now?: string; p_user_id: string }; Returns: number };
      usage_by_category: { Args: { p_since?: string; p_user_id: string }; Returns: Json };
      users_with_due_credits: { Args: { p_now?: string }; Returns: string[] };
    };
    Enums: {
      ai_category: 'naskah' | 'vo' | 'image' | 'video';
      ai_tier: 'hemat' | 'standar' | 'premium';
      aspect_ratio: '9:16' | '16:9' | '1:1';
      asset_status: 'empty' | 'queued' | 'running' | 'ready' | 'failed';
      audio_type: 'dialog' | 'vo' | 'music' | 'sfx';
      billing_mode: 'saldo' | 'byok';
      connection_status: 'active' | 'expired' | 'revoked' | 'error';
      episode_status: 'draft' | 'script' | 'storyboard' | 'render' | 'edit' | 'ready' | 'published';
      film_format: 'microdrama' | 'film_pendek' | 'serial' | 'dokumenter' | 'iklan' | 'animasi';
      job_status: 'queued' | 'running' | 'succeeded' | 'failed' | 'refunded' | 'canceled';
      job_type: 'text' | 'image' | 'video' | 'vo' | 'stt' | 'render' | 'publish' | 'moderation';
      ledger_type: 'topup' | 'usage' | 'refund' | 'expire' | 'adjustment';
      order_status: 'pending' | 'paid' | 'expired' | 'failed';
      plan_tier: 'free' | 'creator' | 'pro' | 'studio';
      platform: 'youtube' | 'tiktok';
      publication_status: 'queued' | 'uploading' | 'processing' | 'published' | 'failed' | 'canceled';
      workspace_role: 'owner' | 'admin' | 'editor' | 'viewer';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema['Tables'] & DefaultSchema['Views']) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema['CompositeTypes'] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      ai_category: ['naskah', 'vo', 'image', 'video'],
      ai_tier: ['hemat', 'standar', 'premium'],
      aspect_ratio: ['9:16', '16:9', '1:1'],
      asset_status: ['empty', 'queued', 'running', 'ready', 'failed'],
      audio_type: ['dialog', 'vo', 'music', 'sfx'],
      billing_mode: ['saldo', 'byok'],
      connection_status: ['active', 'expired', 'revoked', 'error'],
      episode_status: ['draft', 'script', 'storyboard', 'render', 'edit', 'ready', 'published'],
      film_format: ['microdrama', 'film_pendek', 'serial', 'dokumenter', 'iklan', 'animasi'],
      job_status: ['queued', 'running', 'succeeded', 'failed', 'refunded', 'canceled'],
      job_type: ['text', 'image', 'video', 'vo', 'stt', 'render', 'publish', 'moderation'],
      ledger_type: ['topup', 'usage', 'refund', 'expire', 'adjustment'],
      order_status: ['pending', 'paid', 'expired', 'failed'],
      plan_tier: ['free', 'creator', 'pro', 'studio'],
      platform: ['youtube', 'tiktok'],
      publication_status: ['queued', 'uploading', 'processing', 'published', 'failed', 'canceled'],
      workspace_role: ['owner', 'admin', 'editor', 'viewer'],
    },
  },
} as const;
