// Hand-written scaffold matching supabase/migrations/20260725163230_init_schema.sql.
// Once the project is linked, prefer regenerating this with:
//   npx supabase gen types typescript --project-id <ref> > types/database.ts

export type DealStatus = 'pending' | 'approved' | 'rejected';
export type StapleCategory = 'base_staple' | 'rounding_out_extra';
export type RecipeSource = 'ai_generated' | 'manual';

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: {
          id: string;
          chain_name: string;
          banner: string | null;
          address: string;
          lat: number | null;
          lng: number | null;
          hours: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: Partial<Database['public']['Tables']['stores']['Row']> &
          Pick<Database['public']['Tables']['stores']['Row'], 'chain_name' | 'address'>;
        Update: Partial<Database['public']['Tables']['stores']['Row']>;
      };
      curated_deals: {
        Row: {
          id: string;
          chain_name: string;
          item_name: string;
          category: string | null;
          price: number;
          original_price: number;
          discount_pct: number;
          product_url: string;
          flyer_valid_from: string;
          flyer_valid_to: string;
          image_url: string | null;
          status: DealStatus;
          reviewed_by: string | null;
          reviewed_at: string | null;
          created_at: string;
        };
        Insert: Omit<
          Database['public']['Tables']['curated_deals']['Row'],
          'id' | 'discount_pct' | 'created_at'
        > & { id?: string };
        Update: Partial<Database['public']['Tables']['curated_deals']['Insert']>;
      };
      staple_reference_prices: {
        Row: {
          id: string;
          ingredient_name: string;
          category: StapleCategory;
          avg_price: number;
          unit: string;
          last_checked_at: string;
          checked_by: string | null;
        };
        Insert: Omit<Database['public']['Tables']['staple_reference_prices']['Row'], 'id'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['staple_reference_prices']['Insert']>;
      };
      sessions: {
        Row: {
          id: string;
          agreed_to_terms_at: string | null;
          terms_version: string | null;
          linked_user_id: string | null;
          created_at: string;
        };
        Insert: Pick<Database['public']['Tables']['sessions']['Row'], 'id'> &
          Partial<Database['public']['Tables']['sessions']['Row']>;
        Update: Partial<Database['public']['Tables']['sessions']['Row']>;
      };
      users: {
        Row: {
          id: string;
          email: string | null;
          agreed_to_terms_at: string | null;
          terms_version: string | null;
          notification_prefs: Record<string, unknown>;
          created_at: string;
        };
        Insert: Pick<Database['public']['Tables']['users']['Row'], 'id'> &
          Partial<Database['public']['Tables']['users']['Row']>;
        Update: Partial<Database['public']['Tables']['users']['Row']>;
      };
      meal_plans: {
        Row: {
          id: string;
          user_id: string | null;
          session_id: string | null;
          store_ids: string[];
          combined_exclusions: string[];
          cost_diversity_slider: number;
          generated_meals: unknown | null;
          projected_total_price: number | null;
          projected_price_per_meal: number | null;
          estimated_baseline_price: number | null;
          generated_at: string | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['meal_plans']['Row'], 'id' | 'created_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['meal_plans']['Insert']>;
      };
      household_members: {
        Row: {
          id: string;
          meal_plan_id: string;
          label: string;
          target_calories: number | null;
          target_macros: Record<string, unknown> | null;
          exclusions: string[];
        };
        Insert: Omit<Database['public']['Tables']['household_members']['Row'], 'id'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['household_members']['Insert']>;
      };
      recipes: {
        Row: {
          id: string;
          name: string;
          ingredients: unknown;
          instructions: unknown;
          tag: string | null;
          calories: number | null;
          protein: number | null;
          minutes: number | null;
          price: number | null;
          source: RecipeSource;
          source_deal_ids: string[] | null;
          created_at: string;
        };
        Insert: Omit<Database['public']['Tables']['recipes']['Row'], 'id' | 'created_at'> & {
          id?: string;
        };
        Update: Partial<Database['public']['Tables']['recipes']['Insert']>;
      };
      saved_recipes: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          ingredients: unknown;
          macros: Record<string, unknown> | null;
          calories: number | null;
          saved_at: string;
        };
        Insert: Omit<Database['public']['Tables']['saved_recipes']['Row'], 'id' | 'saved_at'> & {
          id?: string;
          saved_at?: string;
        };
        Update: Partial<Database['public']['Tables']['saved_recipes']['Insert']>;
      };
    };
  };
}
